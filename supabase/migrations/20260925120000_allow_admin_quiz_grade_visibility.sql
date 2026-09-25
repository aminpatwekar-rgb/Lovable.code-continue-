-- Allow platform admins to read quiz attempts/answers so the existing
-- teacher/admin quiz results UI can display real student grades.
--
-- Students remain restricted to their own attempts/answers. Teachers remain
-- restricted to quizzes they own.

CREATE OR REPLACE FUNCTION public.reviews_attempt(_attempt_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.quiz_attempts a
    JOIN public.quizzes q ON q.id = a.quiz_id
    WHERE a.id = _attempt_id
      AND (
        q.teacher_id = _user_id
        OR public.has_role(_user_id, 'admin')
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.reviews_attempt(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reviews_attempt(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "attempt select" ON public.quiz_attempts;
CREATE POLICY "attempt select" ON public.quiz_attempts
FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  OR public.owns_quiz(quiz_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "answer select" ON public.quiz_answers;
CREATE POLICY "answer select" ON public.quiz_answers
FOR SELECT TO authenticated
USING (
  public.owns_attempt(attempt_id, auth.uid())
  OR public.reviews_attempt(attempt_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
