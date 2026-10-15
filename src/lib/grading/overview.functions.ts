import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  AssignmentGroup,
  AssignmentQueue,
  GradingOverview,
  QuizGroup,
  QuizQueue,
  WaitingItem,
} from "@/lib/grading/types";

/**
 * Teacher-only data for the Grading tab. Each function checks who is asking before it
 * uses the service role: teachers only ever see their own assignments and quizzes,
 * admins see everything, students are refused.
 */

type Scope = { userId: string; isAdmin: boolean };

async function requireGrader(context: {
  supabase: {
    from: (t: "user_roles") => {
      select: (c: string) => {
        eq: (
          c: string,
          v: string,
        ) => {
          returns: () => PromiseLike<{
            data: { role: string }[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  userId: string;
}): Promise<Scope> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .returns();
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r) => r.role);
  const isAdmin = roles.includes("admin");
  if (!isAdmin && !roles.includes("teacher")) {
    throw new Error("Only teachers can use the grading tab.");
  }
  return { userId: context.userId, isAdmin };
}

/** Reads every row of a query, working around the 1000-row page limit. */
async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
    if (from > 50_000) break;
  }
  return out;
}

function oldest(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) <= new Date(b) ? a : b;
}

const className = (c: unknown) => (c as { name?: string } | null)?.name ?? "Class";

export const getGradingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GradingOverview> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const scope = await requireGrader(context as never);

    let aQuery = supabaseAdmin
      .from("assignments")
      .select("id, title, class_id, subject, due_date, max_marks, classes(name)")
      .eq("archived", false);
    if (!scope.isAdmin) aQuery = aQuery.eq("teacher_id", scope.userId);
    let qQuery = supabaseAdmin
      .from("quizzes")
      .select("id, title, class_id, kind, classes(name)")
      .eq("archived", false);
    if (!scope.isAdmin) qQuery = qQuery.eq("teacher_id", scope.userId);
    const [{ data: assignments, error: aErr }, { data: quizzes, error: qErr }] = await Promise.all([
      aQuery,
      qQuery,
    ]);
    if (aErr) throw new Error(aErr.message);
    if (qErr) throw new Error(qErr.message);

    const aIds = (assignments ?? []).map((a) => a.id);
    const qIds = (quizzes ?? []).map((q) => q.id);
    const classIds = [
      ...new Set([
        ...(assignments ?? []).map((a) => a.class_id),
        ...(quizzes ?? []).map((q) => q.class_id),
      ]),
    ];

    const [subs, attempts, members] = await Promise.all([
      aIds.length
        ? fetchAll((from, to) =>
            supabaseAdmin
              .from("submissions")
              .select(
                "id, assignment_id, student_id, status, is_late, submitted_at, grade_released, reviewed_at",
              )
              .in("assignment_id", aIds)
              .not("submitted_at", "is", null)
              .range(from, to),
          )
        : Promise.resolve([]),
      qIds.length
        ? fetchAll((from, to) =>
            supabaseAdmin
              .from("quiz_attempts")
              .select(
                "id, quiz_id, student_id, status, needs_manual_grading, submitted_at, graded_at",
              )
              .in("quiz_id", qIds)
              .in("status", ["submitted", "graded"])
              .range(from, to),
          )
        : Promise.resolve([]),
      classIds.length
        ? fetchAll((from, to) =>
            supabaseAdmin
              .from("class_members")
              .select("class_id, student_id")
              .in("class_id", classIds)
              .eq("member_role", "student")
              .range(from, to),
          )
        : Promise.resolve([]),
    ]);

    const roster = new Map<string, number>();
    for (const m of members) roster.set(m.class_id, (roster.get(m.class_id) ?? 0) + 1);

    const weekAgo = Date.now() - 7 * 86_400_000;
    let gradedThisWeek = 0;

    const aGroups = new Map<string, AssignmentGroup>();
    for (const a of assignments ?? []) {
      aGroups.set(a.id, {
        id: a.id,
        title: a.title,
        class_id: a.class_id,
        class_name: className(a.classes),
        subject: a.subject,
        due_date: a.due_date,
        max_marks: Number(a.max_marks) || 0,
        waiting: 0,
        late_waiting: 0,
        graded_unreleased: 0,
        released: 0,
        returned: 0,
        roster: roster.get(a.class_id) ?? 0,
        oldest_waiting_at: null,
      });
    }
    const waitingItems: (WaitingItem & { _student_id: string })[] = [];
    for (const s of subs) {
      const g = aGroups.get(s.assignment_id);
      if (!g) continue;
      if (s.status === "submitted" || s.status === "late") {
        g.waiting += 1;
        if (s.is_late || s.status === "late") g.late_waiting += 1;
        g.oldest_waiting_at = oldest(g.oldest_waiting_at, s.submitted_at);
        waitingItems.push({
          kind: "assignment",
          group_id: g.id,
          item_id: s.id,
          title: g.title,
          class_name: g.class_name,
          student_name: "",
          submitted_at: s.submitted_at,
          is_late: Boolean(s.is_late || s.status === "late"),
          _student_id: s.student_id,
        });
      } else if (s.status === "reviewed" || s.status === "completed") {
        if (s.grade_released) g.released += 1;
        else g.graded_unreleased += 1;
        if (s.reviewed_at && new Date(s.reviewed_at).getTime() > weekAgo) gradedThisWeek += 1;
      } else if (s.status === "returned") {
        g.returned += 1;
      }
    }

    const qGroups = new Map<string, QuizGroup>();
    for (const q of quizzes ?? []) {
      qGroups.set(q.id, {
        id: q.id,
        title: q.title,
        class_id: q.class_id,
        class_name: className(q.classes),
        kind: q.kind,
        waiting: 0,
        graded: 0,
        attempts: 0,
        oldest_waiting_at: null,
      });
    }
    for (const t of attempts) {
      const g = qGroups.get(t.quiz_id);
      if (!g) continue;
      g.attempts += 1;
      if (t.status === "submitted" && t.needs_manual_grading) {
        g.waiting += 1;
        g.oldest_waiting_at = oldest(g.oldest_waiting_at, t.submitted_at);
        waitingItems.push({
          kind: "quiz",
          group_id: g.id,
          item_id: t.id,
          title: g.title,
          class_name: g.class_name,
          student_name: "",
          submitted_at: t.submitted_at,
          is_late: false,
          _student_id: t.student_id,
        });
      } else if (t.status === "graded") {
        g.graded += 1;
        if (t.graded_at && new Date(t.graded_at).getTime() > weekAgo) gradedThisWeek += 1;
      }
    }

    waitingItems.sort(
      (x, y) => new Date(x.submitted_at ?? 0).getTime() - new Date(y.submitted_at ?? 0).getTime(),
    );
    const upNext = waitingItems.slice(0, 6);
    const ids = [...new Set(upNext.map((i) => i._student_id))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles, error } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (error) throw new Error(error.message);
      for (const p of profiles ?? []) names.set(p.id, p.full_name);
    }

    const aList = [...aGroups.values()];
    const qList = [...qGroups.values()];
    return {
      assignments: aList.filter(
        (g) => g.waiting + g.graded_unreleased + g.released + g.returned > 0,
      ),
      quizzes: qList.filter((g) => g.attempts > 0),
      up_next: upNext.map(({ _student_id, ...item }) => ({
        ...item,
        student_name: names.get(_student_id) ?? "Student",
      })),
      stats: {
        waiting:
          aList.reduce((n, g) => n + g.waiting, 0) + qList.reduce((n, g) => n + g.waiting, 0),
        late_waiting: aList.reduce((n, g) => n + g.late_waiting, 0),
        ready_to_release: aList.reduce((n, g) => n + g.graded_unreleased, 0),
        graded_this_week: gradedThisWeek,
      },
    };
  });

export const getAssignmentGradingQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assignmentId: string }) => {
    if (!input?.assignmentId || typeof input.assignmentId !== "string") {
      throw new Error("A valid assignment id is required");
    }
    return { assignmentId: input.assignmentId };
  })
  .handler(async ({ data, context }): Promise<AssignmentQueue> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const scope = await requireGrader(context as never);

    const { data: assignment, error } = await supabaseAdmin
      .from("assignments")
      .select("id, title, max_marks, due_date, class_id, teacher_id, classes(name)")
      .eq("id", data.assignmentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!assignment) throw new Error("Assignment not found.");
    if (!scope.isAdmin && assignment.teacher_id !== scope.userId) {
      throw new Error("You are not allowed to grade this assignment.");
    }

    const [subs, members] = await Promise.all([
      fetchAll((from, to) =>
        supabaseAdmin
          .from("submissions")
          .select(
            "id, student_id, status, is_late, submitted_at, marks_awarded, grade_released, reviewed_at, paste_violation_count, mode",
          )
          .eq("assignment_id", data.assignmentId)
          .not("submitted_at", "is", null)
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabaseAdmin
          .from("class_members")
          .select("student_id, full_name")
          .eq("class_id", assignment.class_id)
          .eq("member_role", "student")
          .range(from, to),
      ),
    ]);

    const ids = [
      ...new Set([...subs.map((s) => s.student_id), ...members.map((m) => m.student_id)]),
    ];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (pErr) throw new Error(pErr.message);
      for (const p of profiles ?? []) names.set(p.id, p.full_name);
    }
    for (const m of members)
      if (m.full_name && !names.get(m.student_id)) names.set(m.student_id, m.full_name);
    const nameOf = (id: string) => names.get(id) || "Student";

    const submitted = new Set(subs.map((s) => s.student_id));
    return {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        max_marks: Number(assignment.max_marks) || 0,
        class_name: className(assignment.classes),
        due_date: assignment.due_date,
      },
      rows: subs.map((s) => ({
        submission_id: s.id,
        student_id: s.student_id,
        student_name: nameOf(s.student_id),
        status: s.status,
        is_late: Boolean(s.is_late),
        submitted_at: s.submitted_at,
        marks_awarded: s.marks_awarded == null ? null : Number(s.marks_awarded),
        grade_released: Boolean(s.grade_released),
        reviewed_at: s.reviewed_at,
        paste_violation_count: Number(s.paste_violation_count) || 0,
        mode: s.mode,
      })),
      missing: members
        .filter((m) => !submitted.has(m.student_id))
        .map((m) => ({ student_id: m.student_id, student_name: nameOf(m.student_id) }))
        .sort((a, b) => a.student_name.localeCompare(b.student_name)),
    };
  });

export const getQuizGradingQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { quizId: string }) => {
    if (!input?.quizId || typeof input.quizId !== "string") {
      throw new Error("A valid quiz id is required");
    }
    return { quizId: input.quizId };
  })
  .handler(async ({ data, context }): Promise<QuizQueue> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const scope = await requireGrader(context as never);

    const { data: quiz, error } = await supabaseAdmin
      .from("quizzes")
      .select("id, title, teacher_id, passing_marks, classes(name)")
      .eq("id", data.quizId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!quiz) throw new Error("Quiz not found.");
    if (!scope.isAdmin && quiz.teacher_id !== scope.userId) {
      throw new Error("You are not allowed to grade this quiz.");
    }

    const attempts = await fetchAll((from, to) =>
      supabaseAdmin
        .from("quiz_attempts")
        .select(
          "id, student_id, attempt_no, status, needs_manual_grading, score, max_score, submitted_at, graded_at",
        )
        .eq("quiz_id", data.quizId)
        .in("status", ["submitted", "graded"])
        .range(from, to),
    );

    const ids = [...new Set(attempts.map((a) => a.student_id))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profiles, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (pErr) throw new Error(pErr.message);
      for (const p of profiles ?? []) names.set(p.id, p.full_name);
    }

    return {
      quiz: {
        id: quiz.id,
        title: quiz.title,
        class_name: className(quiz.classes),
        passing_marks: Number(quiz.passing_marks) || 0,
      },
      rows: attempts.map((a) => ({
        attempt_id: a.id,
        student_id: a.student_id,
        student_name: names.get(a.student_id) || "Student",
        attempt_no: a.attempt_no,
        status: a.status,
        needs_manual_grading: Boolean(a.needs_manual_grading),
        score: a.score == null ? null : Number(a.score),
        max_score: a.max_score == null ? null : Number(a.max_score),
        submitted_at: a.submitted_at,
        graded_at: a.graded_at,
      })),
    };
  });
