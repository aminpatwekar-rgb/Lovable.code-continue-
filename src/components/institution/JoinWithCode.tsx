import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { joinWithCode, normalizeJoinCode } from "@/lib/institution-join";

/** Lets a signed-in student or teacher enter an institution join code (or paste the link). */
export function JoinWithCode({ onDone }: { onDone?: () => void }) {
  const { refresh } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const clean = normalizeJoinCode(code);
    if (clean.length < 6) {
      toast.error("Enter the code or paste the link your institution gave you.");
      return;
    }
    setBusy(true);
    try {
      const result = await joinWithCode(clean);
      await refresh();
      if (result.status === "pending") {
        toast.success(`Request sent. ${result.institutionName} will approve you shortly.`);
      } else if (result.status === "already_member") {
        toast.info(`You're already part of ${result.institutionName}.`);
      } else {
        toast.success(`You joined ${result.institutionName}.`);
      }
      setCode("");
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not use this join link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Join code or link"
        disabled={busy}
        autoCapitalize="characters"
        aria-label="Institution join code or link"
      />
      <Button type="button" variant="outline" onClick={() => void submit()} disabled={busy || !code.trim()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : "Join"}
      </Button>
    </div>
  );
}
