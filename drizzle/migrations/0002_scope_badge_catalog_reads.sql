DROP POLICY IF EXISTS "badges read" ON public.badges;

CREATE POLICY "badges read"
ON public.badges
FOR SELECT
TO authenticated
USING (
  NOT is_custom
  OR created_by = (SELECT auth.uid())
  OR public.has_role((SELECT auth.uid()), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.student_badges sb
    WHERE sb.badge_id = badges.id
      AND sb.student_id = (SELECT auth.uid())
  )
);