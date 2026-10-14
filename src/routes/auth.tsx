import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, GraduationCap, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { SPRING_PRESS, getPressProps } from "@/lib/motionPresets";
import onyxMark from "@/assets/onyx-mark.png.asset.json";
import {
  clearPendingJoinCode,
  joinWithCode,
  previewJoin,
  readPendingJoinCode,
  type JoinPreview,
} from "@/lib/institution-join";
import {
  clearSessionConfirmation,
  isSessionConfirmed,
  markSessionConfirmed,
} from "@/lib/session-confirm";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  confirm: z.boolean().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — ONYX" },
      {
        name: "description",
        content: "Sign in or create a student or teacher account on ONYX.",
      },
      { property: "og:title", content: "Sign in — ONYX" },
      { property: "og:description", content: "Access your classes, assignments and submissions." },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

function AuthPage() {
  const shouldReduceMotion = useReducedMotion();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { session, profile, loading, refresh } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signup");
  const [role, setRole] = useState<"student" | "teacher" | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [joinPreview, setJoinPreview] = useState<JoinPreview | null>(null);
  const [skipJoin, setSkipJoin] = useState(false);

  // A join link the person opened earlier decides their role and institution.
  useEffect(() => {
    const code = readPendingJoinCode();
    if (!code) return;
    setJoinCode(code);
    void previewJoin(code).then((preview) => {
      setJoinPreview(preview);
      if (!preview.valid) clearPendingJoinCode();
    });
  }, []);
  const activeJoin = !skipJoin && joinCode && joinPreview?.valid ? joinPreview : null;

  const confirmed = isSessionConfirmed(session?.user.id);
  // Only an explicitly confirmed account is allowed through to the app.
  const needsRoleConfirmation = Boolean(session && profile && !profile.role_confirmed_at);
  const needsConfirm = Boolean(session) && !confirmed && !switching;

  useEffect(() => {
    if (!loading && session && confirmed && profile?.role_confirmed_at && !switching)
      navigate({ to: "/dashboard", replace: true });
  }, [loading, session, confirmed, profile?.role_confirmed_at, switching, navigate]);

  async function handleUseAnotherAccount() {
    setSwitching(true);
    clearSessionConfirmation();
    await supabase.auth.signOut();
    setMode("signin");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!fullName.trim()) {
          toast.error("Please enter your full name");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          toast.success("Check your email to confirm your account.");
          return;
        }
        setSwitching(false);
        toast.success("Account created. Please confirm your role to continue.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        markSessionConfirmed(data.user?.id);
        setSwitching(false);
        toast.success("Signed in");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth?mode=signup`,
    });
    if (result.error) {
      toast.error("Google sign-in failed");
      return;
    }
  }

  async function confirmRole() {
    if (!role) {
      toast.error("Choose Student or Teacher to continue.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("confirm_account_role", { _role: role });
      if (error) throw error;
      await refresh();
      markSessionConfirmed(session?.user.id);
      toast.success("Your account role has been confirmed.");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not confirm your role. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmJoin() {
    if (!joinCode) return;
    setBusy(true);
    try {
      const result = await joinWithCode(joinCode);
      clearPendingJoinCode();
      await refresh();
      markSessionConfirmed(session?.user.id);
      toast.success(
        result.status === "pending"
          ? `Request sent. ${result.institutionName} will approve you shortly.`
          : `You joined ${result.institutionName}.`,
      );
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not use this join link.");
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    const parsed = z.string().email().safeParse(email.trim());
    if (!parsed.success) {
      toast.error("Enter your email above first");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset link sent");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="panel w-full max-w-md p-7"
      >
        <Link to="/" className="mb-6 flex items-center gap-2">
          <img
            src={onyxMark.url}
            width={32}
            height={32}
            decoding="async"
            alt=""
            aria-hidden="true"
            className="size-8 rounded-full object-cover"
          />
          <span className="font-semibold tracking-tight">ONYX</span>
        </Link>

        {needsRoleConfirmation && activeJoin ? (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold">
                Join {activeJoin.institutionName}
                {activeJoin.departmentName ? ` · ${activeJoin.departmentName}` : ""}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                You're joining as a{" "}
                <span className="font-medium text-foreground">
                  {activeJoin.role === "teacher" ? "teacher" : "student"}
                </span>
                .{activeJoin.requiresApproval ? " An administrator will approve your request before you appear in the institution." : ""}
              </p>
            </div>
            <Button className="w-full" disabled={busy} onClick={() => void confirmJoin()}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Join as {activeJoin.role === "teacher" ? "Teacher" : "Student"}
            </Button>
            <Button variant="outline" className="w-full" disabled={busy} onClick={() => { clearPendingJoinCode(); setSkipJoin(true); }}>
              Not joining an institution
            </Button>
            <Button variant="ghost" className="w-full" disabled={busy} onClick={() => void handleUseAnotherAccount()}>
              Use another account
            </Button>
          </div>
        ) : needsRoleConfirmation ? (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold">How will you use ONYX?</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose your role carefully. You must confirm it before entering ONYX, so teachers
                do not accidentally set up a student account.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                { key: "student", label: "Student", description: "Join classes and submit work", icon: GraduationCap },
                { key: "teacher", label: "Teacher", description: "Create classes and manage work", icon: Presentation },
              ] as const).map((r) => (
                <motion.button
                  key={r.key}
                  type="button"
                  disabled={busy}
                  {...getPressProps(shouldReduceMotion, { hoverScale: 1.02, tapScale: 0.98 })}
                  onClick={() => setRole(r.key)}
                  aria-pressed={role === r.key}
                  className={cn(
                    "flex min-h-32 flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                    role === r.key
                      ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/50 hover:bg-accent/50",
                  )}
                >
                  <r.icon className="size-5 text-primary" />
                  <span className="text-sm font-semibold">{r.label}</span>
                  <span className="text-xs text-muted-foreground">{r.description}</span>
                </motion.button>
              ))}
            </div>
            <Button className="w-full" disabled={!role || busy} onClick={() => void confirmRole()}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {role ? "Confirm as " + (role === "teacher" ? "Teacher" : "Student") : "Select your role to continue"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              You cannot change this choice from this screen after confirming it.
            </p>
            <Button variant="outline" className="w-full" disabled={busy} onClick={() => void handleUseAnotherAccount()}>
              Use another account
            </Button>
          </div>
        ) : needsConfirm ? (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold">
              Continue as {profile?.full_name?.trim() || session?.user.email || "this account"}?
            </h1>
            <p className="text-sm text-muted-foreground">
              You're already signed in with{" "}
              <span className="font-medium text-foreground">{session?.user.email}</span>. ONYX never
              opens an account for you automatically.
            </p>
            <Button
              className="w-full"
              onClick={() => {
                markSessionConfirmed(session!.user.id);
                navigate({ to: "/dashboard", replace: true });
              }}
            >
              Continue as {profile?.full_name?.trim().split(" ")[0] || session?.user.email}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void handleUseAnotherAccount()}
            >
              Use another account
            </Button>
          </div>
        ) : sent ? (
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold">Confirm your email</h1>
            <p className="text-sm text-muted-foreground">
              We sent a confirmation link to <span className="font-medium">{email}</span>. Click it
              to activate your account, then come back and sign in.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setSent(false);
                setMode("signin");
              }}
            >
              Back to sign in
            </Button>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            {activeJoin && (
              <div className="mt-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm">
                You're joining <span className="font-semibold">{activeJoin.institutionName}</span> as a{" "}
                {activeJoin.role === "teacher" ? "teacher" : "student"}.
              </div>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signup"
                ? "Create your account first. You will confirm your role in the next step."
                : "Sign in to your classes and assignments."}
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    value={fullName}
                    maxLength={100}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ada Lovelace"
                    required
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={forgot}
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                {mode === "signup" ? "Create account" : "Sign in"}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or{" "}
              <span className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant="outline"
              className="mt-1 flex h-12 w-full items-center justify-center gap-3 border-2 border-border bg-background text-base font-semibold shadow-sm transition-all hover:border-primary/60 hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              onClick={() => void google()}
              aria-label="Sign in with Google"
            >
              <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5 shrink-0">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.74 7.18l7.27 5.64c4.25-3.92 6.71-9.7 6.71-17.29Z" />
                <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.81l-7.27-5.64c-2.02 1.35-4.6 2.15-8.64 2.15-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
              </svg>
              <span>Sign in with Google</span>
            </Button>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signup" ? "Already have an account?" : "New to ONYX?"}{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              >
                {mode === "signup" ? "Sign in" : "Create one"}
              </button>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
