-- Allow a new account to confirm the Student or Teacher role selected
-- in the first-time onboarding screen. Administrator roles remain non-self-assignable.

CREATE OR REPLACE FUNCTION public.confirm_account_role(_role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _confirmed_at timestamptz;
  _selected_role public.app_role;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _role NOT IN ('student'::public.app_role, 'teacher'::public.app_role) THEN
    RAISE EXCEPTION 'Only student or teacher roles can be selected';
  END IF;

  SELECT p.role_confirmed_at
    INTO _confirmed_at
  FROM public.profiles p
  WHERE p.id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF _confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Role has already been confirmed';
  END IF;

  -- Do not let onboarding grant, remove or replace privileged administrator roles.
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'institution_admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Administrator roles are assigned by an administrator and cannot be selected here';
  END IF;

  -- A Teacher role already assigned by an administrator is preserved.
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'teacher'::public.app_role
  ) THEN
    IF _role <> 'teacher'::public.app_role THEN
      RAISE EXCEPTION 'A Teacher role has already been assigned to this account. Select Teacher to continue.';
    END IF;
    _selected_role := 'teacher'::public.app_role;
  ELSE
    _selected_role := _role;
  END IF;

  -- Replace only the two ordinary onboarding roles. Never touch admin roles.
  DELETE FROM public.user_roles
  WHERE user_id = _user_id
    AND role IN ('student'::public.app_role, 'teacher'::public.app_role);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _selected_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Keep the legacy profile role mirror and the authoritative role table aligned.
  UPDATE public.profiles
  SET role = _selected_role::text,
      role_confirmed_at = now()
  WHERE id = _user_id AND role_confirmed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role has already been confirmed';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_account_role(public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_account_role(public.app_role) TO authenticated;
