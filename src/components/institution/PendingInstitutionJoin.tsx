import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { saveInstitutionWelcome } from "@/lib/my-institution";
import {
  clearPendingClassJoinCode,
  clearPendingJoinCode,
  joinWithCode,
  readPendingClassJoinCode,
  readPendingJoinCode,
} from "@/lib/institution-join";

/**
 * Finishes a join that started on /join/<code> when the person had to sign up or sign in first
 * (for example after confirming their email). Runs once, then forgets the code.
 */
export function PendingInstitutionJoin() {
  const { profile, role, refresh } = useAuth();
  const started = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (started.current) return;
    if (!profile?.role_confirmed_at || (role !== "student" && role !== "teacher")) return;
    // A class invitation: return to the preview page, now signed in, to finish joining.
    const classCode = readPendingClassJoinCode();
    if (classCode) {
      started.current = true;
      clearPendingClassJoinCode();
      void navigate({ to: "/join/$code", params: { code: classCode }, replace: true });
      return;
    }
    const code = readPendingJoinCode();
    if (!code) return;
    started.current = true;
    clearPendingJoinCode();
    void joinWithCode(code)
      .then(async (result) => {
        await refresh();
        saveInstitutionWelcome(result);
        if (result.status === "pending") {
          toast.success(`Request sent. ${result.institutionName} will approve you shortly.`);
        } else if (result.status === "joined") {
          toast.success(`You joined ${result.institutionName}.`);
        }
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Could not use your join link.");
      });
  }, [profile?.role_confirmed_at, role, refresh, navigate]);

  return null;
}
