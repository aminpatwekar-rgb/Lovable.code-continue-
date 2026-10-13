import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProgressAssessmentPoint = {
  id: string;
  title: string;
  label: string;
  type: "Assignment" | "Quiz";
  date: string;
  scorePct: number;
  classAveragePct: number | null;
};

export type StudentProgressAnalytics = {
  studentId: string;
  classId: string;
  assignmentCount: number;
  assignmentsSubmitted: number;
  assignmentsGraded: number;
  lateSubmissions: number;
  assignmentCompletionPct: number;
  quizCount: number;
  quizzesAttempted: number;
  quizzesGraded: number;
  assignmentAveragePct: number | null;
  quizAveragePct: number | null;
  overallAveragePct: number | null;
  classAveragePct: number | null;
  trend: ProgressAssessmentPoint[];
  assessments: ProgressAssessmentPoint[];
};

type ScoredAttempt = {
  id: string;
  quiz_id: string;
  student_id: string;
  status: string;
  score: number | string | null;
  max_score: number | string | null;
  submitted_at: string | null;
  started_at: string | null;
};

function percent(score: unknown, maximum: unknown): number | null {
  const value = Number(score);
  const max = Number(maximum);
  if (score == null || maximum == null || !Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return null;
  }
  return Math.round((Math.min(100, Math.max(0, value / max * 100))) * 10) / 10;
}

function eventDate(...values: (string | null | undefined)[]): string {
  const found = values.find((value) => value && !Number.isNaN(new Date(value).getTime()));
  return found ?? new Date(0).toISOString();
}

function average(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  return valid.length
    ? Math.round((valid.reduce((total, value) => total + value, 0) / valid.length) * 10) / 10
    : null;
}

function isCompletedAttempt(status: string): boolean {
  return status === "submitted" || status === "graded" || status === "expired";
}

function isSubmitted(row: { status?: string | null; submitted_at?: string | null }): boolean {
  return Boolean(row.submitted_at) ||
    row.status === "submitted" ||
    row.status === "graded" ||
    row.status === "late" ||
    row.status === "needs_review";
}

function bestAttemptPerStudent(rows: ScoredAttempt[]): Map<string, ScoredAttempt> {
  const result = new Map<string, ScoredAttempt>();
  for (const row of rows) {
    if (!isCompletedAttempt(row.status) || percent(row.score, row.max_score) == null) continue;
    const existing = result.get(row.student_id);
    const score = percent(row.score, row.max_score)!;
    const previous = existing ? percent(existing.score, existing.max_score) : null;
    const rowDate = new Date(row.submitted_at ?? row.started_at ?? 0).getTime();
    const existingDate = existing ? new Date(existing.submitted_at ?? existing.started_at ?? 0).getTime() : -1;
    if (!existing || previous == null || score > previous || (score === previous && rowDate > existingDate)) {
      result.set(row.student_id, row);
    }
  }
  return result;
}

/**
 * Read assessment-level progress for a student after verifying that the signed-in
 * caller manages the selected class. No client-supplied student ID is trusted
 * without checking actual class membership.
 */
export const getStudentProgressAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { classId: string; studentId: string }) => {
    if (
      !input?.classId || typeof input.classId !== "string" ||
      !input?.studentId || typeof input.studentId !== "string"
    ) {
      throw new Error("A class and student are required.");
    }
    return { classId: input.classId, studentId: input.studentId };
  })
  .handler(async ({ data, context }): Promise<StudentProgressAnalytics> => {
    const { classId, studentId } = data;
    const [{ data: isAdmin, error: adminError }, { data: canManage, error: teacherError }] =
      await Promise.all([
        context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
        context.supabase.rpc("is_class_teacher", { _class_id: classId, _user_id: context.userId }),
      ]);
    if (adminError) throw new Error("Could not verify administrator permissions.");
    if (teacherError) throw new Error("Could not verify class permissions.");
    if (!isAdmin && !canManage) {
      throw new Error("You are not allowed to view analytics for this class.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("class_members")
      .select("student_id")
      .eq("class_id", classId)
      .eq("student_id", studentId)
      .eq("member_role", "student")
      .maybeSingle();
    if (membershipError) throw new Error(membershipError.message);
    if (!membership) throw new Error("That student is not in the selected class.");

    const [
      { data: assignments, error: assignmentsError },
      { data: quizzes, error: quizzesError },
      { data: classRoster, error: rosterError },
    ] = await Promise.all([
      supabaseAdmin
        .from("assignments")
        .select("id, title, max_marks, created_at")
        .eq("class_id", classId)
        .eq("published", true)
        .eq("archived", false)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("quizzes")
        .select("id, title, created_at")
        .eq("class_id", classId)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("class_members")
        .select("student_id")
        .eq("class_id", classId)
        .eq("member_role", "student"),
    ]);
    if (assignmentsError) throw new Error(assignmentsError.message);
    if (quizzesError) throw new Error(quizzesError.message);
    if (rosterError) throw new Error(rosterError.message);

    const assignmentRows = assignments ?? [];
    const quizRows = quizzes ?? [];
    const rosterIds = [...new Set((classRoster ?? []).map((row) => row.student_id))];
    const assignmentIds = assignmentRows.map((row) => row.id);
    const quizIds = quizRows.map((row) => row.id);

    const [
      { data: submissions, error: submissionsError },
      { data: attemptRows, error: attemptsError },
    ] = await Promise.all([
      assignmentIds.length
        ? supabaseAdmin
            .from("submissions")
            .select("id, assignment_id, student_id, status, marks_awarded, submitted_at, reviewed_at, is_late")
            .in("assignment_id", assignmentIds)
        : Promise.resolve({ data: [], error: null }),
      quizIds.length
        ? supabaseAdmin
            .from("quiz_attempts")
            .select("id, quiz_id, student_id, status, score, max_score, submitted_at, started_at")
            .in("quiz_id", quizIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (submissionsError) throw new Error(submissionsError.message);
    if (attemptsError) throw new Error(attemptsError.message);

    const submissionRows = submissions ?? [];
    const scoredPoints: ProgressAssessmentPoint[] = [];
    const assignmentScores: number[] = [];
    const quizScores: number[] = [];
    const targetSubmissions = submissionRows.filter((row) => row.student_id === studentId);
    const assignmentsSubmitted = new Set(
      targetSubmissions.filter((row) => isSubmitted(row)).map((row) => row.assignment_id),
    ).size;
    const lateSubmissions = new Set(
      targetSubmissions
        .filter((row) => Boolean(row.is_late) || row.status === "late")
        .map((row) => row.assignment_id),
    ).size;
    const assignmentsGraded = new Set(
      targetSubmissions.filter((row) => row.marks_awarded != null).map((row) => row.assignment_id),
    ).size;

    for (const assignment of assignmentRows) {
      const maximum = assignment.max_marks;
      const byStudent = new Map<string, (typeof submissionRows)[number]>();
      for (const row of submissionRows) {
        if (row.assignment_id !== assignment.id || row.marks_awarded == null) continue;
        const current = byStudent.get(row.student_id);
        const currentDate = new Date(current?.reviewed_at ?? current?.submitted_at ?? 0).getTime();
        const rowDate = new Date(row.reviewed_at ?? row.submitted_at ?? 0).getTime();
        if (!current || rowDate > currentDate) byStudent.set(row.student_id, row);
      }
      const cohortScores = [...byStudent.values()]
        .map((row) => percent(row.marks_awarded, maximum))
        .filter((value): value is number => value != null);
      const targetRow = byStudent.get(studentId);
      const scorePct = targetRow ? percent(targetRow.marks_awarded, maximum) : null;
      if (scorePct == null || !targetRow) continue;
      assignmentScores.push(scorePct);
      scoredPoints.push({
        id: assignment.id,
        title: assignment.title || "Assignment",
        label: String(assignment.title || "Assignment").slice(0, 22),
        type: "Assignment",
        date: eventDate(targetRow.reviewed_at, targetRow.submitted_at, assignment.created_at),
        scorePct,
        classAveragePct: average(cohortScores),
      });
    }

    const attemptData = (attemptRows ?? []) as ScoredAttempt[];
    const targetCompletedAttempts = attemptData.filter(
      (row) => row.student_id === studentId && isCompletedAttempt(row.status),
    );
    const targetQuizIdsAttempted = new Set(targetCompletedAttempts.map((row) => row.quiz_id));
    let quizzesGraded = 0;

    for (const quiz of quizRows) {
      const quizAttempts = attemptData.filter((row) => row.quiz_id === quiz.id);
      const bestByStudent = bestAttemptPerStudent(quizAttempts);
      const classScores = [...bestByStudent.values()]
        .map((row) => percent(row.score, row.max_score))
        .filter((value): value is number => value != null);
      const targetBest = bestByStudent.get(studentId);
      if (!targetBest) continue;
      const scorePct = percent(targetBest.score, targetBest.max_score);
      if (scorePct == null) continue;
      quizzesGraded += 1;
      quizScores.push(scorePct);
      scoredPoints.push({
        id: quiz.id,
        title: quiz.title || "Quiz",
        label: String(quiz.title || "Quiz").slice(0, 22),
        type: "Quiz",
        date: eventDate(targetBest.submitted_at, targetBest.started_at, quiz.created_at),
        scorePct,
        classAveragePct: average(classScores),
      });
    }

    scoredPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const assignmentCompletionPct = assignmentRows.length
      ? Math.round((assignmentsSubmitted / assignmentRows.length) * 1000) / 10
      : 0;

    return {
      studentId,
      classId,
      assignmentCount: assignmentRows.length,
      assignmentsSubmitted,
      assignmentsGraded,
      lateSubmissions,
      assignmentCompletionPct,
      quizCount: quizRows.length,
      quizzesAttempted: targetQuizIdsAttempted.size,
      quizzesGraded,
      assignmentAveragePct: average(assignmentScores),
      quizAveragePct: average(quizScores),
      overallAveragePct: average(scoredPoints.map((point) => point.scorePct)),
      classAveragePct: average(scoredPoints.map((point) => point.classAveragePct)),
      trend: scoredPoints,
      assessments: scoredPoints,
    };
  });
