import { supabase } from "@/integrations/supabase/client";

export type QuizCounts = Map<string, number>;

/**
 * Question counts come from a security-definer RPC because the `quiz_questions`
 * SELECT policy is owner-only: a PostgREST embed silently returns 0 for
 * students, which is what made published quizzes look empty.
 */
export async function fetchQuestionCounts(quizIds: string[]): Promise<QuizCounts> {
  const map: QuizCounts = new Map();
  if (quizIds.length === 0) return map;
  const { data, error } = await supabase.rpc("get_quiz_question_counts", {
    _quiz_ids: quizIds,
  });
  if (error) throw error;
  for (const row of data ?? []) map.set(row.quiz_id, Number(row.question_count) || 0);
  return map;
}
