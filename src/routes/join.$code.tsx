import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GraduationCap, Loader2, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  clearPendingJoinCode,
  joinWithCode,
  previewJoin,
  savePendingJoinCode,
  type JoinPreview,
} from "@/lib/institution-join";
import onyxMark from "@/assets/onyx-mark.png.asset.json";

export const Route = createFileRoute("/join/$code")({
  head: () => ({
    meta: [
      { title: "Join your institution — ONYX" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const { session, profile, loading, refresh } = useAuth();
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void previewJoin(code).then((p) => {
      if (!active) return;
      setPreview(p);
    });
    return () => { active = false; };
  }, [code]);

  const signedIn = Boolean(session);
  // A signed-in account that has not confirmed a role yet finishes inside the auth screen.
  const needsRoleStep = signedIn && profile && !profile.role_confirmed_at;

  async function joinNow() {
    setBusy(true);
    try {
      const result = await joinWithCode(code);
      clearPendingJoinCode();
      await refresh();
      toast.success(
        result.status === "pending"
          ? `Request sent. ${result.institutionName} will approve you shortly.`
          : result.status === "already_member"
            ? `You're already part of ${result.institutionName}.`
            : `You joined ${result.institutionName}.`,
      );
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not use this join link.");
    } finally {
      setBusy(false);
    }
  }

  // Persist the invitation before redirecting to the destination Supabase OAuth flow.
  async function continueWithGoogle() {
    savePendingJoinCode(code);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth?mode=signup` },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed. Please try again or use email instead.");
      setBusy(false);
    }
  }

  // Remember the code so sign-up, e-mail confirmation or Google sign-in can finish the join.
  function startAuth(mode: "signup" | "signin") {
    savePendingJoinCode(code);
    navigate({ to: "/auth", search: { mode } });
  }

  const roleLabel = preview?.valid ? (preview.role === "teacher" ? "teacher" : "student") : "";
  const RoleIcon = preview?.valid && preview.role === "teacher" ? Presentation : GraduationCap;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="panel w-full max-w-md space-y-5 p-7">
        <Link to="/" className="flex items-center gap-2">
          <img src={onyxMark.url} width={32} height={32} alt="" aria-hidden="true" className="size-8 rounded-full object-cover" />
          <span className="font-semibold tracking-tight">ONYX</span>
        </Link>

        {preview === null || loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />Checking your link…
          </div>
        ) : !preview.valid ? (
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold">This link isn't active</h1>
            <p className="text-sm text-muted-foreground">
              It may have expired, been switched off, or been replaced. Ask your institution for a new join link.
            </p>
            <Button asChild variant="outline" className="w-full"><Link to="/">Go to ONYX</Link></Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <RoleIcon className="mt-1 size-6 text-primary" />
              <div>
                <h1 className="text-2xl font-semibold">Join {preview.institutionName}</h1>
                {preview.departmentName && (
                  <p className="text-sm text-muted-foreground">Department: {preview.departmentName}</p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">
                  You're joining as a <span className="font-medium text-foreground">{roleLabel}</span>.
                  {preview.requiresApproval ? " An administrator will approve your request first." : ""}
                </p>
              </div>
            </div>

            {needsRoleStep ? (
              <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>Continue</Button>
            ) : signedIn ? (
              <>
                <Button className="w-full" disabled={busy} onClick={() => void joinNow()}>
                  {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Join as {roleLabel}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Signed in as {session?.user.email}.
                </p>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="flex h-12 w-full items-center justify-center gap-3 border-2 border-border bg-background text-base font-semibold shadow-sm hover:border-primary/60 hover:bg-accent"
                  disabled={busy}
                  onClick={() => void continueWithGoogle()}
                >
                  {busy ? <Loader2 className="size-5 animate-spin" /> : (
                    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5 shrink-0">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.74 7.18l7.27 5.64c4.25-3.92 6.71-9.7 6.71-17.29Z" />
                      <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.81l-7.27-5.64c-2.02 1.35-4.6 2.15-8.64 2.15-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
                    </svg>
                  )}
                  <span>Continue with Google</span>
                </Button>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
                </div>
                <Button variant="secondary" className="w-full" onClick={() => startAuth("signup")}>
                  Create an account with email
                </Button>
                <Button variant="outline" className="w-full" onClick={() => startAuth("signin")}>
                  I already have an account
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
