-- Keep the legacy profile role mirror available for signup confirmation and
-- institution onboarding. Authorization must continue to use public.user_roles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text;

-- Populate the mirror for existing confirmed users. user_roles remains the
-- authoritative source, and no unconfirmed signup is marked as role-confirmed.
UPDATE public.profiles p
SET role = CASE
  WHEN EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'admin'::public.app_role
  ) THEN 'admin'
  WHEN EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role::text = 'institution_admin'
  ) THEN 'institution_admin'
  WHEN EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'teacher'::public.app_role
  ) THEN 'teacher'
  WHEN EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'student'::public.app_role
  ) THEN 'student'
  ELSE p.role
END
WHERE p.role_confirmed_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id
  );
