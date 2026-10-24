import { supabase } from "@/integrations/supabase/client";

// The join-link functions are new, so they are not in the generated Supabase types yet.
const db = supabase as any;

export type JoinRole = "student" | "teacher";

export type JoinLink = {
  role: JoinRole;
  code: string;
  isActive: boolean;
  requiresApproval: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
};

export type JoinPreview =
  | { valid: false }
  | { valid: true; institutionName: string; departmentName?: string | null; role: JoinRole; requiresApproval: boolean };

export type JoinResult = {
  status: "joined" | "pending" | "already_member";
  institutionName: string;
  departmentName?: string | null;
  role: JoinRole;
};

export type JoinRequest = {
  id: string;
  role: JoinRole;
  fullName: string;
  email: string | null;
  createdAt: string;
};

const PENDING_KEY = "onyx.pending-join-code";

export function normalizeJoinCode(raw: string): string {
  // Accept a bare code or a pasted link such as https://site/join/ABCD2345.
  const last = raw.trim().split(/[/?#]/).filter(Boolean).pop() ?? "";
  return last.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The address people outside the editor can open. Set VITE_PUBLIC_APP_URL if your published address differs. */
const PUBLIC_APP_URL = (import.meta.env["VITE_PUBLIC_APP_URL"] as string | undefined)?.trim() || "https://onyxedu.lovable.app";

function isPrivateAddress(hostname: string): boolean {
  // Editor previews need a Lovable login, so a link built from them cannot be shared.
  return hostname.startsWith("id-preview--") || hostname.endsWith(".lovableproject.com") || hostname === "localhost" || hostname === "127.0.0.1";
}

export function joinUrl(code: string): string {
  const origin = typeof window === "undefined" ? PUBLIC_APP_URL : isPrivateAddress(window.location.hostname) ? PUBLIC_APP_URL : window.location.origin;
  return `${origin.replace(/\/$/, "")}/join/${code}`;
}

export function savePendingJoinCode(code: string) {
  try { localStorage.setItem(PENDING_KEY, normalizeJoinCode(code)); } catch { /* private mode */ }
}
export function readPendingJoinCode(): string | null {
  try { return localStorage.getItem(PENDING_KEY) || null; } catch { return null; }
}
export function clearPendingJoinCode() {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

export async function previewJoin(code: string): Promise<JoinPreview> {
  const { data, error } = await db.rpc("preview_institution_join", { _code: normalizeJoinCode(code) });
  if (error || !data?.valid) return { valid: false };
  return data as JoinPreview;
}

export async function joinWithCode(code: string): Promise<JoinResult> {
  const { data, error } = await db.rpc("join_institution_with_code", { _code: normalizeJoinCode(code) });
  if (error) throw new Error(error.message);
  return data as JoinResult;
}

export async function fetchJoinLinks(institutionId: string): Promise<JoinLink[]> {
  const { data, error } = await db.rpc("get_institution_join_links", { _institution_id: institutionId });
  if (error) throw new Error(error.message);
  return (data ?? []) as JoinLink[];
}

export async function regenerateJoinLink(institutionId: string, role: JoinRole): Promise<string> {
  const { data, error } = await db.rpc("regenerate_institution_join_link", { _institution_id: institutionId, _role: role });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function updateJoinLink(
  institutionId: string,
  role: JoinRole,
  next: { isActive: boolean; requiresApproval: boolean; expiresAt: string | null; maxUses: number | null },
): Promise<void> {
  const { error } = await db.rpc("update_institution_join_link", {
    _institution_id: institutionId,
    _role: role,
    _is_active: next.isActive,
    _requires_approval: next.requiresApproval,
    _expires_at: next.expiresAt,
    _max_uses: next.maxUses,
  });
  if (error) throw new Error(error.message);
}

export async function fetchJoinRequests(institutionId: string): Promise<JoinRequest[]> {
  const { data, error } = await db.rpc("list_institution_join_requests", { _institution_id: institutionId });
  if (error) throw new Error(error.message);
  return (data ?? []) as JoinRequest[];
}

export async function decideJoinRequest(requestId: string, approve: boolean, departmentId: string | null = null): Promise<void> {
  const { error } = await db.rpc("decide_institution_join_request", {
    _request_id: requestId,
    _approve: approve,
    _department_id: departmentId,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Class invitation links (/join/<code> also works for a class's student join code)
// ---------------------------------------------------------------------------

export type ClassJoinPreview =
  | { valid: false }
  | { valid: true; className: string; subject: string | null; section: string | null; teacherName: string | null };

const PENDING_CLASS_KEY = "onyx.pending-class-join-code";

/** Shareable class invitation link: opens a preview page, then joins after sign-in. */
export function classJoinUrl(code: string): string {
  return joinUrl(code.trim().toUpperCase());
}

export async function previewClassJoin(code: string): Promise<ClassJoinPreview> {
  const { data, error } = await db.rpc("preview_class_join", { _code: normalizeJoinCode(code) });
  if (error || !data?.valid) return { valid: false };
  return data as ClassJoinPreview;
}

export function savePendingClassJoinCode(code: string) {
  try { localStorage.setItem(PENDING_CLASS_KEY, normalizeJoinCode(code)); } catch { /* private mode */ }
}
export function readPendingClassJoinCode(): string | null {
  try { return localStorage.getItem(PENDING_CLASS_KEY) || null; } catch { return null; }
}
export function clearPendingClassJoinCode() {
  try { localStorage.removeItem(PENDING_CLASS_KEY); } catch { /* ignore */ }
}

/** Join a class by its code. Returns the class id. */
export async function joinClassWithCode(
  code: string,
  identity: { fullName: string; rollNo: string; erNo: string; srNo: string },
): Promise<string> {
  const { data, error } = await db.rpc("join_class_by_code", {
    _code: normalizeJoinCode(code),
    _full_name: identity.fullName.trim(),
    _roll_no: identity.rollNo.trim(),
    _er_no: identity.erNo.trim(),
    _sr_no: identity.srNo.trim(),
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No class found with that code");
  return data as string;
}
