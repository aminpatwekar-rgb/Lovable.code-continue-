DROP POLICY IF EXISTS "qq select" ON public.quiz_questions;
DROP POLICY IF EXISTS "qq_select" ON public.quiz_questions;

CREATE POLICY "qq select" ON public.quiz_questions
FOR SELECT TO authenticated
USING (public.owns_quiz(quiz_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.get_quiz_questions_for_student(_quiz_id uuid)
RETURNS TABLE(id uuid, type quiz_question_type, difficulty quiz_difficulty, prompt text, options jsonb, points numeric, q_position integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT q.id, q.type, q.difficulty, q.prompt, q.options, q.points, q.position
  FROM public.quiz_questions q
  WHERE q.quiz_id = _quiz_id
    AND public.can_view_quiz(_quiz_id, auth.uid())
  ORDER BY q.position;
$$;

REVOKE ALL ON FUNCTION public.get_quiz_questions_for_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_quiz_questions_for_student(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions_for_student(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_quiz_explanations(_attempt_id uuid)
RETURNS TABLE(question_id uuid, correct jsonb, explanation text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT q.id, q.correct, q.explanation
  FROM public.quiz_attempts a
  JOIN public.quizzes z ON z.id = a.quiz_id
  JOIN public.quiz_questions q ON q.quiz_id = a.quiz_id
  WHERE a.id = _attempt_id
    AND a.student_id = auth.uid()
    AND z.show_results
    AND a.status IN ('submitted','graded');
$$;

REVOKE ALL ON FUNCTION public.get_quiz_explanations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_quiz_explanations(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_quiz_explanations(uuid) TO authenticated;