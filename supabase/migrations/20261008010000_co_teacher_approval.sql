-- Co-teacher APPROVAL: joining with a code only sends a request; the class owner
-- must approve it before the teacher becomes a co-teacher.

CREATE TABLE IF NOT EXISTS public.class_co_teacher_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (class_id, user_id)
);
ALTER TABLE public.class_co_teacher_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.class_co_teacher_requests TO authenticated;
GRANT ALL ON public.class_co_teacher_requests TO service_role;

-- Read-only from the client: requester, class owner, or admin. All writes go through the RPCs below.
DROP POLICY IF EXISTS cotr_read ON public.class_co_teacher_requests;
CREATE POLICY cotr_read ON public.class_co_teacher_requests FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid())
  );

-- Teachers can no longer be added straight into a class by code. (Students still join directly.)
CREATE OR REPLACE FUNCTION public.join_class_by_code(_code text, _full_name text, _roll_no text, _er_no text, _sr_no text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
  owner uuid;
  uid uuid := auth.uid();
  is_staff boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id, teacher_id INTO cid, owner FROM public.classes
   WHERE upper(join_code) = upper(btrim(_code)) AND archived = false;
  IF cid IS NULL THEN RAISE EXCEPTION 'Invalid join code'; END IF;

  is_staff := public.has_role(uid, 'teacher') OR public.has_role(uid, 'admin');

  IF owner = uid THEN
    RAISE EXCEPTION 'You already own this class';
  END IF;

  IF EXISTS (SELECT 1 FROM public.class_members WHERE class_id = cid AND student_id = uid) THEN
    RETURN cid;
  END IF;

  IF is_staff THEN
    RAISE EXCEPTION 'Teachers join as co-teacher: send a request and wait for the class owner to approve it.';
  END IF;

  IF btrim(coalesce(_full_name,'')) = '' THEN RAISE EXCEPTION 'Full name is required'; END IF;
  IF btrim(coalesce(_roll_no,'')) = ''
     AND btrim(coalesce(_er_no,'')) = ''
     AND btrim(coalesce(_sr_no,'')) = '' THEN
    RAISE EXCEPTION 'Provide at least one of Roll No., ER No. or Sr No.';
  END IF;

  BEGIN
    INSERT INTO public.class_members (class_id, student_id, full_name, roll_no, er_no, sr_no, member_role)
    VALUES (cid, uid, btrim(_full_name),
            nullif(btrim(coalesce(_roll_no,'')), ''),
            nullif(btrim(coalesce(_er_no,'')), ''),
            nullif(btrim(coalesce(_sr_no,'')), ''),
            'student');
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM LIKE '%class_members_roll_uniq%' THEN
      RAISE EXCEPTION 'This Roll No. is already registered in this class.';
    ELSIF SQLERRM LIKE '%class_members_er_uniq%' THEN
      RAISE EXCEPTION 'This ER No. is already registered in this class.';
    ELSIF SQLERRM LIKE '%class_members_sr_uniq%' THEN
      RAISE EXCEPTION 'This Sr No. is already registered in this class.';
    ELSIF SQLERRM LIKE '%class_members_name_uniq%' THEN
      RAISE EXCEPTION 'A student with this name is already registered in this class.';
    ELSE
      RAISE EXCEPTION 'You are already registered in this class.';
    END IF;
  END;

  RETURN cid;
END;
$$;
REVOKE ALL ON FUNCTION public.join_class_by_code(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_class_by_code(text, text, text, text, text) TO authenticated, service_role;

-- A teacher asks to become a co-teacher. Returns 'pending' or 'member'.
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
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(uid, 'teacher') OR public.has_role(uid, 'admin')) THEN
    RAISE EXCEPTION 'Only teachers can join a class as co-teacher';
  END IF;

  SELECT id, teacher_id, name INTO cid, owner, cname FROM public.classes
   WHERE upper(join_code) = upper(btrim(_code)) AND archived = false;
  IF cid IS NULL THEN RAISE EXCEPTION 'Invalid join code'; END IF;
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
  DO UPDATE SET status = 'pending', full_name = EXCLUDED.full_name, created_at = now(), decided_at = NULL;

  INSERT INTO public.notifications (user_id, title, body, kind, link)
  VALUES (owner, 'Co-teacher request', nm || ' asked to join ' || cname || ' as a co-teacher.',
          'class', '/classes/' || cid::text);

  RETURN 'pending';
END;
$$;

-- The class OWNER (or an admin) approves or declines a request.
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
END;
$$;

REVOKE ALL ON FUNCTION public.request_co_teacher_access(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_co_teacher_access(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.respond_co_teacher_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_co_teacher_request(uuid, boolean) TO authenticated, service_role;

-- Co-teachers can remove students (or leave themselves) but cannot remove other teachers;
-- only the class owner can remove a co-teacher.
DROP POLICY IF EXISTS "members_delete" ON public.class_members;
CREATE POLICY "members_delete" ON public.class_members FOR DELETE TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid())
    OR (public.is_class_teacher(class_id, auth.uid()) AND member_role = 'student')
  );
