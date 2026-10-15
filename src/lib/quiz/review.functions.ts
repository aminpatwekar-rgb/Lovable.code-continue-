import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type QuizReviewAttempt = {
  id: string;
  student_id: string;
  attempt_no: number;
  status: string;
  score: number | null;
  max_score: number | null;
  submitted_at: string | null;
  started_at: string;
};

export type QuizReviewResult = {
  attempts: QuizReviewAttempt[];
  names: Record<string, string>;
};

export const getQuizReviewAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { quizId: string }) => {
    if (!input?.quizId || typeof input.quizId !== "string") {
      throw new Error("A valid quiz id is required");
    }
    return { quizId: input.quizId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Authorization is checked on the server before using the service role.
    const { data: quiz, error: quizError } = await supabaseAdmin
      .from("quizzes")
      .select("id, teacher_id")
      .eq("id", data.quizId)
      .maybeSingle();

    if (quizError) throw new Error(quizError.message);
    if (!quiz) throw new Error("Quiz not found.");

    const { data: adminRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) throw new Error(roleError.message);

    const isOwner = quiz.teacher_id === userId;
    const isAdmin = Boolean(adminRole);
    if (!isOwner && !isAdmin) {
      throw new Error("You are not allowed to review this quiz.");
    }

    const { data: attempts, error: attemptsError } = await supabaseAdmin
      .from("quiz_attempts")
      .select(
        "id, student_id, attempt_no, status, score, max_score, submitted_at, started_at",
      )
      .eq("quiz_id", data.quizId)
      .order("submitted_at", { ascending: false, nullsFirst: false });

    if (attemptsError) throw new Error(attemptsError.message);

    const ids = [...new Set((attempts ?? []).map((a) => a.student_id))];
    const names: Record<string, string> = {};

    if (ids.length) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);

      if (profilesError) throw new Error(profilesError.message);
      for (const profile of profiles ?? []) {
        names[profile.id] = profile.full_name;
      }
    }

    return {
      attempts: (attempts ?? []).map((a) => ({
        id: a.id,
        student_id: a.student_id,
        attempt_no: a.attempt_no,
        status: a.status,
        score: a.score == null ? null : Number(a.score),
        max_score: a.max_score == null ? null : Number(a.max_score),
        submitted_at: a.submitted_at,
        started_at: a.started_at,
      })),
      names,
    } satisfies QuizReviewResult;
  });


export type QuizReviewAnswer = {
  id: string | null;
  question_id: string;
  position: number;
  type: string;
  prompt: string;
  points: number;
  response: string[];
  correct: string[];
  is_correct: boolean | null;
  awarded_points: number | null;
};

export type QuizReviewAttemptDetail = {
  attempt: QuizReviewAttempt;
  student_name: string;
  answers: QuizReviewAnswer[];
};

export const getQuizReviewAttempt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { attemptId: string }) => {
    if (!input?.attemptId || typeof input.attemptId !== "string") {
      throw new Error("A valid attempt id is required");
    }
    return { attemptId: input.attemptId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: attempt, error: attemptError } = await supabaseAdmin
      .from("quiz_attempts")
      .select(
        "id, quiz_id, student_id, attempt_no, status, score, max_score, submitted_at, started_at",
      )
      .eq("id", data.attemptId)
      .maybeSingle();

    if (attemptError) throw new Error(attemptError.message);
    if (!attempt) throw new Error("Attempt not found.");

    const { data: quiz, error: quizError } = await supabaseAdmin
      .from("quizzes")
      .select("id, teacher_id")
      .eq("id", attempt.quiz_id)
      .maybeSingle();

    if (quizError) throw new Error(quizError.message);
    if (!quiz) throw new Error("Quiz not found.");

    const { data: adminRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) throw new Error(roleError.message);

    if (quiz.teacher_id !== userId && !adminRole) {
      throw new Error("You are not allowed to review this attempt.");
    }

    const [{ data: questions, error: questionsError }, { data: answers, error: answersError }, { data: profile, error: profileError }] =
      await Promise.all([
        supabaseAdmin
          .from("quiz_questions")
          .select("id, type, prompt, correct, points, position")
          .eq("quiz_id", attempt.quiz_id)
          .order("position"),
        supabaseAdmin
          .from("quiz_answers")
          .select("id, question_id, response, is_correct, awarded_points")
          .eq("attempt_id", attempt.id),
        supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", attempt.student_id)
          .maybeSingle(),
      ]);

    if (questionsError) throw new Error(questionsError.message);
    if (answersError) throw new Error(answersError.message);
    if (profileError) throw new Error(profileError.message);

    const byQuestion = new Map((answers ?? []).map((a) => [a.question_id, a]));

    return {
      attempt: {
        id: attempt.id,
        student_id: attempt.student_id,
        attempt_no: attempt.attempt_no,
        status: attempt.status,
        score: attempt.score == null ? null : Number(attempt.score),
        max_score: attempt.max_score == null ? null : Number(attempt.max_score),
        submitted_at: attempt.submitted_at,
        started_at: attempt.started_at,
      },
      student_name: profile?.full_name ?? "Student",
      answers: (questions ?? []).map((q) => {
        const a = byQuestion.get(q.id);
        return {
          id: a?.id ?? null,
          question_id: q.id,
          position: Number(q.position) || 0,
          type: q.type,
          prompt: q.prompt,
          points: Number(q.points) || 0,
          response: Array.isArray(a?.response)
            ? (a!.response as unknown[]).map(String)
            : [],
          correct: Array.isArray(q.correct)
            ? (q.correct as unknown[]).map(String)
            : [],
          is_correct: a?.is_correct ?? null,
          awarded_points: a?.awarded_points == null ? null : Number(a.awarded_points),
        };
      }),
    } satisfies QuizReviewAttemptDetail;
  });
