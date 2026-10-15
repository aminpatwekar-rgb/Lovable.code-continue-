-- Institution join links.
-- 1) Link people to institutions by ID (profiles.institution_id) while keeping the
--    legacy profiles.institution name in sync for display and older code paths.
-- 2) One student link and one teacher link per institution. The link decides the
--    role; neither link can ever create an administrator.
-- 3) Teacher joins wait for institution-admin approval by default; students join instantly.

-- ---------------------------------------------------------------------------
-- 1. profiles.institution_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES public.institutions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_institution_id_idx ON public.profiles (institution_id);

-- Backfill from the existing name match (before the guard trigger exists).
UPDATE public.profiles p
SET institution_id = i.id
FROM public.institutions i
WHERE p.institution_id IS NULL
  AND p.institution IS NOT NULL
  AND lower(trim(p.institution)) = lower(trim(i.name));

GRANT SELECT (institution_id) ON public.profiles TO authenticated;

-- Keep id and name in sync, and stop people editing their own institution directly.
-- Membership now changes only through join links, administrators, or service-role code.
CREATE OR REPLACE FUNCTION public.sync_profile_institution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_id uuid := NULL;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.institution_id IS NOT DISTINCT FROM OLD.institution_id
       AND NEW.institution IS NOT DISTINCT FROM OLD.institution THEN
      RETURN NEW;
    END IF;

    IF auth.uid() IS NOT NULL
       AND COALESCE(current_setting('onyx.institution_write', true), '') <> 'on'
       AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Institution membership is managed through your institution''s join link';
    END IF;
    old_id := OLD.institution_id;
  END IF;

  IF NEW.institution_id IS DISTINCT FROM old_id THEN
    -- The id changed: it is the source of truth for the name.
    IF NEW.institution_id IS NULL THEN
      NEW.institution := NULL;
    ELSE
      SELECT i.name INTO NEW.institution FROM public.institutions i WHERE i.id = NEW.institution_id;
    END IF;
  ELSE
    -- Only the name changed: resolve it to an institution (or none).
    NEW.institution_id := (
      SELECT i.id FROM public.institutions i
      WHERE lower(trim(i.name)) = lower(trim(NEW.institution))
      LIMIT 1
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_institution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_sync_institution ON public.profiles;
CREATE TRIGGER profiles_sync_institution
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_institution();

-- Renaming an institution renames the label on every member's profile.
CREATE OR REPLACE FUNCTION public.sync_institution_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM set_config('onyx.institution_write', 'on', true);
    UPDATE public.profiles
    SET institution = NEW.name
    WHERE institution_id = NEW.id AND institution IS DISTINCT FROM NEW.name;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_institution_rename() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS institutions_sync_rename ON public.institutions;
CREATE TRIGGER institutions_sync_rename
  AFTER UPDATE OF name ON public.institutions
  FOR EACH ROW EXECUTE FUNCTION public.sync_institution_rename();

-- Institution admin scope now follows the ID link instead of a typed name.
CREATE OR REPLACE FUNCTION public.is_institution_admin(_institution_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND auth.uid() IS NOT NULL
      AND ur.role::text = 'institution_admin'
      AND p.institution_id = _institution_id
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Join links and join requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.institution_join_links (
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('student', 'teacher')),
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  requires_approval boolean NOT NULL,
  expires_at timestamptz,
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institution_id, role)
);
ALTER TABLE public.institution_join_links ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.institution_join_links TO service_role;
-- No grants or policies for authenticated/anon: codes are only reachable through the functions below.

CREATE TABLE IF NOT EXISTS public.institution_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('student', 'teacher')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS institution_join_requests_one_pending
  ON public.institution_join_requests (institution_id, user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS institution_join_requests_institution_idx
  ON public.institution_join_requests (institution_id, status);

ALTER TABLE public.institution_join_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.institution_join_requests TO authenticated;
GRANT ALL ON public.institution_join_requests TO service_role;
DROP POLICY IF EXISTS institution_join_requests_own_read ON public.institution_join_requests;
CREATE POLICY institution_join_requests_own_read
  ON public.institution_join_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._can_manage_institution(_institution_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (public.has_role(auth.uid(), 'admin') OR public.is_institution_admin(_institution_id));
$$;
REVOKE ALL ON FUNCTION public._can_manage_institution(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._new_institution_join_code()
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
    FOR i IN 1..8 LOOP
      c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.institution_join_links l WHERE l.code = c) THEN
      RETURN c;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._new_institution_join_code() FROM PUBLIC, anon, authenticated;

-- Returns both links for an institution, creating them on first use.
CREATE OR REPLACE FUNCTION public.get_institution_join_links(_institution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  r text;
BEGIN
  IF NOT public._can_manage_institution(_institution_id) THEN
    RAISE EXCEPTION 'You cannot manage join links for this institution';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.institutions i WHERE i.id = _institution_id) THEN
    RAISE EXCEPTION 'Institution not found';
  END IF;

  FOREACH r IN ARRAY ARRAY['student', 'teacher'] LOOP
    INSERT INTO public.institution_join_links (institution_id, role, code, requires_approval)
    VALUES (_institution_id, r, public._new_institution_join_code(), r = 'teacher')
    ON CONFLICT ON CONSTRAINT institution_join_links_pkey DO NOTHING;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'role', l.role,
    'code', l.code,
    'isActive', l.is_active,
    'requiresApproval', l.requires_approval,
    'expiresAt', l.expires_at,
    'maxUses', l.max_uses,
    'useCount', l.use_count
  ) ORDER BY l.role DESC), '[]'::jsonb)
  INTO result
  FROM public.institution_join_links l
  WHERE l.institution_id = _institution_id;

  RETURN result;
END;
$$;

-- New code; the old link stops working immediately.
CREATE OR REPLACE FUNCTION public.regenerate_institution_join_link(_institution_id uuid, _role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fresh text;
BEGIN
  IF NOT public._can_manage_institution(_institution_id) THEN
    RAISE EXCEPTION 'You cannot manage join links for this institution';
  END IF;
  IF _role NOT IN ('student', 'teacher') THEN
    RAISE EXCEPTION 'Role must be student or teacher';
  END IF;

  PERFORM public.get_institution_join_links(_institution_id);
  fresh := public._new_institution_join_code();
  UPDATE public.institution_join_links l
  SET code = fresh, use_count = 0, is_active = true
  WHERE l.institution_id = _institution_id AND l.role = _role;
  RETURN fresh;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_institution_join_link(
  _institution_id uuid,
  _role text,
  _is_active boolean,
  _requires_approval boolean,
  _expires_at timestamptz,
  _max_uses integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._can_manage_institution(_institution_id) THEN
    RAISE EXCEPTION 'You cannot manage join links for this institution';
  END IF;
  IF _role NOT IN ('student', 'teacher') THEN
    RAISE EXCEPTION 'Role must be student or teacher';
  END IF;
  IF _max_uses IS NOT NULL AND _max_uses < 1 THEN
    RAISE EXCEPTION 'Maximum uses must be at least 1';
  END IF;

  PERFORM public.get_institution_join_links(_institution_id);
  UPDATE public.institution_join_links l
  SET is_active = _is_active,
      requires_approval = _requires_approval,
      expires_at = _expires_at,
      max_uses = _max_uses
  WHERE l.institution_id = _institution_id AND l.role = _role;
END;
$$;

-- Public preview so the join page can say "Join X as a student" before sign-in.
CREATE OR REPLACE FUNCTION public.preview_institution_join(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link record;
  inst_name text;
BEGIN
  SELECT * INTO link FROM public.institution_join_links l WHERE l.code = upper(trim(_code));
  IF NOT FOUND
     OR NOT link.is_active
     OR (link.expires_at IS NOT NULL AND link.expires_at < now())
     OR (link.max_uses IS NOT NULL AND link.use_count >= link.max_uses) THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT i.name INTO inst_name FROM public.institutions i WHERE i.id = link.institution_id;
  RETURN jsonb_build_object(
    'valid', true,
    'institutionName', inst_name,
    'role', link.role,
    'requiresApproval', link.requires_approval
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_institution_join_links(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.regenerate_institution_join_link(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_institution_join_link(uuid, text, boolean, boolean, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_institution_join_links(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_institution_join_link(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_institution_join_link(uuid, text, boolean, boolean, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_institution_join(text) TO anon, authenticated;

-- Use a join link. For a brand-new account the link decides the role; for an existing
-- account the link's role must match. Administrators can never join through a link.
CREATE OR REPLACE FUNCTION public.join_institution_with_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  link record;
  prof record;
  inst_name text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO link FROM public.institution_join_links l
  WHERE l.code = upper(trim(_code)) FOR UPDATE;
  IF NOT FOUND
     OR NOT link.is_active
     OR (link.expires_at IS NOT NULL AND link.expires_at < now())
     OR (link.max_uses IS NOT NULL AND link.use_count >= link.max_uses) THEN
    RAISE EXCEPTION 'This join link is no longer active. Ask your institution for a new one.';
  END IF;

  SELECT * INTO prof FROM public.profiles p WHERE p.id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF prof.is_active = false THEN RAISE EXCEPTION 'This account is suspended'; END IF;

  SELECT i.name INTO inst_name FROM public.institutions i WHERE i.id = link.institution_id;

  IF prof.institution_id = link.institution_id THEN
    RETURN jsonb_build_object('status', 'already_member', 'institutionName', inst_name, 'role', link.role);
  END IF;
  IF prof.institution_id IS NOT NULL THEN
    RAISE EXCEPTION 'You already belong to another institution. Ask your administrator to move you.';
  END IF;

  IF public.has_role(uid, 'admin') OR public.has_role(uid, 'institution_admin') THEN
    RAISE EXCEPTION 'Administrator accounts are assigned by the platform administrator, not through join links.';
  END IF;

  IF prof.role_confirmed_at IS NULL THEN
    -- Brand-new signup: the link decides the role.
    DELETE FROM public.user_roles ur
    WHERE ur.user_id = uid AND ur.role IN ('student'::public.app_role, 'teacher'::public.app_role);
    INSERT INTO public.user_roles (user_id, role)
    VALUES (uid, link.role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.profiles p
    SET role = link.role, role_confirmed_at = now()
    WHERE p.id = uid AND p.role_confirmed_at IS NULL;
  ELSIF NOT public.has_role(uid, link.role::public.app_role) THEN
    RAISE EXCEPTION 'This is a % link, but your account has a different role.', link.role;
  END IF;

  UPDATE public.institution_join_links l
  SET use_count = l.use_count + 1
  WHERE l.institution_id = link.institution_id AND l.role = link.role;

  IF link.requires_approval THEN
    INSERT INTO public.institution_join_requests (institution_id, user_id, role)
    VALUES (link.institution_id, uid, link.role)
    ON CONFLICT (institution_id, user_id) WHERE status = 'pending' DO NOTHING;
    RETURN jsonb_build_object('status', 'pending', 'institutionName', inst_name, 'role', link.role);
  END IF;

  PERFORM set_config('onyx.institution_write', 'on', true);
  UPDATE public.profiles p SET institution_id = link.institution_id WHERE p.id = uid;
  RETURN jsonb_build_object('status', 'joined', 'institutionName', inst_name, 'role', link.role);
END;
$$;

REVOKE ALL ON FUNCTION public.join_institution_with_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_institution_with_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_institution_join_requests(_institution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._can_manage_institution(_institution_id) THEN
    RAISE EXCEPTION 'You cannot manage join requests for this institution';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id,
      'role', r.role,
      'fullName', p.full_name,
      'email', p.email,
      'createdAt', r.created_at
    ) ORDER BY r.created_at)
    FROM public.institution_join_requests r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.institution_id = _institution_id AND r.status = 'pending'
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_institution_join_request(_request_id uuid, _approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req record;
  current_inst uuid;
BEGIN
  SELECT * INTO req FROM public.institution_join_requests r WHERE r.id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public._can_manage_institution(req.institution_id) THEN
    RAISE EXCEPTION 'You cannot manage join requests for this institution';
  END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'This request has already been decided'; END IF;

  IF _approve THEN
    SELECT p.institution_id INTO current_inst FROM public.profiles p WHERE p.id = req.user_id;
    IF current_inst IS NOT NULL AND current_inst <> req.institution_id THEN
      RAISE EXCEPTION 'This person has since joined a different institution';
    END IF;
    PERFORM set_config('onyx.institution_write', 'on', true);
    UPDATE public.profiles p SET institution_id = req.institution_id WHERE p.id = req.user_id;
  END IF;

  UPDATE public.institution_join_requests r
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'declined' END,
      decided_by = auth.uid(),
      decided_at = now()
  WHERE r.id = _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_institution_join_requests(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_institution_join_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_institution_join_requests(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_institution_join_request(uuid, boolean) TO authenticated;
