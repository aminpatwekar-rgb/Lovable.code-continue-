import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ImportStudent = {
  email: string;
  full_name: string;
  roll_no?: string;
  er_no?: string;
  sr_no?: string;
};

export const importClassStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { classId: string; students: ImportStudent[] }) => {
    if (!input || typeof input.classId !== "string" || !Array.isArray(input.students)) {
      throw new Error("Invalid student import");
    }
    if (input.students.length > 500) throw new Error("CSV is limited to 500 students at a time");
    return {
      classId: input.classId,
      students: input.students.map((s) => ({
        email: String(s.email ?? "").trim().toLowerCase(),
        full_name: String(s.full_name ?? "").trim(),
        roll_no: String(s.roll_no ?? "").trim(),
        er_no: String(s.er_no ?? "").trim(),
        sr_no: String(s.sr_no ?? "").trim(),
      })),
    };
  })
  .handler(async ({ data, context }) => {
    const { data: canManage, error: roleError } = await context.supabase.rpc("is_class_teacher", {
      _class_id: data.classId,
      _user_id: context.userId,
    });
    if (roleError) throw new Error("Could not verify class permissions");

    const { data: admin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!canManage && !admin) throw new Error("Only the class teacher or an admin can import students");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emails = [...new Set(data.students.map((s) => s.email).filter(Boolean))];
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .in("email", emails);
    if (profilesError) throw new Error(profilesError.message);

    const byEmail = new Map((profiles ?? []).map((p) => [String(p.email ?? "").toLowerCase(), p]));
    const results = { imported: 0, skipped: 0, errors: [] as string[] };

    for (const [index, student] of data.students.entries()) {
      if (!student.email) {
        results.skipped += 1;
        results.errors.push(`Row ${index + 2}: email is required`);
        continue;
      }
      const profile = byEmail.get(student.email);
      if (!profile) {
        results.skipped += 1;
        results.errors.push(`Row ${index + 2}: no ONYX account found for ${student.email}`);
        continue;
      }
      if (!student.full_name) student.full_name = profile.full_name?.trim() ?? "";
      if (!student.full_name || !student.roll_no || !student.er_no || !student.sr_no) {
        results.skipped += 1;
        results.errors.push(`Row ${index + 2}: full_name, roll_no, er_no and sr_no are required`);
        continue;
      }

      const { error } = await supabaseAdmin.from("class_members").upsert(
        {
          class_id: data.classId,
          student_id: profile.id,
          full_name: student.full_name,
          roll_no: student.roll_no,
          er_no: student.er_no,
          sr_no: student.sr_no,
          member_role: "student",
        },
        { onConflict: "class_id,student_id" },
      );
      if (error) {
        results.skipped += 1;
        results.errors.push(`Row ${index + 2}: ${error.message}`);
      } else {
        results.imported += 1;
      }
    }

    return results;
  });
