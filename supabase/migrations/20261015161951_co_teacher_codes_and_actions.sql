-- Run AFTER 20261008000000_co_teachers.sql and 20261008010000_co_teacher_approval.sql.
-- 1) Each class gets its own CO-TEACHER code (separate from the student join code).
-- 2) Co-teacher notifications become actionable (Approve / Decline inside the bell).

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS ref_id uuid;

-- Codes live in their own table so students/co-teachers (who can read the class row) never see them.
CREATE TABLE IF NOT EXISTS public.class_co_teacher_codes (
  class_id uuid PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.class_co_teacher_codes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.class_co_teacher_codes TO service_role;
-- No policies and no grants for authenticated: only the SECURITY DEFINER functions below can touch it.

CREATE OR REPLACE FUNCTION public._new_co_teacher_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
  i int;
BEGIN
  LOOP
    c := '';
    FOR i IN 1..6 LOOP
      c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.class_co_teacher_codes WHERE code = c) THEN
      RETURN c;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._new_co_teacher_code() FROM PUBLIC, anon, authenticated;

-- The class owner (or admin) reads the code; it is created on first use.
CREATE OR REPLACE FUNCTION public.get_co_teacher_code(_class_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  owner uuid;
  existing text;
  fresh text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT teacher_id INTO owner FROM public.classes WHERE id = _class_id;
  IF owner IS NULL THEN RAISE EXCEPTION 'Class not found'; END IF;
  IF NOT (owner = uid OR public.has_role(uid, 'admin')) THEN
    RAISE EXCEPTION 'Only the class owner can see the co-teacher code';
  END IF;

  SELECT code INTO existing FROM public.class_co_teacher_codes WHERE class_id = _class_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  fresh := public._new_co_teacher_code();
  INSERT INTO public.class_co_teacher_codes (class_id, code) VALUES (_class_id, fresh)
  ON CONFLICT (class_id) DO NOTHING;
  SELECT code INTO existing FROM public.class_co_teacher_codes WHERE class_id = _class_id;
  RETURN existing;
END;
$$;

-- Generates a brand-new code; the old one stops working immediately.
CREATE OR REPLACE FUNCTION public.regenerate_co_teacher_code(_class_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  owner uuid;
  fresh text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT teacher_id INTO owner FROM public.classes WHERE id = _class_id;
  IF owner IS NULL THEN RAISE EXCEPTION 'Class not found'; END IF;
  IF NOT (owner = uid OR public.has_role(uid, 'admin')) THEN
    RAISE EXCEPTION 'Only the class owner can change the co-teacher code';
  END IF;

  fresh := public._new_co_teacher_code();
  INSERT INTO public.class_co_teacher_codes (class_id, code) VALUES (_class_id, fresh)
  ON CONFLICT (class_id) DO UPDATE SET code = EXCLUDED.code, created_at = now();
  RETURN fresh;
END;
$$;

-- A teacher requests co-teacher access using the class's CO-TEACHER code (the student code no longer works here).
CREATE OR REPLACE FUNCTION public.request_co_teacher_access(_code text, _full_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cid uuid;
  owner uuid;
  cname text;
  nm text;
  existing text;
  rid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(uid, 'teacher') OR public.has_role(uid, 'admin')) THEN
    RAISE EXCEPTION 'Only teachers can join a class as co-teacher';
  END IF;

  SELECT c.id, c.teacher_id, c.name INTO cid, owner, cname
  FROM public.class_co_teacher_codes k
  JOIN public.classes c ON c.id = k.class_id
  WHERE k.code = upper(btrim(_code)) AND c.archived = false;
  IF cid IS NULL THEN RAISE EXCEPTION 'Invalid co-teacher code'; END IF;
  IF owner = uid THEN RAISE EXCEPTION 'You already own this class'; END IF;

  IF EXISTS (SELECT 1 FROM public.class_members WHERE class_id = cid AND student_id = uid) THEN
    RETURN 'member';
  END IF;

  SELECT status INTO existing FROM public.class_co_teacher_requests WHERE class_id = cid AND user_id = uid;
  IF existing = 'pending' THEN RETURN 'pending'; END IF;
  IF existing = 'declined' THEN
    RAISE EXCEPTION 'The class owner declined your earlier request for this class.';
  END IF;

  nm := coalesce(
    nullif(btrim(coalesce(_full_name, '')), ''),
    (SELECT p.full_name FROM public.profiles p WHERE p.id = uid),
    'A teacher');

  INSERT INTO public.class_co_teacher_requests (class_id, user_id, full_name, status)
  VALUES (cid, uid, nm, 'pending')
  ON CONFLICT (class_id, user_id)
  DO UPDATE SET status = 'pending', full_name = EXCLUDED.full_name, created_at = now(), decided_at = NULL
  RETURNING id INTO rid;

  INSERT INTO public.notifications (user_id, title, body, kind, link, ref_id)
  VALUES (owner, 'Co-teacher request', nm || ' asked to join ' || cname || ' as a co-teacher.',
          'co_teacher_request', '/classes/' || cid::text, rid);

  RETURN 'pending';
END;
$$;

-- Approve / decline (also marks the owner's notification as read).
CREATE OR REPLACE FUNCTION public.respond_co_teacher_request(_request_id uuid, _approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  r public.class_co_teacher_requests%ROWTYPE;
  owner uuid;
  cname text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO r FROM public.class_co_teacher_requests WHERE id = _request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;

  SELECT teacher_id, name INTO owner, cname FROM public.classes WHERE id = r.class_id;
  IF NOT (owner = uid OR public.has_role(uid, 'admin')) THEN
    RAISE EXCEPTION 'Only the class owner can respond to co-teacher requests';
  END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'This request has already been handled'; END IF;

  IF _approve THEN
    IF NOT (public.has_role(r.user_id, 'teacher') OR public.has_role(r.user_id, 'admin')) THEN
      RAISE EXCEPTION 'This user is no longer a teacher';
    END IF;
    INSERT INTO public.class_members (class_id, student_id, full_name, member_role)
    VALUES (r.class_id, r.user_id, r.full_name, 'teacher')
    ON CONFLICT (class_id, student_id) DO NOTHING;
    UPDATE public.class_co_teacher_requests SET status = 'approved', decided_at = now() WHERE id = r.id;
    INSERT INTO public.notifications (user_id, title, body, kind, link)
    VALUES (r.user_id, 'Co-teacher request approved',
            'You are now a co-teacher of ' || cname || '.', 'class', '/classes/' || r.class_id::text);
  ELSE
    UPDATE public.class_co_teacher_requests SET status = 'declined', decided_at = now() WHERE id = r.id;
    INSERT INTO public.notifications (user_id, title, body, kind, link)
    VALUES (r.user_id, 'Co-teacher request declined',
            'Your request to co-teach ' || cname || ' was declined.', 'class', '/classes');
  END IF;

  UPDATE public.notifications SET read_at = coalesce(read_at, now())
  WHERE kind = 'co_teacher_request' AND ref_id = r.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_co_teacher_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_co_teacher_code(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.regenerate_co_teacher_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_co_teacher_code(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_co_teacher_access(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_co_teacher_access(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.respond_co_teacher_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_co_teacher_request(uuid, boolean) TO authenticated, service_role;
