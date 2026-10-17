import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type HubInstitution = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
};

type HubClass = {
  id: string;
  name: string;
  subject: string | null;
  section: string | null;
  departmentId: string | null;
  departmentName: string | null;
  teacherName: string;
  studentCount: number;
  assignmentCount: number;
  archived: boolean;
  createdAt: string;
};

type HubAssignment = {
  id: string;
  title: string;
  dueDate: string | null;
  published: boolean;
  archived: boolean;
  createdAt: string;
  classId: string;
  className: string;
  teacherName: string;
};

export type InstitutionHubResponse = {
  canSelectInstitution: boolean;
  institutions: HubInstitution[];
  selectedInstitutionId: string | null;
  detail: null | {
    institution: HubInstitution;
    departments: number;
    students: number;
    teachers: number;
    classes: HubClass[];
    assignments: HubAssignment[];
  };
};

function validateInstitutionId(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error("Choose a valid institution.");
  }
  return value;
}

/**
 * The platform admin can choose an institution. An institution admin is always
 * resolved to the single institution on their authenticated profile; a supplied
 * ID can never be used to switch tenant scope.
 */
export const getInstitutionHubData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { institutionId?: string | null }) => ({
    institutionId: validateInstitutionId(input?.institutionId),
  }))
  .handler(async ({ data, context }): Promise<InstitutionHubResponse> => {
    const [
      { data: isAdmin, error: adminRoleError },
      { data: isInstitutionAdmin, error: institutionRoleError },
    ] = await Promise.all([
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      }),
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "institution_admin",
      }),
    ]);
    if (adminRoleError || institutionRoleError) {
      throw new Error("Could not verify Institution tab permissions.");
    }
    if (!isAdmin && !isInstitutionAdmin) {
      throw new Error("Only platform admins and institution admins can open this page.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: institutionRows, error: institutionsError } = await admin
      .from("institutions")
      .select("id, name, code, city")
      .order("name", { ascending: true });
    if (institutionsError) throw new Error("Could not load the institution directory.");

    const allInstitutions = (institutionRows ?? []) as HubInstitution[];
    let selectedInstitution: HubInstitution | null = null;
    let selectableInstitutions = allInstitutions;

    if (isAdmin) {
      if (!data.institutionId) {
        return {
          canSelectInstitution: true,
          institutions: allInstitutions,
          selectedInstitutionId: null,
          detail: null,
        };
      }
      selectedInstitution = allInstitutions.find((item) => item.id === data.institutionId) ?? null;
      if (!selectedInstitution) throw new Error("That institution could not be found.");
    } else {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("id, institution, institution_id")
        .eq("id", context.userId)
        .maybeSingle();
      if (profileError) throw new Error("Could not load your institution assignment.");

      const institutionId = typeof profile?.institution_id === "string" ? profile.institution_id : null;
      const institutionLabel = String(profile?.institution ?? "").trim().toLowerCase();
      if (!institutionId && !institutionLabel) {
        throw new Error("Your account is not assigned to an institution. Contact the platform administrator.");
      }
      selectedInstitution = allInstitutions.find((item) =>
        institutionId ? item.id === institutionId
          : item.name.trim().toLowerCase() === institutionLabel,
      ) ?? null;
      if (!selectedInstitution) {
        throw new Error("Your assigned institution could not be found. Contact the platform administrator.");
      }

      const { data: verifiedScope, error: scopeError } = await context.supabase.rpc(
        "is_institution_admin",
        { _institution_id: selectedInstitution.id },
      );
      if (scopeError || !verifiedScope) {
        throw new Error("You are not authorized to view this institution.");
      }
      if (data.institutionId && data.institutionId !== selectedInstitution.id) {
        throw new Error("You may only view your assigned institution.");
      }
      selectableInstitutions = [selectedInstitution];
    }

    const institution = selectedInstitution;
    if (!institution) {
      throw new Error("Select an institution to continue.");
    }

    const [
      { data: institutionProfilesById, error: profilesByIdError },
      { data: institutionProfilesByName, error: profilesByNameError },
      { data: departments, error: departmentsError },
    ] = await Promise.all([
      admin.from("profiles")
        .select("id, full_name, is_active, institution, institution_id")
        .eq("institution_id", institution.id),
      admin.from("profiles")
        .select("id, full_name, is_active, institution, institution_id")
        .is("institution_id", null)
        .eq("institution", institution.name),
      admin.from("departments")
        .select("id, institution_id, name, code")
        .eq("institution_id", institution.id)
        .order("name", { ascending: true }),
    ]);
    if (profilesByIdError || profilesByNameError) {
      throw new Error("Could not load members for this institution.");
    }
    if (departmentsError) throw new Error("Could not load this institution's departments.");

    const profileMap = new Map<string, any>();
    for (const profile of [...(institutionProfilesById ?? []), ...(institutionProfilesByName ?? [])]) {
      const linkedInstitutionId = typeof profile.institution_id === "string" ? profile.institution_id : null;
      const legacyInstitutionLabel = String(profile.institution ?? "").trim().toLowerCase();
      const matchesInstitutionId = linkedInstitutionId === institution.id;
      const matchesLegacyAffiliation = !linkedInstitutionId && legacyInstitutionLabel === institution.name.trim().toLowerCase();
      // A current institution_id is authoritative; only use the legacy institution
      // name for profiles that have not yet been linked to an institution ID.
      if (!matchesInstitutionId && !matchesLegacyAffiliation) continue;
      profileMap.set(profile.id, profile);
    }
    const institutionProfiles = [...profileMap.values()];
    const institutionProfileIds = institutionProfiles.map((profile) => profile.id);

    const { data: roleRows, error: rolesError } = institutionProfileIds.length
      ? await admin.from("user_roles")
          .select("user_id, role")
          .in("user_id", institutionProfileIds)
      : { data: [], error: null };
    if (rolesError) throw new Error("Could not verify institution member roles.");

    const rolesByUser = new Map<string, Set<string>>();
    for (const row of roleRows ?? []) {
      const roles = rolesByUser.get(row.user_id) ?? new Set<string>();
      roles.add(String(row.role));
      rolesByUser.set(row.user_id, roles);
    }

    const tenantTeachers = institutionProfiles.filter((profile) => {
      const roles = rolesByUser.get(profile.id);
      return profile.is_active !== false && roles?.has("teacher") && !roles.has("admin");
    });
    const departmentRows = (departments ?? []) as Array<{ id: string; name: string; code: string | null; institution_id: string }>;
    const departmentById = new Map(departmentRows.map((department) => [department.id, department]));

    // Class tenant ownership is stored on the class row. Do not infer ownership
    // from the current teacher's profile because teachers can transfer later.
    const { data: scopedClassRows, error: classRowsError } = await admin
      .from("classes")
      .select("id, name, subject, section, department_id, teacher_id, archived, created_at")
      .eq("institution_id", institution.id)
      .order("created_at", { ascending: false });
    if (classRowsError) {
      throw new Error("Could not load institution-scoped classes. Apply the institution transfer scope migration and retry.");
    }
    const rawClasses = scopedClassRows ?? [];
    const classIds = rawClasses.map((row: any) => row.id);

    const [
      { data: assignments, error: assignmentsError },
      { data: classMembers, error: classMembersError },
    ] = classIds.length
      ? await Promise.all([
          admin.from("assignments")
            .select("id, title, due_date, published, archived, created_at, teacher_id, class_id")
            .in("class_id", classIds)
            .order("created_at", { ascending: false }),
          admin.from("class_members")
            .select("class_id, member_role")
            .in("class_id", classIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
    if (assignmentsError) throw new Error("Could not load assignments for this institution.");
    if (classMembersError) throw new Error("Could not load class enrolment for this institution.");

    const assignmentRows = assignments ?? [];
    const assignmentCountByClass = new Map<string, number>();
    for (const assignment of assignmentRows) {
      assignmentCountByClass.set(
        assignment.class_id,
        (assignmentCountByClass.get(assignment.class_id) ?? 0) + 1,
      );
    }
    const studentCountByClass = new Map<string, number>();
    for (const member of classMembers ?? []) {
      if (member.member_role !== "student") continue;
      studentCountByClass.set(
        member.class_id,
        (studentCountByClass.get(member.class_id) ?? 0) + 1,
      );
    }

    const relatedTeacherIds = [...new Set([
      ...rawClasses.map((row) => String(row.teacher_id)),
      ...assignmentRows.map((row: any) => String(row.teacher_id)),
    ].filter(Boolean))];
    const missingTeacherIds = relatedTeacherIds.filter((id) => !profileMap.has(id));
    if (missingTeacherIds.length) {
      const { data: ownerProfiles, error: ownerProfilesError } = await admin
        .from("profiles")
        .select("id, full_name")
        .in("id", missingTeacherIds);
      if (ownerProfilesError) throw new Error("Could not load class teacher names.");
      for (const profile of ownerProfiles ?? []) profileMap.set(profile.id, profile);
    }

    const teacherName = (id: string) => String(profileMap.get(id)?.full_name ?? "Unknown");
    const classByIdForDisplay = new Map<string, any>();
    const classes: HubClass[] = rawClasses.map((row) => {
      classByIdForDisplay.set(row.id, row);
      return {
        id: row.id,
        name: String(row.name ?? "Untitled class"),
        subject: row.subject ?? null,
        section: row.section ?? null,
        departmentId: row.department_id ?? null,
        departmentName: row.department_id ? departmentById.get(row.department_id)?.name ?? null : null,
        teacherName: teacherName(String(row.teacher_id)),
        studentCount: studentCountByClass.get(row.id) ?? 0,
        assignmentCount: assignmentCountByClass.get(row.id) ?? 0,
        archived: row.archived === true,
        createdAt: String(row.created_at ?? ""),
      };
    });

    const hubAssignments: HubAssignment[] = assignmentRows.map((row: any) => ({
      id: row.id,
      title: String(row.title ?? "Untitled assignment"),
      dueDate: row.due_date ?? null,
      published: row.published === true,
      archived: row.archived === true,
      createdAt: String(row.created_at ?? ""),
      classId: row.class_id,
      className: String(classByIdForDisplay.get(row.class_id)?.name ?? "Class"),
      teacherName: teacherName(String(row.teacher_id ?? classByIdForDisplay.get(row.class_id)?.teacher_id ?? "")),
    }));

    const activeInstitutionProfiles = institutionProfiles.filter((profile) => {
      const roles = rolesByUser.get(profile.id);
      return profile.is_active !== false && !roles?.has("admin") && !roles?.has("institution_admin");
    });
    const studentCount = activeInstitutionProfiles.filter((profile) =>
      rolesByUser.get(profile.id)?.has("student"),
    ).length;
    const teacherCount = tenantTeachers.length;

    return {
      canSelectInstitution: Boolean(isAdmin),
      institutions: selectableInstitutions,
      selectedInstitutionId: institution.id,
      detail: {
        institution,
        departments: departmentRows.length,
        students: studentCount,
        teachers: teacherCount,
        classes,
        assignments: hubAssignments,
      },
    };
  });
