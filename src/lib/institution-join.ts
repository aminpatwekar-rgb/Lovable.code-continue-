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
  | { valid: true; institutionName: string; role: JoinRole; requiresApproval: boolean };

export type JoinResult = {
  status: "joined" | "pending" | "already_member";
  institutionName: string;
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

export function joinUrl(code: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/join/${code}`;
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

export async function decideJoinRequest(requestId: string, approve: boolean): Promise<void> {
  const { error } = await db.rpc("decide_institution_join_request", { _request_id: requestId, _approve: approve });
  if (error) throw new Error(error.message);
}
