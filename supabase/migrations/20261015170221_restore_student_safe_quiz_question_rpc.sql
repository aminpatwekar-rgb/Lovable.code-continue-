-- The student quiz-taking and review routes require a key-free projection of quiz questions.
-- Never return the correctness or explanation columns from this RPC.

CREATE OR REPLACE FUNCTION public.get_quiz_questions_for_student(_quiz_id uuid)
RETURNS TABLE(
  id uuid,
  type public.quiz_question_type,
  difficulty public.quiz_difficulty,
  prompt text,
  options jsonb,
  points numeric,
  q_position integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT q.id, q.type, q.difficulty, q.prompt, q.options, q.points, q.position
  FROM public.quiz_questions q
  WHERE q.quiz_id = _quiz_id
    AND public.can_view_quiz(_quiz_id, auth.uid())
  ORDER BY q.position;
$$;

REVOKE ALL ON FUNCTION public.get_quiz_questions_for_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions_for_student(uuid) TO authenticated;
