import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { csvObjects } from "@/lib/csv";

function text(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeEmail(v: unknown) {
  return text(v).toLowerCase();
}

export const importStudentsFromCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { classId: string; csv: string }) => {
    if (!input.classId || typeof input.classId !== "string") throw new Error("Class is required.");
    if (typeof input.csv !== "string" || input.csv.length > 2_000_000) {
      throw new Error("CSV is missing or too large.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: klass, error: classError } = await supabaseAdmin
      .from("classes")
      .select("id, teacher_id, archived")
      .eq("id", data.classId)
      .maybeSingle();
    if (classError) throw classError;
    if (!klass) throw new Error("Class not found.");
    const isAdmin = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin.error) throw isAdmin.error;
    if (klass.teacher_id !== context.userId && !isAdmin.data) {
      throw new Error("You are not allowed to import students into this class.");
    }

    const rows = csvObjects(data.csv);
    if (!rows.length) throw new Error("The CSV has no student rows.");
    if (rows.length > 500) throw new Error("Import up to 500 students at a time.");

    const normalized = rows.map((row, index) => ({
      line: index + 2,
      email: normalizeEmail(row.email),
      fullName: text(row.full_name),
      rollNo: text(row.roll_no),
      erNo: text(row.er_no),
      srNo: text(row.sr_no),
    }));

    const invalid = normalized.filter((r) => !r.email || !/^\S+@\S+\.\S+$/.test(r.email) || !r.fullName);
    if (invalid.length) {
      throw new Error(`CSV contains ${invalid.length} invalid row(s). Email and full_name are required.`);
    }

    const emails = [...new Set(normalized.map((r) => r.email))];
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .in("email", emails);
    if (profilesError) throw profilesError;

    const profileByEmail = new Map((profiles ?? []).map((p) => [normalizeEmail(p.email), p]));
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("class_members")
      .select("student_id, full_name, roll_no, er_no, sr_no, member_role")
      .eq("class_id", data.classId);
    if (existingError) throw existingError;

    const existingIds = new Set((existing ?? []).map((m) => m.student_id));
    const existingRoll = new Set((existing ?? []).filter((m) => m.member_role === "student" && m.roll_no).map((m) => String(m.roll_no).trim().toLowerCase()));
    const existingEr = new Set((existing ?? []).filter((m) => m.member_role === "student" && m.er_no).map((m) => String(m.er_no).trim().toLowerCase()));
    const existingSr = new Set((existing ?? []).filter((m) => m.member_role === "student" && m.sr_no).map((m) => String(m.sr_no).trim().toLowerCase()));

    const limRes = await supabaseAdmin.rpc("plan_limit", {
      _user_id: klass.teacher_id,
      _key: "max_students_per_class",
    });
    if (limRes.error) throw limRes.error;
    const limit = Number(limRes.data ?? 30);
    let currentCount = (existing ?? []).filter((m) => m.member_role === "student").length;

    const imported: string[] = [];
    const skipped: { line: number; reason: string }[] = [];

    for (const row of normalized) {
      const profile = profileByEmail.get(row.email);
      if (!profile) {
        skipped.push({ line: row.line, reason: "No ONYX account exists for this email." });
        continue;
      }
      const roleRes = await supabaseAdmin.from("user_roles").select("role").eq("user_id", profile.id);
      if (roleRes.error) throw roleRes.error;
      if (!(roleRes.data ?? []).some((r) => r.role === "student")) {
        skipped.push({ line: row.line, reason: "Email does not belong to a student account." });
        continue;
      }
      if (existingIds.has(profile.id)) {
        skipped.push({ line: row.line, reason: "Student is already in this class." });
        continue;
      }
      if (limit >= 0 && currentCount >= limit) {
        skipped.push({ line: row.line, reason: `Class student limit of ${limit} reached.` });
        continue;
      }
      if (row.rollNo && existingRoll.has(row.rollNo.toLowerCase())) {
        skipped.push({ line: row.line, reason: "Roll No. already exists in this class." });
        continue;
      }
      if (row.erNo && existingEr.has(row.erNo.toLowerCase())) {
        skipped.push({ line: row.line, reason: "ER No. already exists in this class." });
        continue;
      }
      if (row.srNo && existingSr.has(row.srNo.toLowerCase())) {
        skipped.push({ line: row.line, reason: "Sr No. already exists in this class." });
        continue;
      }

      const { error } = await supabaseAdmin.from("class_members").insert({
        class_id: data.classId,
        student_id: profile.id,
        full_name: row.fullName,
        roll_no: row.rollNo || null,
        er_no: row.erNo || null,
        sr_no: row.srNo || null,
        member_role: "student",
      });
      if (error) {
        skipped.push({ line: row.line, reason: error.message });
        continue;
      }
      imported.push(row.email);
      existingIds.add(profile.id);
      currentCount += 1;
      if (row.rollNo) existingRoll.add(row.rollNo.toLowerCase());
      if (row.erNo) existingEr.add(row.erNo.toLowerCase());
      if (row.srNo) existingSr.add(row.srNo.toLowerCase());
    }

    return {
      total: normalized.length,
      imported: imported.length,
      skipped: skipped.length,
      importedEmails: imported,
      skippedRows: skipped,
    };
  });

export const getPlanSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: code, error: codeError }, { data: plans, error: plansError }, { data: storage, error: storageError }] = await Promise.all([
      supabaseAdmin.rpc("current_plan_code", { _user_id: context.userId }),
      supabaseAdmin.from("billing_plans").select("code,name,monthly_price_inr,annual_price_inr,limits,features").order("monthly_price_inr"),
      supabaseAdmin.rpc("get_storage_usage", { _user_id: context.userId }),
    ]);
    if (codeError) throw codeError;
    if (plansError) throw plansError;
    if (storageError) throw storageError;
    const plan = (plans ?? []).find((p) => p.code === code) ?? (plans ?? [])[0];
    return {
      code: code ?? "free",
      plan: plan ?? null,
      storageUsed: Number(storage ?? 0),
    };
  });
