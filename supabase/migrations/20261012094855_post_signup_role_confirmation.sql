-- Confirm a new ONYX account's student/teacher role exactly once.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS role_confirmed_at timestamptz;

-- Preserve existing authoritative roles during rollout; new profiles remain
-- unconfirmed until account onboarding completes.
UPDATE public.profiles p
SET role_confirmed_at = COALESCE(p.role_confirmed_at, p.created_at, now()),
    role = CASE
      WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id AND ur.role='admin'::public.app_role) THEN 'admin'
      WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id AND ur.role='teacher'::public.app_role) THEN 'teacher'
      WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id AND ur.role='student'::public.app_role) THEN 'student'
      ELSE p.role
    END
WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id);

CREATE OR REPLACE FUNCTION public.confirm_account_role(_role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _user_id uuid := auth.uid();
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
  SET role = _role::text,
      role_confirmed_at = now()
  WHERE id = _user_id AND role_confirmed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role has already been confirmed';
  END IF;

  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_account_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_account_role(public.app_role) TO authenticated, service_role;
