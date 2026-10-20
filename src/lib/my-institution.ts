import { supabase } from "@/integrations/supabase/client";

// get_my_institution is new, so it is not in the generated Supabase types yet.
const db = supabase as any;

export type PersonName = { fullName: string };

export type MyDepartment = {
  id: string;
  name: string;
  code: string | null;
  myRole: "student" | "teacher";
  teachers: PersonName[];
  students: PersonName[];
  studentCount: number;
};

export type MyInstitutionClass = {
  id: string;
  name: string;
  subject: string | null;
  section: string | null;
  departmentName: string | null;
  myRole: "student" | "teacher";
  teachers: PersonName[];
  classmates: PersonName[];
};

export type MyInstitution = {
  institution: { id: string; name: string; city: string | null } | null;
  pending: { institutionName: string; role: "student" | "teacher"; requestedAt: string }[];
  departments: MyDepartment[];
  classes: MyInstitutionClass[];
};

export const MY_INSTITUTION_KEY = "my-institution";

export async function fetchMyInstitution(): Promise<MyInstitution> {
  const { data, error } = await db.rpc("get_my_institution");
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Partial<MyInstitution>;
  return {
    institution: d.institution ?? null,
    pending: d.pending ?? [],
    departments: d.departments ?? [],
    classes: d.classes ?? [],
  };
}

// --- Welcome moment -------------------------------------------------------------------------
// After someone joins through a link we remember the result for one visit so the dashboard can
// greet them once and explain what happens next.

const WELCOME_KEY = "onyx.institution-welcome";

export type InstitutionWelcome = {
  status: "joined" | "pending" | "already_member";
  institutionName: string;
  departmentName?: string | null;
  role: "student" | "teacher";
};

export function saveInstitutionWelcome(welcome: InstitutionWelcome) {
  try {
    if (welcome.status === "already_member") return;
    sessionStorage.setItem(WELCOME_KEY, JSON.stringify(welcome));
  } catch {
    /* storage can be unavailable; the welcome is optional */
  }
}

export function takeInstitutionWelcome(): InstitutionWelcome | null {
  try {
    const raw = sessionStorage.getItem(WELCOME_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(WELCOME_KEY);
    return JSON.parse(raw) as InstitutionWelcome;
  } catch {
    return null;
  }
}

/** Short label such as "Student at MIT ADT · Mechanical". */
export function institutionLabel(
  info: MyInstitution | undefined,
  role: "student" | "teacher" | "other",
): string | null {
  if (!info?.institution) return null;
  const who = role === "teacher" ? "Teacher" : role === "student" ? "Student" : "Member";
  const dept = info.departments[0]?.name;
  return `${who} at ${info.institution.name}${dept ? ` · ${dept}` : ""}`;
}
