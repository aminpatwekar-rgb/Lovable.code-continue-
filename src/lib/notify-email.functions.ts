import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Each function verifies the caller caused the event before emailing. Sends are
// best-effort: a failed email never breaks the action that triggered it.

const idOnly = (input: { id: string }) => {
  if (!input || typeof input.id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.id)) {
    throw new Error("Invalid id");
  }
  return { id: input.id };
};

async function safeSend(template: string, to: string | null | undefined, data: Record<string, unknown>, key: string) {
  if (!to) return false;
  try {
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const r = await sendTemplateEmail(template, to, { templateData: data, idempotencyKey: key });
    return r.sent;
  } catch (e) {
    console.error(`[email] ${template} failed`, e);
    return false;
  }
}

async function profilesById(admin: any, ids: string[]) {
  if (!ids.length) return new Map<string, { email: string | null; full_name: string }>();
  const { data } = await admin.from("profiles").select("id, email, full_name").in("id", ids);
  return new Map<string, { email: string | null; full_name: string }>(
    (data ?? []).map((p: any) => [p.id, { email: p.email, full_name: p.full_name }]),
  );
}

async function loadTeachableAssignment(supabase: any, userId: string, assignmentId: string) {
  const { data: a } = await supabase
    .from("assignments")
    .select("id, title, due_date, max_marks, class_id, published, classes(name)")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!a) throw new Error("Assignment not found");
  const { data: ok } = await supabase.rpc("is_class_teacher", { _class_id: a.class_id, _user_id: userId });
  if (!ok) throw new Error("Forbidden");
  return a;
}

/** Teacher just created a published assignment: email each student in the class. */
export const emailAssignmentPosted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(idOnly)
  .handler(async ({ data, context }) => {
    const a = await loadTeachableAssignment(context.supabase, context.userId, data.id);
    if (!a.published) return { sent: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: members } = await supabaseAdmin
      .from("class_members")
      .select("student_id")
      .eq("class_id", a.class_id)
      .eq("member_role", "student")
      .limit(500);
    const ids = (members ?? []).map((m) => m.student_id);
    const people = await profilesById(supabaseAdmin, ids);
    let sent = 0;
    for (const sid of ids) {
      const p = people.get(sid);
      const ok = await safeSend("assignment-posted", p?.email, {
        name: p?.full_name, title: a.title, dueDate: a.due_date, className: a.classes?.name, assignmentId: a.id,
      }, `assignment-posted-${a.id}-${sid}`);
      if (ok) sent++;
    }
    return { sent };
  });

/** Teacher released grades: email each student whose grade is now visible. */
export const emailGradesReleased = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(idOnly)
  .handler(async ({ data, context }) => {
    const a = await loadTeachableAssignment(context.supabase, context.userId, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin
      .from("submissions")
      .select("id, student_id, marks_awarded")
      .eq("assignment_id", a.id)
      .eq("grade_released", true)
      .limit(500);
    const people = await profilesById(supabaseAdmin, (subs ?? []).map((s) => s.student_id));
    let sent = 0;
    for (const s of subs ?? []) {
      const p = people.get(s.student_id);
      // Keyed per submission, so releasing again never re-sends the same grade email.
      const ok = await safeSend("grade-released", p?.email, {
        name: p?.full_name, title: a.title, className: a.classes?.name,
        marks: s.marks_awarded, maxMarks: a.max_marks, assignmentId: a.id,
      }, `grade-released-${s.id}`);
      if (ok) sent++;
    }
    return { sent };
  });

/** Student turned in work: confirm to that student only. */
export const emailSubmissionReceived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(idOnly)
  .handler(async ({ data, context }) => {
    const { data: s } = await context.supabase
      .from("submissions")
      .select("id, student_id, submitted_at, is_late, assignment_id, assignments(title)")
      .eq("id", data.id)
      .maybeSingle();
    if (!s || s.student_id !== context.userId || !s.submitted_at) return { sent: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const p = (await profilesById(supabaseAdmin, [context.userId])).get(context.userId);
    const sent = await safeSend("submission-received", p?.email, {
      name: p?.full_name, title: (s as any).assignments?.title, late: s.is_late, assignmentId: s.assignment_id,
    }, `submission-received-${s.id}-${s.submitted_at}`);
    return { sent };
  });

/** A teacher requested co-teacher access: tell the class owner. */
export const emailCoTeacherRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { code: string }) => {
    const code = String(input?.code ?? "").trim().toUpperCase();
    if (!code || code.length > 32) throw new Error("Invalid code");
    return { code };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reqs } = await supabaseAdmin
      .from("class_co_teacher_requests")
      .select("id, class_id, full_name")
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5);
    if (!reqs?.length) return { sent: false };
    // The request the caller just created is their newest pending one.
    const req = reqs[0]!;
    const { data: cls } = await supabaseAdmin
      .from("classes").select("id, name, teacher_id").eq("id", req.class_id).maybeSingle();
    if (!cls) return { sent: false };
    const owner = (await profilesById(supabaseAdmin, [cls.teacher_id])).get(cls.teacher_id);
    const sent = await safeSend("co-teacher-request", owner?.email, {
      name: owner?.full_name, requester: req.full_name, className: cls.name, classId: cls.id,
    }, `co-teacher-request-${req.id}`);
    return { sent };
  });
