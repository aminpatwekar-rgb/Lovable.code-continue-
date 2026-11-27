-- Teacher choice at first sign-in grants the Teacher role immediately (no admin approval).
-- Admin and institution_admin remain non-self-assignable.
-- Joining an institution or department as a teacher still goes through the existing
-- approval flow (teacher invite links / join requests); this migration does not touch it.

CREATE OR REPLACE FUNCTION public.confirm_account_role(_role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _role IS NULL OR _role NOT IN ('student'::public.app_role, 'teacher'::public.app_role) THEN
    RAISE EXCEPTION 'This role cannot be self-selected';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role_confirmed_at IS NULL) THEN
    RAISE EXCEPTION 'Role has already been confirmed';
  END IF;

  -- Accounts that already hold an administrator role keep their roles untouched.
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin'::public.app_role, 'institution_admin'::public.app_role)
  ) THEN
    UPDATE public.profiles SET role_confirmed_at = now() WHERE id = _user_id AND role_confirmed_at IS NULL;
    RETURN TRUE;
  END IF;

  -- Replace only the two ordinary onboarding roles; never touch admin roles.
  DELETE FROM public.user_roles
  WHERE user_id = _user_id AND role IN ('student'::public.app_role, 'teacher'::public.app_role);

  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles
     SET role = _role::text, role_confirmed_at = now()
   WHERE id = _user_id AND role_confirmed_at IS NULL;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_account_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_account_role(public.app_role) TO authenticated;

-- Anyone left as a pending teacher request becomes a teacher.
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'teacher'::public.app_role FROM public.profiles p WHERE p.role = 'teacher_pending'
ON CONFLICT (user_id, role) DO NOTHING;
UPDATE public.profiles SET role = 'teacher' WHERE role = 'teacher_pending';
