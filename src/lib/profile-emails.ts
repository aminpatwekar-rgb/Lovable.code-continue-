import { supabase } from "@/integrations/supabase/client";

/**
 * Emails are not readable straight off the `profiles` table any more — the
 * column is only reachable through a security-definer lookup that returns
 * addresses for yourself, your own students (as their class teacher) or, for
 * administrators, anyone. Callers get an empty map when they aren't allowed.
 */
export async function fetchProfileEmails(ids: string[]): Promise<Map<string, string | null>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.rpc("get_profile_emails", { _ids: unique });
  if (error) return new Map();
  return new Map((data ?? []).map((r) => [r.id, r.email]));
}
