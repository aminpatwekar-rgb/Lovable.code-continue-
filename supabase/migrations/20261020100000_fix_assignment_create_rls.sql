-- Allow the platform admin to create assignments in classes they administer.
-- Keep new rows attributed to the authenticated actor; do not broaden teacher access.

DROP POLICY IF EXISTS assignments_insert ON public.assignments;
CREATE POLICY assignments_insert
  ON public.assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    teacher_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.is_class_teacher(class_id, auth.uid())
    )
  );

-- The Storage object policy consults this function for assignment attachment
-- uploads. Let the platform admin manage attachments for admin-created rows,
-- while ensuring callers cannot pass another user's ID to this helper.
CREATE OR REPLACE FUNCTION public.is_assignment_owner(_assignment_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.assignments a
      WHERE a.id = _assignment_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR public.is_class_teacher(a.class_id, auth.uid())
        )
    );
$$;

REVOKE ALL ON FUNCTION public.is_assignment_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_assignment_owner(uuid, uuid) TO authenticated;
