import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gradeAnswer, type QuestionType } from "@/lib/quiz/types";

/**
 * Authoritative grading. The student's browser records raw responses; the real
 * score, points ledger entry and automatic badges are all computed here so the
 * answer key never has to be trusted to the client.
 */
export const finalizeQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { attemptId: string }) => {
    if (!input?.attemptId || typeof input.attemptId !== "string") {
      throw new Error("A valid attempt id is required");
    }
    return { attemptId: input.attemptId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: attempt, error } = await supabase
      .from("quiz_attempts")
      .select("id, quiz_id, student_id, status, started_at, quizzes(title, class_id, passing_marks)")
      .eq("id", data.attemptId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!attempt) throw new Error("Attempt not found");
    if (attempt.student_id !== userId) throw new Error("Not your attempt");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: questions }, { data: answers }] = await Promise.all([
      supabaseAdmin
        .from("quiz_questions")
        .select("id, type, correct, points")
        .eq("quiz_id", attempt.quiz_id),
      supabaseAdmin
        .from("quiz_answers")
        .select("id, question_id, response")
        .eq("attempt_id", attempt.id),
    ]);

    const byQuestion = new Map((answers ?? []).map((a) => [a.question_id, a]));
    let score = 0;
    let max = 0;
    let needsManual = false;

    for (const q of questions ?? []) {
      const points = Number(q.points) || 0;
      max += points;
      const given = byQuestion.get(q.id);
      const response = Array.isArray(given?.response)
        ? (given!.response as unknown[]).map((v) => String(v))
        : [];
      const result = gradeAnswer(
        { type: q.type as QuestionType, correct: (q.correct as string[]) ?? [], points },
        response,
      );
      if (!given) continue;
      if (result === null) {
        needsManual = true;
        await supabaseAdmin
          .from("quiz_answers")
          .update({ is_correct: null, awarded_points: null })
          .eq("id", given.id);
        continue;
      }
      score += result.points;
      await supabaseAdmin
        .from("quiz_answers")
        .update({ is_correct: result.correct, awarded_points: result.points })
        .eq("id", given.id);
    }

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("quiz_attempts")
      .update({
        status: needsManual ? "submitted" : "graded",
        submitted_at: now,
        graded_at: needsManual ? null : now,
        score,
        max_score: max,
        needs_manual_grading: needsManual,
      })
      .eq("id", attempt.id);

    const quiz = attempt.quizzes as { class_id: string; title: string } | null;

    await supabaseAdmin.from("student_points").insert({
      student_id: attempt.student_id,
      class_id: quiz?.class_id ?? null,
      source: "quiz",
      reference_id: attempt.quiz_id,
      points: Math.round(score),
      note: quiz?.title ?? "Quiz",
    });

    // Automatic badges — awarded by the platform, never by the student.
    const earned: string[] = [];
    if (max > 0 && score === max && !needsManual) earned.push("perfect_quiz");

    const { count: graded } = await supabaseAdmin
      .from("quiz_attempts")
      .select("id", { count: "exact", head: true })
      .eq("student_id", attempt.student_id)
      .eq("status", "graded");
    if ((graded ?? 0) >= 5) earned.push("quiz_master");

    for (const code of earned) {
      const { data: badge } = await supabaseAdmin
        .from("badges")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (!badge) continue;
      await supabaseAdmin
        .from("student_badges")
        .upsert(
          {
            student_id: attempt.student_id,
            badge_id: badge.id,
            class_id: quiz?.class_id ?? null,
            reason: "Earned automatically",
          },
          { onConflict: "student_id,badge_id,class_id", ignoreDuplicates: true },
        );
    }

    return { score, max, needsManual, badges: earned };
  });
