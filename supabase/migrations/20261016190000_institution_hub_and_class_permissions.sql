-- Let the platform admin review the institution directory and departments.
DROP POLICY IF EXISTS departments_select_platform_admin ON public.departments;
CREATE POLICY departments_select_platform_admin
  ON public.departments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Teachers, institution admins and platform admins may create classes owned by themselves.
-- The existing validate_class_department trigger still checks department scope.
DROP POLICY IF EXISTS classes_insert ON public.classes;
CREATE POLICY classes_insert ON public.classes
  FOR INSERT TO authenticated
  WITH CHECK (
    teacher_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'teacher')
      OR public.has_role(auth.uid(), 'institution_admin')
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- Supply the class creator with the departments they are authorized to use.
CREATE OR REPLACE FUNCTION public.list_my_departments()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'code', d.code) ORDER BY d.name),
    '[]'::jsonb
  )
  FROM public.departments d
  WHERE auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.is_institution_admin(d.institution_id)
      OR EXISTS (
        SELECT 1 FROM public.department_members dm
        WHERE dm.department_id = d.id
          AND dm.user_id = auth.uid()
          AND dm.role = 'teacher'
      )
    );
$$;

REVOKE ALL ON FUNCTION public.list_my_departments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_departments() TO authenticated;
