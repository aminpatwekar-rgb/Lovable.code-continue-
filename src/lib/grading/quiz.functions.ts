import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { QuizAttemptForGrading, QuizGradingAnswer } from "@/lib/grading/types";

type Grade = { questionId: string; points: number; feedback: string };

/** Written answers that a teacher marks by hand (mirrors gradeAnswer in lib/quiz/types). */
function needsHandMarking(type: string, correct: string[]) {
  if (type === "essay") return true;
  return type === "short_answer" && correct.filter((c) => c.trim()).length === 0;
}

async function loadAttempt(attemptId: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: attempt, error } = await supabaseAdmin
    .from("quiz_attempts")
    .select(
      "id, quiz_id, student_id, attempt_no, status, score, max_score, needs_manual_grading, submitted_at",
    )
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!attempt) throw new Error("Attempt not found.");

  const { data: quiz, error: quizError } = await supabaseAdmin
    .from("quizzes")
    .select("id, title, teacher_id, class_id")
    .eq("id", attempt.quiz_id)
    .maybeSingle();
  if (quizError) throw new Error(quizError.message);
  if (!quiz) throw new Error("Quiz not found.");

  if (quiz.teacher_id !== userId) {
    const { data: admin, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw new Error(roleError.message);
    if (!admin) throw new Error("You are not allowed to grade this attempt.");
  }
  return { supabaseAdmin, attempt, quiz };
}

export const getQuizAttemptForGrading = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { attemptId: string }) => {
    if (!input?.attemptId || typeof input.attemptId !== "string") {
      throw new Error("A valid attempt id is required");
    }
    return { attemptId: input.attemptId };
  })
  .handler(async ({ data, context }): Promise<QuizAttemptForGrading> => {
    const { supabaseAdmin, attempt, quiz } = await loadAttempt(data.attemptId, context.userId);

    const [{ data: questions, error: qErr }, { data: answers, error: aErr }, { data: profile }] =
      await Promise.all([
        supabaseAdmin
          .from("quiz_questions")
          .select("id, type, prompt, correct, points, position")
          .eq("quiz_id", attempt.quiz_id)
          .order("position"),
        supabaseAdmin
          .from("quiz_answers")
          .select("id, question_id, response, is_correct, awarded_points, feedback")
          .eq("attempt_id", attempt.id),
        supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", attempt.student_id)
          .maybeSingle(),
      ]);
    if (qErr) throw new Error(qErr.message);
    if (aErr) throw new Error(aErr.message);

    const byQuestion = new Map((answers ?? []).map((a) => [a.question_id, a]));
    const rows: QuizGradingAnswer[] = (questions ?? []).map((q) => {
      const a = byQuestion.get(q.id);
      const correct = Array.isArray(q.correct) ? (q.correct as unknown[]).map(String) : [];
      return {
        question_id: q.id,
        answer_id: a?.id ?? null,
        position: Number(q.position) || 0,
        type: q.type,
        prompt: q.prompt,
        points: Number(q.points) || 0,
        response: Array.isArray(a?.response) ? (a!.response as unknown[]).map(String) : [],
        correct,
        manual: needsHandMarking(q.type, correct),
        is_correct: a?.is_correct ?? null,
        awarded_points: a?.awarded_points == null ? null : Number(a.awarded_points),
        feedback: a?.feedback ?? null,
      };
    });

    return {
      attempt: {
        id: attempt.id,
        quiz_id: attempt.quiz_id,
        attempt_no: attempt.attempt_no,
        status: attempt.status,
        score: attempt.score == null ? null : Number(attempt.score),
        max_score: attempt.max_score == null ? null : Number(attempt.max_score),
        needs_manual_grading: Boolean(attempt.needs_manual_grading),
        submitted_at: attempt.submitted_at,
      },
      student_name: profile?.full_name ?? "Student",
      quiz_title: quiz.title,
      answers: rows,
    };
  });

export const saveQuizAttemptGrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { attemptId: string; grades: Grade[] }) => {
    if (!input?.attemptId || typeof input.attemptId !== "string") {
      throw new Error("A valid attempt id is required");
    }
    if (!Array.isArray(input.grades) || input.grades.length > 200) {
      throw new Error("Grades are required");
    }
    const grades = input.grades.map((g) => {
      const points = Number(g?.points);
      if (!g || typeof g.questionId !== "string" || !Number.isFinite(points) || points < 0) {
        throw new Error("Each grade needs a question and a non-negative number of marks");
      }
      return {
        questionId: g.questionId,
        points,
        feedback: typeof g.feedback === "string" ? g.feedback.trim().slice(0, 2000) : "",
      };
    });
    return { attemptId: input.attemptId, grades };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, attempt, quiz } = await loadAttempt(data.attemptId, context.userId);
    if (attempt.status !== "submitted" && attempt.status !== "graded") {
      throw new Error("This attempt has not been submitted yet.");
    }

    const [{ data: questions, error: qErr }, { data: answers, error: aErr }] = await Promise.all([
      supabaseAdmin
        .from("quiz_questions")
        .select("id, type, correct, points")
        .eq("quiz_id", attempt.quiz_id),
      supabaseAdmin
        .from("quiz_answers")
        .select("id, question_id, response, awarded_points")
        .eq("attempt_id", attempt.id),
    ]);
    if (qErr) throw new Error(qErr.message);
    if (aErr) throw new Error(aErr.message);

    const questionById = new Map((questions ?? []).map((q) => [q.id, q]));
    const answerByQuestion = new Map((answers ?? []).map((a) => [a.question_id, a]));
    const oldScore = Number(attempt.score) || 0;

    // Only hand-marked questions can be changed here; automatic marks stay as the platform set them.
    for (const g of data.grades) {
      const q = questionById.get(g.questionId);
      if (!q) throw new Error("A question in this grade does not belong to the quiz.");
      const correct = Array.isArray(q.correct) ? (q.correct as unknown[]).map(String) : [];
      if (!needsHandMarking(q.type, correct)) {
        throw new Error("Only written answers can be marked by hand.");
      }
      const max = Number(q.points) || 0;
      if (g.points > max) throw new Error(`Marks cannot be more than ${max} for a question.`);
      const row = answerByQuestion.get(g.questionId);
      const full = g.points >= max && max > 0;
      if (row) {
        const { error } = await supabaseAdmin
          .from("quiz_answers")
          .update({ awarded_points: g.points, is_correct: full, feedback: g.feedback || null })
          .eq("id", row.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabaseAdmin.from("quiz_answers").insert({
          attempt_id: attempt.id,
          question_id: g.questionId,
          response: [],
          awarded_points: g.points,
          is_correct: full,
          feedback: g.feedback || null,
        });
        if (error) throw new Error(error.message);
      }
    }

    // Re-read so the total always comes from the database, never from the browser.
    const { data: fresh, error: freshError } = await supabaseAdmin
      .from("quiz_answers")
      .select("question_id, awarded_points")
      .eq("attempt_id", attempt.id);
    if (freshError) throw new Error(freshError.message);
    const gradedByQuestion = new Map((fresh ?? []).map((a) => [a.question_id, a.awarded_points]));

    let score = 0;
    let max = 0;
    let stillManual = false;
    for (const q of questions ?? []) {
      const points = Number(q.points) || 0;
      max += points;
      const awarded = gradedByQuestion.get(q.id);
      if (awarded != null) score += Number(awarded) || 0;
      const correct = Array.isArray(q.correct) ? (q.correct as unknown[]).map(String) : [];
      const hasAnswer =
        answerByQuestion.has(q.id) || data.grades.some((g) => g.questionId === q.id);
      if (needsHandMarking(q.type, correct) && hasAnswer && awarded == null) stillManual = true;
    }

    const now = new Date().toISOString();
    const finished = !stillManual;
    const { error: updateError } = await supabaseAdmin
      .from("quiz_attempts")
      .update({
        score,
        max_score: max,
        status: finished ? "graded" : "submitted",
        needs_manual_grading: stillManual,
        graded_at: finished ? now : null,
      })
      .eq("id", attempt.id);
    if (updateError) throw new Error(updateError.message);

    // Keep the points ledger in step: the student already received points for the automatic part.
    const delta = Math.round(score) - Math.round(oldScore);
    if (delta !== 0) {
      await supabaseAdmin.from("student_points").insert({
        student_id: attempt.student_id,
        class_id: quiz.class_id,
        source: "quiz",
        reference_id: attempt.quiz_id,
        points: delta,
        note: `${quiz.title} (teacher marks)`,
      });
    }

    // Automatic badges, same rules as when a quiz is graded instantly.
    const earned: string[] = [];
    if (finished && max > 0 && score === max) earned.push("perfect_quiz");
    if (finished) {
      const { count } = await supabaseAdmin
        .from("quiz_attempts")
        .select("id", { count: "exact", head: true })
        .eq("student_id", attempt.student_id)
        .eq("status", "graded");
      if ((count ?? 0) >= 5) earned.push("quiz_master");
    }
    for (const code of earned) {
      const { data: badge } = await supabaseAdmin
        .from("badges")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (!badge) continue;
      await supabaseAdmin.from("student_badges").upsert(
        {
          student_id: attempt.student_id,
          badge_id: badge.id,
          class_id: quiz.class_id,
          reason: "Earned automatically",
        },
        { onConflict: "student_id,badge_id,class_id", ignoreDuplicates: true },
      );
    }

    return { score, max, finished };
  });
