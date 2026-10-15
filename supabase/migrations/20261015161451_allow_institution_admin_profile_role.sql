ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['student'::text,'teacher'::text,'institution_admin'::text,'admin'::text,'super_admin'::text]));
