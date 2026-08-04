import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — Scriptio" },
      { name: "description", content: "Choose a new password for your Scriptio account." },
      { property: "og:title", content: "Reset password — Scriptio" },
      { property: "og:description", content: "Set a new password for your Scriptio account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    supabase.auth.getSession().then(({ data }) => {
      setReady(Boolean(isRecovery || data.session));
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = z.string().min(8, "At least 8 characters").max(72).safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated");
      navigate({ to: "/dashboard", replace: true });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md p-7">
        <h1 className="text-2xl font-semibold">Set a new password</h1>
        {!ready ? (
          <p className="mt-3 text-sm text-muted-foreground">
            This link is invalid or has expired. Request a new reset email from the sign-in page.
          </p>
        ) : (
          <form onSubmit={save} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pw">New password</Label>
              <Input
                id="pw"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
