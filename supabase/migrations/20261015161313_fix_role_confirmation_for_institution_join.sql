-- Repair schema drift that causes join_institution_with_code() to fail with:
-- "record \"prof\" has no field \"role_confirmed_at\"".
-- Existing accounts should be treated as already confirmed; newly-created
-- profiles keep this timestamp NULL so their institution invite can choose role.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_confirmed_at timestamptz;

-- Keep the role mirror used by ONYX onboarding available even if the earlier
-- migration was not applied in the deployed database.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text;

-- Existing accounts already have an authoritative role in user_roles. Mark
-- those accounts as confirmed so their roles are not overwritten by invite links.
UPDATE public.profiles p
SET
  role_confirmed_at = COALESCE(p.role_confirmed_at, p.created_at, now()),
  role = CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role::text = 'admin'
    ) THEN 'admin'
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role::text = 'institution_admin'
    ) THEN 'institution_admin'
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role::text = 'teacher'
    ) THEN 'teacher'
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role::text = 'student'
    ) THEN 'student'
    ELSE p.role
  END
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id
);

-- The existing join RPC now sees role_confirmed_at in SELECT * INTO prof.
-- New profiles created after this migration retain NULL until the invite or
-- role-confirmation flow assigns their role.
