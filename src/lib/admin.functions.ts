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


async function requireInstitutionAdmin(client: any, userId: string) {
  const { data, error } = await client.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error("Could not verify platform administrator permissions.");
  if (!data) throw new Error("Only platform admins can manage institutions.");
}

function validateInstitutionId(id: unknown): string {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error("A valid institution is required.");
  }
  return id;
}

/** Edit directory details and keep profile affiliation labels in sync with institution renames. */
export const updateInstitutionDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { institutionId: string; name: string; code?: string; city?: string }) => {
    const institutionId = validateInstitutionId(input?.institutionId);
    const name = String(input?.name ?? "").trim();
    const code = String(input?.code ?? "").trim();
    const city = String(input?.city ?? "").trim();
    if (!name || name.length > 160) throw new Error("Institution name is required (up to 160 characters).");
    if (code.length > 40) throw new Error("Institution code must be 40 characters or fewer.");
    if (city.length > 100) throw new Error("City must be 100 characters or fewer.");
    return { institutionId, name, code, city };
  })
  .handler(async ({ data, context }) => {
    await requireInstitutionAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: current, error: loadError } = await admin
      .from("institutions").select("id, name, code, city")
      .eq("id", data.institutionId).maybeSingle();
    if (loadError) throw new Error("Could not load this institution.");
    if (!current) throw new Error("This institution no longer exists.");

    const { error: updateError } = await admin.from("institutions")
      .update({ name: data.name, code: data.code || null, city: data.city || null })
      .eq("id", data.institutionId);
    if (updateError) {
      if (updateError.code === "23505") throw new Error("An institution with that name already exists.");
      throw new Error(updateError.message);
    }

    if (current.name !== data.name) {
      const { error: affiliationError } = await admin.from("profiles")
        .update({ institution: data.name }).eq("institution", current.name);
      if (affiliationError) {
        await admin.from("institutions").update({
          name: current.name, code: current.code, city: current.city,
        }).eq("id", data.institutionId);
        throw new Error("Could not update student/staff affiliations; the institution name was restored.");
      }
    }
    return { ok: true, name: data.name };
  });

/** Assign existing ONYX student/teacher accounts. This never changes roles or creates accounts. */
export const assignInstitutionMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { institutionId: string; userIds?: string[]; emails?: string[] }) => {
    const institutionId = validateInstitutionId(input?.institutionId);
    const userIds = Array.isArray(input?.userIds)
      ? [...new Set(input.userIds.filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))]
      : [];
    const emails = Array.isArray(input?.emails)
      ? [...new Set(input.emails.map((email) => String(email).trim().toLowerCase()).filter(Boolean))]
      : [];
    if (userIds.length + emails.length === 0) throw new Error("Select accounts or provide CSV email addresses.");
    if (userIds.length + emails.length > 500) throw new Error("Add up to 500 accounts per batch.");
    if (emails.some((email) => !/^\S+@\S+\.\S+$/.test(email))) throw new Error("One or more email addresses are invalid.");
    return { institutionId, userIds, emails };
  })
  .handler(async ({ data, context }) => {
    await requireInstitutionAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: institution, error: institutionError } = await admin
      .from("institutions").select("id, name").eq("id", data.institutionId).maybeSingle();
    if (institutionError) throw new Error("Could not load this institution.");
    if (!institution) throw new Error("This institution no longer exists.");

    const profilesById = new Map<string, any>();
    const skippedRows: { email: string; reason: string }[] = [];
    if (data.userIds.length) {
      const { data: found, error } = await admin.from("profiles")
        .select("id, full_name, email, institution, is_active").in("id", data.userIds);
      if (error) throw new Error("Could not load selected accounts.");
      for (const profile of found ?? []) profilesById.set(profile.id, profile);
      for (const id of data.userIds) if (!profilesById.has(id)) skippedRows.push({ email: id, reason: "Account not found." });
    }
    if (data.emails.length) {
      const { data: found, error } = await admin.from("profiles")
        .select("id, full_name, email, institution, is_active").in("email", data.emails);
      if (error) throw new Error("Could not look up CSV email addresses.");
      const foundEmails = new Set<string>();
      for (const profile of found ?? []) {
        profilesById.set(profile.id, profile);
        foundEmails.add(String(profile.email ?? "").trim().toLowerCase());
      }
      for (const email of data.emails) if (!foundEmails.has(email)) {
        skippedRows.push({ email, reason: "No ONYX account exists for this email. The account must register first." });
      }
    }

    const candidates = [...profilesById.values()];
    if (!candidates.length) return { assigned: 0, skipped: skippedRows.length, skippedRows };
    const { data: roleRows, error: rolesError } = await admin.from("user_roles")
      .select("user_id, role").in("user_id", candidates.map((profile) => profile.id));
    if (rolesError) throw new Error("Could not verify student/staff roles.");
    const rolesByUser = new Map<string, string[]>();
    for (const row of roleRows ?? []) {
      const userRoles = rolesByUser.get(row.user_id) ?? [];
      userRoles.push(row.role);
      rolesByUser.set(row.user_id, userRoles);
    }

    const eligibleIds: string[] = [];
    for (const profile of candidates) {
      const email = String(profile.email ?? profile.id);
      const userRoles = rolesByUser.get(profile.id) ?? [];
      if (userRoles.includes("admin")) skippedRows.push({ email, reason: "Platform-admin accounts cannot be roster members." });
      else if (!userRoles.includes("student") && !userRoles.includes("teacher")) skippedRows.push({ email, reason: "Account must already have the student or teacher role." });
      else if (profile.is_active === false) skippedRows.push({ email, reason: "Account is suspended. Reactivate it before assigning it." });
      else if (String(profile.institution ?? "").trim().toLowerCase() === institution.name.trim().toLowerCase()) skippedRows.push({ email, reason: "Already assigned to this institution." });
      else eligibleIds.push(profile.id);
    }

    if (eligibleIds.length) {
      const { error } = await admin.from("profiles")
        .update({ institution: institution.name }).in("id", eligibleIds);
      if (error) throw new Error("Could not save institution roster: " + error.message);
    }
    return { assigned: eligibleIds.length, skipped: skippedRows.length, skippedRows };
  });

export type StudentOnboardingRowResult = {
  line: number;
  email: string;
  status: "invited" | "assigned" | "already_assigned" | "skipped" | "invite_failed" | "setup_failed";
  message: string;
};

export type StudentOnboardingResult = {
  total: number;
  invited: number;
  assignedExisting: number;
  alreadyAssigned: number;
  inviteFailed: number;
  setupFailed: number;
  skipped: number;
  rows: StudentOnboardingRowResult[];
};

/**
 * Create student accounts from an institution's roster and send each student an
 * invitation to set their own password. Existing student accounts are attached
 * only if they are not already affiliated with a different institution.
 * This endpoint is platform-admin-only and never promotes users to staff/admin.
 */
export const bulkCreateInstitutionStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { institutionId: string; csv: string }) => {
    const institutionId = validateInstitutionId(input?.institutionId);
    if (typeof input?.csv !== "string" || !input.csv.trim() || input.csv.length > 2_000_000) {
      throw new Error("Upload or paste a CSV up to 2 MB.");
    }
    return { institutionId, csv: input.csv };
  })
  .handler(async ({ data, context }): Promise<StudentOnboardingResult> => {
    await requireInstitutionAdmin(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: institution, error: institutionError } = await admin
      .from("institutions")
      .select("id, name")
      .eq("id", data.institutionId)
      .maybeSingle();
    if (institutionError) throw new Error("Could not load the selected institution.");
    if (!institution) throw new Error("This institution no longer exists.");

    const inputRows = csvObjects(data.csv);
    if (!inputRows.length) throw new Error("The CSV must contain a header row and at least one student row.");
    if (inputRows.length > 500) throw new Error("Import up to 500 student rows per batch.");

    const rows: Array<{ line: number; email: string; fullName: string }> = [];
    const outcomes: StudentOnboardingRowResult[] = [];
    const seen = new Set<string>();

    inputRows.forEach((row, index) => {
      const line = index + 2;
      const email = String(row["email"] ?? "").trim().toLowerCase();
      const fullName = String(row["full_name"] ?? row["name"] ?? "").trim().replace(/\s+/g, " ");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        outcomes.push({ line, email: email || "—", status: "skipped", message: "A valid email address is required." });
        return;
      }
      if (!fullName || fullName.length > 100) {
        outcomes.push({ line, email, status: "skipped", message: "A student's full_name is required (maximum 100 characters)." });
        return;
      }
      if (seen.has(email)) {
        outcomes.push({ line, email, status: "skipped", message: "Duplicate email in this CSV; the first row is kept." });
        return;
      }
      seen.add(email);
      rows.push({ line, email, fullName });
    });

    const emailList = rows.map((row) => row.email);
    const { data: profiles, error: profilesError } = emailList.length
      ? await admin
          .from("profiles")
          .select("id, full_name, email, institution, is_active, role_confirmed_at")
          .in("email", emailList)
      : { data: [], error: null };
    if (profilesError) throw new Error("Could not check existing ONYX accounts.");

    const profileByEmail = new Map<string, any>(
      (profiles ?? []).map((profile: any) => [String(profile.email ?? "").trim().toLowerCase(), profile]),
    );
    const existingProfiles = [...profileByEmail.values()];
    const rolesByUser = new Map<string, string[]>();
    if (existingProfiles.length) {
      const { data: roleRows, error: roleError } = await admin
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", existingProfiles.map((profile: any) => profile.id));
      if (roleError) throw new Error("Could not verify existing account roles.");
      for (const roleRow of roleRows ?? []) {
        const list = rolesByUser.get(roleRow.user_id) ?? [];
        list.push(String(roleRow.role));
        rolesByUser.set(roleRow.user_id, list);
      }
    }

    const normalizedInstitution = String(institution.name).trim().toLowerCase();
    const now = new Date().toISOString();

    const attachExistingStudent = async (
      row: { line: number; email: string; fullName: string },
      profile: any,
      invitePreviouslyFailed = false,
    ): Promise<void> => {
      const userRoles = rolesByUser.get(profile.id) ?? [];
      const currentInstitution = String(profile.institution ?? "").trim();
      if (userRoles.includes("admin") || userRoles.includes("teacher")) {
        outcomes.push({
          line: row.line, email: row.email, status: invitePreviouslyFailed ? "invite_failed" : "skipped",
          message: userRoles.includes("admin")
            ? "This email belongs to a platform administrator; CSV import cannot change that account."
            : "This email belongs to a teacher account. Add staff through the existing account picker instead.",
        });
        return;
      }
      if (profile.is_active === false) {
        outcomes.push({ line: row.line, email: row.email, status: "skipped", message: "The existing account is suspended. Reactivate it before onboarding." });
        return;
      }
      if (currentInstitution && currentInstitution.toLowerCase() !== normalizedInstitution) {
        outcomes.push({ line: row.line, email: row.email, status: "skipped", message: "The existing account is affiliated with a different institution. No affiliation was changed." });
        return;
      }
      if (userRoles.length && !userRoles.includes("student")) {
        outcomes.push({ line: row.line, email: row.email, status: "skipped", message: "The existing account does not have a student role." });
        return;
      }

      if (!userRoles.includes("student")) {
        const { error: setRoleError } = await context.supabase.rpc("admin_set_user_role", {
          _user_id: profile.id,
          _role: "student",
        });
        if (setRoleError) {
          outcomes.push({ line: row.line, email: row.email, status: "setup_failed", message: "Could not assign the student role: " + setRoleError.message });
          return;
        }
      }

      const updates: Record<string, unknown> = {
        institution: institution.name,
        role: "student",
        role_confirmed_at: profile.role_confirmed_at ?? now,
      };
      if (!String(profile.full_name ?? "").trim()) updates["full_name"] = row.fullName;
      const { error: updateError } = await admin.from("profiles").update(updates).eq("id", profile.id);
      if (updateError) {
        outcomes.push({ line: row.line, email: row.email, status: "setup_failed", message: "The student role is set, but institution affiliation could not be saved: " + updateError.message });
        return;
      }

      if (invitePreviouslyFailed) {
        outcomes.push({
          line: row.line,
          email: row.email,
          status: "invite_failed",
          message: "The account exists and has been attached to this institution, but the invitation email failed. Check custom SMTP and arrange an invitation resend.",
        });
      } else if (currentInstitution.toLowerCase() === normalizedInstitution) {
        outcomes.push({ line: row.line, email: row.email, status: "already_assigned", message: "This student was already assigned to the institution." });
      } else {
        outcomes.push({ line: row.line, email: row.email, status: "assigned", message: "Existing student account attached to the institution; no password was changed." });
      }
    };

    for (const row of rows) {
      const profile = profileByEmail.get(row.email);
      if (profile) {
        await attachExistingStudent(row, profile);
        continue;
      }

      const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(row.email, {
        data: {
          full_name: row.fullName,
          role: "student",
          institution: institution.name,
        },
      });

      if (inviteError || !inviteData?.user?.id) {
        // Auth can create the pending account before email delivery reports a
        // failure. Detect that partial success so the next step is not hidden.
        const { data: partialProfile } = await admin
          .from("profiles")
          .select("id, full_name, email, institution, is_active, role_confirmed_at")
          .eq("email", row.email)
          .maybeSingle();
        if (partialProfile) {
          if (!rolesByUser.has(partialProfile.id)) {
            const { data: partialRoles } = await admin
              .from("user_roles").select("user_id, role").eq("user_id", partialProfile.id);
            for (const roleRow of partialRoles ?? []) {
              const list = rolesByUser.get(roleRow.user_id) ?? [];
              list.push(String(roleRow.role));
              rolesByUser.set(roleRow.user_id, list);
            }
          }
          await attachExistingStudent(row, partialProfile, true);
        } else {
          outcomes.push({
            line: row.line,
            email: row.email,
            status: "invite_failed",
            message: "Could not create and invite this account: " + (inviteError?.message || "No user was returned.") + " Check email delivery settings before retrying.",
          });
        }
        continue;
      }

      const userId = inviteData.user.id;
      const [
        { error: studentRoleError },
        { error: profileError },
      ] = await Promise.all([
        admin.from("user_roles").upsert(
          { user_id: userId, role: "student" },
          { onConflict: "user_id,role" },
        ),
        admin.from("profiles").upsert(
          {
            id: userId,
            full_name: row.fullName,
            email: row.email,
            institution: institution.name,
            role: "student",
            role_confirmed_at: now,
          },
          { onConflict: "id" },
        ),
      ]);

      if (studentRoleError || profileError) {
        outcomes.push({
          line: row.line,
          email: row.email,
          status: "setup_failed",
          message: "The invitation was sent, but ONYX could not finish setting up the student record. Role error: " +
            (studentRoleError?.message || "none") + "; profile error: " + (profileError?.message || "none"),
        });
      } else {
        outcomes.push({
          line: row.line,
          email: row.email,
          status: "invited",
          message: "Student account created and invitation sent. The student sets their own password from the email.",
        });
      }
    }

    const count = (status: StudentOnboardingRowResult["status"]) =>
      outcomes.filter((row) => row.status === status).length;
    return {
      total: inputRows.length,
      invited: count("invited"),
      assignedExisting: count("assigned"),
      alreadyAssigned: count("already_assigned"),
      inviteFailed: count("invite_failed"),
      setupFailed: count("setup_failed"),
      skipped: count("skipped"),
      rows: outcomes.sort((a, b) => a.line - b.line),
    };
  });

/** Remove a person from an institution while preserving their ONYX account and work. */
export const removeInstitutionMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { institutionId: string; userId: string }) => ({
    institutionId: validateInstitutionId(input?.institutionId),
    userId: validateInstitutionId(input?.userId),
  }))
  .handler(async ({ data, context }) => {
    await requireInstitutionAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: institution, error: loadError } = await admin
      .from("institutions").select("id, name").eq("id", data.institutionId).maybeSingle();
    if (loadError || !institution) throw new Error("Institution not found.");
    const { data: changed, error } = await admin.from("profiles")
      .update({ institution: null }).eq("id", data.userId)
      .eq("institution", institution.name).select("id");
    if (error) throw new Error("Could not remove this member.");
    if (!changed?.length) throw new Error("This account is no longer assigned to the institution.");
    return { ok: true };
  });

/** Delete only the directory record and matching affiliation labels; never delete accounts or class work. */
export const deleteInstitution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { institutionId: string }) => ({
    institutionId: validateInstitutionId(input?.institutionId),
  }))
  .handler(async ({ data, context }) => {
    await requireInstitutionAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: institution, error: loadError } = await admin
      .from("institutions").select("id, name").eq("id", data.institutionId).maybeSingle();
    if (loadError) throw new Error("Could not load this institution.");
    if (!institution) throw new Error("This institution no longer exists.");

    const { data: cleared, error: clearError } = await admin.from("profiles")
      .update({ institution: null }).eq("institution", institution.name).select("id");
    if (clearError) throw new Error("Could not clear member affiliations. Institution was not deleted.");
    const clearedIds = (cleared ?? []).map((profile: { id: string }) => profile.id);
    const { error: deleteError } = await admin.from("institutions").delete().eq("id", data.institutionId);
    if (deleteError) {
      if (clearedIds.length) await admin.from("profiles").update({ institution: institution.name }).in("id", clearedIds);
      throw new Error("Could not delete institution: " + deleteError.message);
    }
    return { ok: true, clearedMembers: clearedIds.length };
  });
