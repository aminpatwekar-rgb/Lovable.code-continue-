import { supabase } from "@/integrations/supabase/client";

// These functions are new, so they are not in the generated Supabase types yet.
const db = supabase as any;

export type PersonRole = "student" | "teacher";

export type InstitutionPerson = {
  id: string;
  fullName: string;
  email: string | null;
  role: PersonRole;
  departmentIds: string[];
};

export type DepartmentSummary = { id: string; name: string; code: string | null };

export type DepartmentStudent = { id: string; fullName: string; email: string | null };

export type DepartmentClass = {
  id: string;
  name: string;
  subject: string | null;
  section: string | null;
  teacherName: string | null;
  studentCount: number;
};

export type BulkResult = {
  skipped: { userId: string; reason: string }[];
} & Record<string, unknown>;

export type DepartmentLink = {
  code: string;
  isActive: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export const fetchInstitutionPeople = (institutionId: string) =>
  rpc<InstitutionPerson[]>("list_institution_people", { _institution_id: institutionId });

export const fetchMyDepartments = () => rpc<DepartmentSummary[]>("list_my_departments");

export const fetchDepartmentStudents = (departmentId: string) =>
  rpc<DepartmentStudent[]>("list_department_students", { _department_id: departmentId });

export const fetchDepartmentClasses = (departmentId: string) =>
  rpc<DepartmentClass[]>("list_department_classes", { _department_id: departmentId });

export const assignDepartmentMembers = (departmentId: string, userIds: string[]) =>
  rpc<{ assigned: number; skipped: BulkResult["skipped"] }>("assign_department_members", {
    _department_id: departmentId,
    _user_ids: userIds,
  });

export const removeDepartmentMember = (departmentId: string, userId: string) =>
  rpc<null>("remove_department_member", { _department_id: departmentId, _user_id: userId });

export const enrollStudentsInClass = (classId: string, userIds: string[]) =>
  rpc<{ enrolled: number; skipped: BulkResult["skipped"] }>("enroll_students_in_class", {
    _class_id: classId,
    _user_ids: userIds,
  });

export const fetchDepartmentLink = (departmentId: string) =>
  rpc<DepartmentLink>("get_department_join_link", { _department_id: departmentId });

export const regenerateDepartmentLink = (departmentId: string) =>
  rpc<string>("regenerate_department_join_link", { _department_id: departmentId });

export const updateDepartmentLink = (
  departmentId: string,
  next: { isActive: boolean; expiresAt: string | null; maxUses: number | null },
) =>
  rpc<null>("update_department_join_link", {
    _department_id: departmentId,
    _is_active: next.isActive,
    _expires_at: next.expiresAt,
    _max_uses: next.maxUses,
  });
