CREATE OR REPLACE FUNCTION public.shares_class_with(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    -- both students in the same class
    SELECT 1 FROM public.class_members m1
    JOIN public.class_members m2 ON m1.class_id = m2.class_id
    WHERE m1.student_id = _a AND m2.student_id = _b
  ) OR EXISTS (
    -- _a teaches a class _b is enrolled in
    SELECT 1 FROM public.classes c
    JOIN public.class_members m ON m.class_id = c.id
    WHERE c.teacher_id = _a AND m.student_id = _b
  ) OR EXISTS (
    -- _b teaches a class _a is enrolled in
    SELECT 1 FROM public.classes c
    JOIN public.class_members m ON m.class_id = c.id
    WHERE c.teacher_id = _b AND m.student_id = _a
  );
$$;

REVOKE EXECUTE ON FUNCTION public.shares_class_with(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shares_class_with(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS profiles_read ON public.profiles;

CREATE POLICY profiles_read ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.shares_class_with(auth.uid(), id)
);