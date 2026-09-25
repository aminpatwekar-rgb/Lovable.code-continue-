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
