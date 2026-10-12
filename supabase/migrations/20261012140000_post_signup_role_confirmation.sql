-- Existing accounts have already chosen a role. Mark them as confirmed so
-- this onboarding step applies only to accounts created after this migration.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_confirmed_at TIMESTAMPTZ;

UPDATE public.profiles
SET role_confirmed_at = COALESCE(role_confirmed_at, created_at, now())
WHERE role_confirmed_at IS NULL;

-- New profiles created by handle_new_user() keep role_confirmed_at NULL.
-- A newly registered user can choose student or teacher exactly once.
CREATE OR REPLACE FUNCTION public.confirm_account_role(_role public.app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _role NOT IN ('student'::public.app_role, 'teacher'::public.app_role) THEN
    RAISE EXCEPTION 'Only student or teacher roles can be selected';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role_confirmed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Role has already been confirmed or profile is missing';
  END IF;

  -- Never remove an administrator role, and never allow this onboarding RPC
  -- to change the role after confirmation.
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Administrator role cannot be changed here';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id
    AND role IN ('student'::public.app_role, 'teacher'::public.app_role);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles
  SET role_confirmed_at = now()
  WHERE id = _user_id AND role_confirmed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role has already been confirmed';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_account_role(public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_account_role(public.app_role) TO authenticated;
