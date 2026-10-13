-- Institution admins can read only their own institution directory row.
-- The institution profile is currently stored as a normalized name; keep this
-- helper aligned with the existing institution rename workflow.
CREATE OR REPLACE FUNCTION public.is_institution_admin(_user_id uuid, _institution_id uuid)
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
    JOIN public.institutions i
      ON lower(trim(i.name)) = lower(trim(p.institution))
    WHERE ur.user_id = _user_id
      AND ur.role::text = 'institution_admin'
      AND i.id = _institution_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_institution_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_institution_admin(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS institutions_institution_admin_read ON public.institutions;
CREATE POLICY institutions_institution_admin_read
  ON public.institutions
  FOR SELECT
  TO authenticated
  USING (public.is_institution_admin(auth.uid(), id));
