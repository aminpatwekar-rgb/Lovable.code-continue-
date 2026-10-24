import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { saveInstitutionWelcome } from "@/lib/my-institution";
import { GraduationCap, Loader2, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { lovable } from "@/integrations/lovable";
import {
  clearPendingJoinCode,
  joinClassWithCode,
  joinWithCode,
  previewClassJoin,
  previewJoin,
  savePendingClassJoinCode,
  savePendingJoinCode,
  type ClassJoinPreview,
  type JoinPreview,
} from "@/lib/institution-join";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen } from "lucide-react";
import onyxMark from "@/assets/onyx-mark.png.asset.json";

export const Route = createFileRoute("/join/$code")({
  head: () => ({
    meta: [
      { title: "Join on ONYX" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const { session, profile, role, loading, refresh } = useAuth();
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [classPreview, setClassPreview] = useState<ClassJoinPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [erNo, setErNo] = useState("");
  const [srNo, setSrNo] = useState("");

  // The same /join/<code> link works for institution join links and for class invitations.
  useEffect(() => {
    let active = true;
    setPreview(null);
    setClassPreview(null);
    void (async () => {
      const inst = await previewJoin(code);
      if (!active) return;
      if (inst.valid) {
        setPreview(inst);
        setClassPreview({ valid: false });
        return;
      }
      const cls = await previewClassJoin(code);
      if (!active) return;
      setPreview(inst);
      setClassPreview(cls);
    })();
    return () => { active = false; };
  }, [code]);

  const isClass = classPreview?.valid === true;
  const isStaff = role === "teacher" || role === "admin" || role === "institution_admin";

  async function joinClassNow() {
    const name = (fullName || profile?.full_name || "").trim();
    if (!isStaff) {
      if (!name) { toast.error("Full name is required"); return; }
      if (!rollNo.trim() && !erNo.trim() && !srNo.trim()) {
        toast.error("Enter at least one identifier: Roll No., ER No., or Sr No.");
        return;
      }
    }
    setBusy(true);
    try {
      const classId = await joinClassWithCode(code, { fullName: name, rollNo, erNo, srNo });
      toast.success("You've joined the class");
      navigate({ to: "/classes/$classId", params: { classId }, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join this class.");
    } finally {
      setBusy(false);
    }
  }

  const signedIn = Boolean(session);
  // A signed-in account that has not confirmed a role yet finishes inside the auth screen.
  const needsRoleStep = signedIn && profile && !profile.role_confirmed_at;

  async function joinNow() {
    setBusy(true);
    try {
      const result = await joinWithCode(code);
      clearPendingJoinCode();
      await refresh();
      saveInstitutionWelcome(result);
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

  // Google sign-in: remember the code first, then return through the sign-up screen,
  // which finishes the join once the account exists.
  async function continueWithGoogle() {
    // Keep the invitation code before using Lovable-managed Google authentication.
    if (isClass) savePendingClassJoinCode(code); else savePendingJoinCode(code);
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth?mode=signup`,
      });
      if (result.error) throw result.error;
    } catch {
      toast.error("Google sign-in failed. Please try again or use email instead.");
      setBusy(false);
    }
  }

  // Remember the code so sign-up, e-mail confirmation or Google sign-in can finish the join.
  function startAuth(mode: "signup" | "signin") {
    if (isClass) savePendingClassJoinCode(code); else savePendingJoinCode(code);
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

        {preview === null || classPreview === null || loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />Checking your link…
          </div>
        ) : isClass && classPreview.valid ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <BookOpen className="mt-1 size-6 text-primary" />
              <div>
                <h1 className="text-2xl font-semibold">Join {classPreview.className}</h1>
                {[classPreview.subject, classPreview.section].filter(Boolean).length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {[classPreview.subject, classPreview.section].filter(Boolean).join(" · ")}
                  </p>
                )}
                {classPreview.teacherName && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Taught by <span className="font-medium text-foreground">{classPreview.teacherName}</span>
                  </p>
                )}
              </div>
            </div>

            {needsRoleStep ? (
              <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>Continue</Button>
            ) : signedIn ? (
              <>
                {!isStaff && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="jc-name">Full name</Label>
                      <Input
                        id="jc-name"
                        maxLength={100}
                        value={fullName || profile?.full_name || ""}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="jc-roll">Roll No.</Label>
                        <Input id="jc-roll" maxLength={40} value={rollNo} onChange={(e) => setRollNo(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="jc-er">ER No.</Label>
                        <Input id="jc-er" maxLength={40} value={erNo} onChange={(e) => setErNo(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="jc-sr">Sr No.</Label>
                        <Input id="jc-sr" maxLength={40} value={srNo} onChange={(e) => setSrNo(e.target.value)} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter at least one identifier so your teacher can match your work.
                    </p>
                  </div>
                )}
                <Button className="w-full" disabled={busy} onClick={() => void joinClassNow()}>
                  {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Join class
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
        ) : !preview.valid ? (
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold">This link isn't active</h1>
            <p className="text-sm text-muted-foreground">
              It may have expired, been switched off, or been replaced. Ask your teacher or institution for a new join link.
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
