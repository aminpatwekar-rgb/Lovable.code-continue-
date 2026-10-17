import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InstitutionAdminMember = {
  id: string;
  fullName: string;
  email: string;
  role: "student" | "teacher" | "institution_admin";
  isActive: boolean;
  createdAt: string;
};

export type InstitutionAdminOverview = {
  institution: { id: string; name: string; code: string | null; city: string | null };
  students: number;
  teachers: number;
  institutionAdmins: number;
  classes: number;
  assignments: number;
  submissions: number;
  roster: InstitutionAdminMember[];
};

/**
 * Institution admins can only read a roster and activity counts for the single
 * institution associated with their authenticated account. Service-role access
 * is intentionally used only after server-side role and scope verification.
 */
export const getInstitutionAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InstitutionAdminOverview> => {
    const { data: isInstitutionAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "institution_admin",
    });
    if (roleError) throw new Error("Could not verify institution administrator permissions.");
    if (!isInstitutionAdmin) throw new Error("Only institution administrators can open this console.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, institution, institution_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error("Could not load the institution administrator profile.");

    const { data: institutionRows, error: institutionError } = await admin
      .from("institutions")
      .select("id, name, code, city");
    if (institutionError) throw new Error("Could not load the institution directory.");

    const institutionId = typeof profile?.institution_id === "string" ? profile.institution_id : null;
    const institutionLabel = String(profile?.institution ?? "").trim().toLowerCase();
    const institution = (institutionRows ?? []).find((item: any) =>
      institutionId ? item.id === institutionId
        : String(item.name ?? "").trim().toLowerCase() === institutionLabel,
    );
    if (!institution) throw new Error("Your assigned institution could not be found. Contact the platform administrator.");

    const { data: verifiedScope, error: scopeError } = await context.supabase.rpc("is_institution_admin", {
      _institution_id: institution.id,
    });
    if (scopeError) throw new Error("Could not verify institution access.");
    if (!verifiedScope) throw new Error("You are not authorized to manage this institution.");

    // institution_id is authoritative. The name-based query is only a temporary
    // compatibility path for legacy profiles that have not yet been linked to an ID.
    const [
      { data: linkedProfiles, error: linkedProfilesError },
      { data: legacyProfiles, error: legacyProfilesError },
    ] = await Promise.all([
      admin.from("profiles")
        .select("id, full_name, email, is_active, created_at, institution, institution_id")
        .eq("institution_id", institution.id),
      admin.from("profiles")
        .select("id, full_name, email, is_active, created_at, institution, institution_id")
        .is("institution_id", null)
        .ilike("institution", institution.name),
    ]);
    if (linkedProfilesError || legacyProfilesError) throw new Error("Could not load the institution roster.");

    const profileMap = new Map<string, any>();
    for (const row of [...(linkedProfiles ?? []), ...(legacyProfiles ?? [])]) {
      // Never use a stale legacy label when a profile is already linked to a
      // different institution ID.
      if (row.institution_id && row.institution_id !== institution.id) continue;
      profileMap.set(row.id, row);
    }
    const rows = [...profileMap.values()];
    const ids = rows.map((row: any) => row.id);
    const { data: roles, error: rolesError } = ids.length
      ? await admin.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [], error: null };
    if (rolesError) throw new Error("Could not load institutional roles.");

    const byUser = new Map<string, string[]>();
    for (const item of roles ?? []) {
      const existing = byUser.get(item.user_id) ?? [];
      existing.push(String(item.role));
      byUser.set(item.user_id, existing);
    }

    const roster: InstitutionAdminMember[] = rows.flatMap((row: any) => {
      const assignedRoles = byUser.get(row.id) ?? [];
      const role: InstitutionAdminMember["role"] | null = assignedRoles.includes("admin")
        ? null
        : assignedRoles.includes("institution_admin")
          ? "institution_admin"
          : assignedRoles.includes("teacher")
            ? "teacher"
            : assignedRoles.includes("student")
              ? "student"
              : null;
      if (!role) return [];
      return [{
        id: row.id,
        fullName: String(row.full_name ?? ""),
        email: String(row.email ?? ""),
        role,
        isActive: row.is_active !== false,
        createdAt: String(row.created_at ?? ""),
      }];
    });

    const { data: classRows, error: classesError } = await admin
      .from("classes")
      .select("id")
      .eq("institution_id", institution.id);
    if (classesError) {
      throw new Error("Could not load institution-scoped classes. Apply the institution transfer scope migration and retry.");
    }
    const classIds = (classRows ?? []).map((row: any) => row.id);
    const { data: assignmentRows, error: assignmentsError } = classIds.length
      ? await admin.from("assignments").select("id").in("class_id", classIds)
      : { data: [], error: null };
    if (assignmentsError) throw new Error("Could not calculate institution assignment counts.");

    const assignmentIds = (assignmentRows ?? []).map((row: any) => row.id);
    const { count: submissionCount, error: submissionsError } = assignmentIds.length
      ? await admin.from("submissions").select("id", { count: "exact", head: true }).in("assignment_id", assignmentIds)
      : { count: 0, error: null };
    if (submissionsError) throw new Error("Could not calculate institution submission counts.");

    return {
      institution: { id: institution.id, name: institution.name, code: institution.code ?? null, city: institution.city ?? null },
      students: roster.filter((member) => member.role === "student").length,
      teachers: roster.filter((member) => member.role === "teacher").length,
      institutionAdmins: roster.filter((member) => member.role === "institution_admin").length,
      classes: classIds.length,
      assignments: assignmentIds.length,
      submissions: submissionCount ?? 0,
      roster,
    };
  });

export type InstitutionDepartment = {
  id: string;
  institutionId: string;
  name: string;
  code: string | null;
  description: string | null;
  createdAt: string;
};

type InstitutionAdminServerContext = {
  userId: string;
  supabase: any;
};

/** Resolve tenant scope from the authenticated account, never from caller-supplied institution IDs. */
async function resolveInstitutionAdminScope(context: InstitutionAdminServerContext) {
  const { data: isInstitutionAdmin, error: roleError } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "institution_admin",
  });
  if (roleError) throw new Error("Could not verify institution administrator permissions.");
  if (!isInstitutionAdmin) throw new Error("Only institution administrators can manage departments.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, institution, institution_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (profileError) throw new Error("Could not load the institution administrator profile.");
  const institutionId = typeof profile?.institution_id === "string" ? profile.institution_id : null;
  const institutionLabel = String(profile?.institution ?? "").trim().toLowerCase();
  if (!institutionId && !institutionLabel) {
    throw new Error("Your account is not assigned to an institution. Contact the platform administrator.");
  }

  const { data: institutionRows, error: institutionError } = await admin
    .from("institutions")
    .select("id, name");
  if (institutionError) throw new Error("Could not load the institution directory.");

  const institution = (institutionRows ?? []).find((item: any) =>
    institutionId ? item.id === institutionId
      : String(item.name ?? "").trim().toLowerCase() === institutionLabel,
  );
  if (!institution) {
    throw new Error("Your assigned institution could not be found. Contact the platform administrator.");
  }

  const { data: verifiedScope, error: scopeError } = await context.supabase.rpc("is_institution_admin", {
    _institution_id: institution.id,
  });
  if (scopeError) throw new Error("Could not verify institution access.");
  if (!verifiedScope) throw new Error("You are not authorized to manage this institution.");

  return { admin, institution };
}

function departmentTableError(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST205" || /departments.*(not found|does not exist)/i.test(error?.message ?? "")) {
    throw new Error("Department management needs the department database migration to be applied before use.");
  }
  throw new Error(error?.message || "Could not complete the department request.");
}

export const listInstitutionDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InstitutionDepartment[]> => {
    const { admin, institution } = await resolveInstitutionAdminScope(context as InstitutionAdminServerContext);
    const { data, error } = await admin
      .from("departments")
      .select("id, institution_id, name, code, description, created_at")
      .eq("institution_id", institution.id)
      .order("name", { ascending: true });
    if (error) departmentTableError(error);

    return (data ?? []).map((row: any) => ({
      id: row.id,
      institutionId: row.institution_id,
      name: row.name,
      code: row.code ?? null,
      description: row.description ?? null,
      createdAt: row.created_at,
    }));
  });

export const createInstitutionDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { name: string; code?: string; description?: string }) => {
    const name = String(input?.name ?? "").trim().replace(/\s+/g, " ");
    const code = String(input?.code ?? "").trim().toUpperCase();
    const description = String(input?.description ?? "").trim();
    if (!name) throw new Error("Department name is required.");
    if (name.length > 120) throw new Error("Department name must be 120 characters or fewer.");
    if (code.length > 40) throw new Error("Department code must be 40 characters or fewer.");
    if (description.length > 500) throw new Error("Description must be 500 characters or fewer.");
    return { name, code, description };
  })
  .handler(async ({ data, context }) => {
    const { admin, institution } = await resolveInstitutionAdminScope(context as InstitutionAdminServerContext);
    const { data: department, error } = await admin
      .from("departments")
      .insert({
        institution_id: institution.id,
        name: data.name,
        code: data.code || null,
        description: data.description || null,
        created_by: context.userId,
      })
      .select("id, institution_id, name, code, description, created_at")
      .single();

    if (error?.code === "23505") {
      if (/departments_institution_code_unique/i.test(error.message ?? "")) {
        throw new Error("That department code is already in use in your institution.");
      }
      throw new Error("A department with that name already exists in your institution.");
    }
    if (error) departmentTableError(error);

    return {
      id: department.id as string,
      institutionId: department.institution_id as string,
      name: department.name as string,
      code: (department.code ?? null) as string | null,
      description: (department.description ?? null) as string | null,
      createdAt: department.created_at as string,
    } satisfies InstitutionDepartment;
  });
