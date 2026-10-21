-- Creating a quiz failed with 'new row violates row-level security policy for table "quizzes"'.
-- The app inserts with .select("id"), so Postgres also checks the SELECT policy on the new row.
-- That policy called can_view_quiz(), a STABLE function that re-queries public.quizzes; it cannot
-- see the row still being inserted, so it returned false. Check the row's own columns instead.
DROP POLICY IF EXISTS "quiz select" ON public.quizzes;
CREATE POLICY "quiz select" ON public.quizzes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (teacher_id = auth.uid() AND public.is_class_teacher(class_id, auth.uid()))
    OR (published AND public.is_class_member(class_id, auth.uid()))
  );
