import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { clearPendingJoinCode, joinWithCode, readPendingJoinCode } from "@/lib/institution-join";

/**
 * Finishes a join that started on /join/<code> when the person had to sign up or sign in first
 * (for example after confirming their email). Runs once, then forgets the code.
 */
export function PendingInstitutionJoin() {
  const { profile, role, refresh } = useAuth();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (!profile?.role_confirmed_at || (role !== "student" && role !== "teacher")) return;
    const code = readPendingJoinCode();
    if (!code) return;
    started.current = true;
    clearPendingJoinCode();
    void joinWithCode(code)
      .then(async (result) => {
        await refresh();
        if (result.status === "pending") {
          toast.success(`Request sent. ${result.institutionName} will approve you shortly.`);
        } else if (result.status === "joined") {
          toast.success(`You joined ${result.institutionName}.`);
        }
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Could not use your join link.");
      });
  }, [profile?.role_confirmed_at, role, refresh]);

  return null;
}
