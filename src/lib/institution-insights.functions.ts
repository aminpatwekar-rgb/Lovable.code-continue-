import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InsightClass = {
  id: string;
  name: string;
  departmentName: string | null;
  teacherName: string;
  students: number;
  assignments: number;
  submitted: number;
  waitingToGrade: number;
  graded: number;
  released: number;
  avgReleasedPct: number | null;
  quizzes: number;
  quizAttempts: number;
  quizAvgPct: number | null;
};

export type InstitutionInsights = {
  institutionName: string;
  totals: {
    classes: number;
    students: number;
    assignments: number;
    submitted: number;
    waitingToGrade: number;
    graded: number;
    released: number;
    avgReleasedPct: number | null;
    quizzes: number;
    quizAttempts: number;
    quizAvgPct: number | null;
  };
  classes: InsightClass[];
};

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** Institution-wide, read-only teaching activity for the caller's own institution only. */
export const getInstitutionInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InstitutionInsights> => {
    const { data: isInstAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "institution_admin",
    });
    if (roleError) throw new Error("Could not verify institution administrator permissions.");
    if (!isInstAdmin) throw new Error("Only institution administrators can view institution reports.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: profile } = await admin.from("profiles").select("institution_id").eq("id", context.userId).maybeSingle();
    const institutionId = profile?.institution_id as string | null;
    if (!institutionId) throw new Error("Your account is not assigned to an institution. Contact the platform administrator.");
    const { data: inScope, error: scopeError } = await context.supabase.rpc("is_institution_admin", { _institution_id: institutionId });
    if (scopeError || !inScope) throw new Error("You are not authorized to view this institution.");

    const { data: inst } = await admin.from("institutions").select("name").eq("id", institutionId).maybeSingle();

    const { data: classes, error: classError } = await admin
      .from("classes")
      .select("id, name, teacher_id, department_id, departments(name)")
      .eq("institution_id", institutionId)
      .eq("archived", false)
      .order("name");
    if (classError) throw new Error("Could not load institution classes.");
    const classIds: string[] = (classes ?? []).map((c: any) => c.id);
    const none = ["00000000-0000-0000-0000-000000000000"];
    const ids = classIds.length ? classIds : none;

    const teacherIds = [...new Set((classes ?? []).map((c: any) => c.teacher_id))];
    const [members, assignments, quizzes, teachers] = await Promise.all([
      admin.from("class_members").select("class_id, student_id").in("class_id", ids).eq("member_role", "student"),
      admin.from("assignments").select("id, class_id, max_marks").in("class_id", ids).eq("archived", false).eq("published", true),
      admin.from("quizzes").select("id, class_id").in("class_id", ids).eq("archived", false).eq("published", true),
      admin.from("profiles").select("id, full_name").in("id", teacherIds.length ? teacherIds : none),
    ]);
    if (members.error || assignments.error || quizzes.error) throw new Error("Could not load institution activity.");

    const assignmentRows: any[] = assignments.data ?? [];
    const quizRows: any[] = quizzes.data ?? [];
    const aIds = assignmentRows.map((a) => a.id);
    const qIds = quizRows.map((q) => q.id);
    const [subs, attempts] = await Promise.all([
      admin.from("submissions").select("assignment_id, status, marks_awarded, grade_released").in("assignment_id", aIds.length ? aIds : none),
      admin.from("quiz_attempts").select("quiz_id, status, score, max_score").in("quiz_id", qIds.length ? qIds : none),
    ]);
    if (subs.error || attempts.error) throw new Error("Could not load submissions and quiz attempts.");

    const assignmentById = new Map(assignmentRows.map((a) => [a.id, a]));
    const quizById = new Map(quizRows.map((q) => [q.id, q]));
    const teacherName = new Map<string, string>((teachers.data ?? []).map((t: any) => [t.id, t.full_name]));

    const rows = new Map<string, InsightClass & { _pct: number[]; _qpct: number[]; _students: Set<string> }>();
    for (const c of classes ?? []) {
      rows.set(c.id, {
        id: c.id, name: c.name, departmentName: c.departments?.name ?? null,
        teacherName: teacherName.get(c.teacher_id) ?? "Unknown",
        students: 0, assignments: 0, submitted: 0, waitingToGrade: 0, graded: 0, released: 0, avgReleasedPct: null,
        quizzes: 0, quizAttempts: 0, quizAvgPct: null, _pct: [], _qpct: [], _students: new Set(),
      });
    }
    const allStudents = new Set<string>();
    for (const m of members.data ?? []) { rows.get(m.class_id)?._students.add(m.student_id); allStudents.add(m.student_id); }
    for (const a of assignmentRows) { const r = rows.get(a.class_id); if (r) r.assignments++; }
    for (const q of quizRows) { const r = rows.get(q.class_id); if (r) r.quizzes++; }
    for (const s of subs.data ?? []) {
      const a = assignmentById.get(s.assignment_id); const r = a && rows.get(a.class_id);
      if (!r || s.status === "not_started" || s.status === "in_progress") continue;
      r.submitted++;
      if (s.status === "submitted" || s.status === "late") r.waitingToGrade++;
      if (s.status === "graded" || s.marks_awarded != null) r.graded++;
      if (s.grade_released && s.marks_awarded != null) {
        r.released++;
        const max = Number(a.max_marks);
        if (max > 0) r._pct.push((Number(s.marks_awarded) / max) * 100);
      }
    }
    for (const t of attempts.data ?? []) {
      const q = quizById.get(t.quiz_id); const r = q && rows.get(q.class_id);
      if (!r || t.status === "in_progress") continue;
      r.quizAttempts++;
      if (t.score != null && Number(t.max_score) > 0) r._qpct.push((Number(t.score) / Number(t.max_score)) * 100);
    }

    const allPct: number[] = []; const allQ: number[] = [];
    const out: InsightClass[] = [...rows.values()].map(({ _pct, _qpct, _students, ...r }) => {
      allPct.push(..._pct); allQ.push(..._qpct);
      return { ...r, students: _students.size, avgReleasedPct: avg(_pct), quizAvgPct: avg(_qpct) };
    });
    const sum = (k: keyof InsightClass) => out.reduce((n, r) => n + (r[k] as number), 0);
    return {
      institutionName: inst?.name ?? "Your institution",
      totals: {
        classes: out.length, students: allStudents.size, assignments: sum("assignments"), submitted: sum("submitted"),
        waitingToGrade: sum("waitingToGrade"), graded: sum("graded"), released: sum("released"), avgReleasedPct: avg(allPct),
        quizzes: sum("quizzes"), quizAttempts: sum("quizAttempts"), quizAvgPct: avg(allQ),
      },
      classes: out,
    };
  });
