import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { csvObjects } from "@/lib/csv";

/**
 * Permanently deletes a platform user. Admin-only: the caller's role is verified
 * through their own (RLS-scoped) client before any privileged work happens.
 */
export const deletePlatformUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string }) => {
    if (!input || typeof input.userId !== "string" || input.userId.length < 10) {
      throw new Error("A valid user id is required");
    }
    return { userId: input.userId };
  })
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) {
      throw new Error("You cannot delete your own account");
    }

    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error("Could not verify permissions");
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: targetRoles, error: targetRolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if (targetRolesError) throw new Error("Could not verify target account roles");
    const isTargetAdmin = (targetRoles ?? []).some((r) => r.role === "admin");
    if (isTargetAdmin) {
      const { count, error: adminCountError } = await supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (adminCountError || count == null) {
        throw new Error("Could not verify the administrator count");
      }
      if (count <= 1) throw new Error("At least one administrator must remain");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/**
 * Bulk onboarding for an existing institution roster. It updates roles and
 * affiliation for registered ONYX accounts only; it never creates accounts,
 * sends invitations, or promotes anyone to platform admin.
 */
export const bulkOnboardUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { csv: string }) => {
    if (typeof input?.csv !== "string" || !input.csv.trim() || input.csv.length > 2_000_000) {
      throw new Error("Upload or paste a CSV up to 2 MB.");
    }
    return { csv: input.csv };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleCheckError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleCheckError) throw new Error("Could not verify platform administrator permissions");
    if (!isAdmin) throw new Error("Only platform admins can bulk onboard accounts.");

    const inputRows = csvObjects(data.csv);
    if (!inputRows.length) throw new Error("The CSV has no data rows.");
    if (inputRows.length > 500) throw new Error("Import up to 500 accounts at a time.");

    const seen = new Set<string>();
    const skippedRows: { line: number; reason: string }[] = [];
    const rows: {
      line: number;
      email: string;
      role: "student" | "teacher";
      institution: string;
    }[] = [];

    inputRows.forEach((row, index) => {
      const line = index + 2;
      const email = String(row["email"] ?? "").trim().toLowerCase();
      const role = String(row["role"] ?? "").trim().toLowerCase();
      const institution = String(row["institution"] ?? "").trim().slice(0, 160);
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        skippedRows.push({ line, reason: "A valid email is required." });
        return;
      }
      if (role !== "student" && role !== "teacher") {
        skippedRows.push({ line, reason: "Role must be student or teacher. Platform-admin promotion is not supported by CSV." });
        return;
      }
      if (!institution) {
        skippedRows.push({ line, reason: "Institution / department is required." });
        return;
      }
      if (seen.has(email)) {
        skippedRows.push({ line, reason: "Duplicate email in this CSV." });
        return;
      }
      seen.add(email);
      rows.push({ line, email, role, institution });
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emails = [...new Set(rows.map((row) => row.email))];
    const { data: profiles, error: profilesError } = emails.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, email, institution")
          .in("email", emails)
      : { data: [], error: null };
    if (profilesError) throw new Error(profilesError.message);

    const profileByEmail = new Map(
      (profiles ?? []).map((profile) => [
        String(profile.email ?? "").trim().toLowerCase(),
        profile,
      ]),
    );
    let updated = 0;

    for (const row of rows) {
      const profile = profileByEmail.get(row.email);
      if (!profile) {
        skippedRows.push({
          line: row.line,
          reason: "No ONYX account exists for this email. Create or invite the account first.",
        });
        continue;
      }

      const { error: affiliationError } = await supabaseAdmin
        .from("profiles")
        .update({ institution: row.institution })
        .eq("id", profile.id);
      if (affiliationError) {
        skippedRows.push({ line: row.line, reason: "Could not save institution / department." });
        continue;
      }

      const { error: roleError } = await context.supabase.rpc("admin_set_user_role", {
        _user_id: profile.id,
        _role: row.role,
      });
      if (roleError) {
        // Best-effort rollback of the affiliation if the role change is rejected.
        await supabaseAdmin
          .from("profiles")
          .update({ institution: profile.institution ?? null })
          .eq("id", profile.id);
        skippedRows.push({ line: row.line, reason: "Role could not be updated; the previous affiliation was restored." });
        continue;
      }
      updated += 1;
    }

    return {
      total: inputRows.length,
      updated,
      skipped: skippedRows.length,
      skippedRows: skippedRows.sort((a, b) => a.line - b.line),
    };
  });
