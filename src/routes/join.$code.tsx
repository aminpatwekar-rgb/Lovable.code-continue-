import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GraduationCap, Loader2, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
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
                <Button className="w-full" onClick={() => startAuth("signup")}>
                  Create an account
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
