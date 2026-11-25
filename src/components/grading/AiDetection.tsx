/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_SCAN_BATCH, MIN_WORDS_TO_SCORE, type AiScanResult } from "@/lib/grading/ai-detection";
import { getAiScans, scanSubmissionsForAI } from "@/lib/grading/ai-detection.functions";

const db = supabase as any;
const CHUNK = 5;

/** True when the teacher's plan (or their institution's plan) includes AI detection. */
export function useAiDetectionAccess() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["plan-feature", user?.id, "ai_detection"],
    enabled: Boolean(user),
    queryFn: async () => {
      const r = await db.rpc("user_has_feature", { _feature: "ai_detection" });
      if (r.error) throw r.error;
      return Boolean(r.data);
    },
  });
  return q.data === true;
}

export function useAiScans(submissionIds: string[]) {
  const load = useServerFn(getAiScans);
  const key = [...submissionIds].sort().join(",");
  const q = useQuery({
    queryKey: ["ai-scans", key],
    enabled: submissionIds.length > 0,
    queryFn: () => load({ data: { submissionIds } }),
  });
  const map = new Map<string, AiScanResult>((q.data ?? []).map((s) => [s.submission_id, s]));
  return { scans: map, isLoading: q.isLoading };
}

/** Runs scans in chunks so large selections show progress and never hit a server timeout. */
export function useRunAiScans() {
  const scan = useServerFn(scanSubmissionsForAI);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const run = useCallback(
    async (ids: string[], force = false) => {
      const list = ids.slice(0, MAX_SCAN_BATCH);
      setProgress({ done: 0, total: list.length });
      let failed = 0;
      let firstError = "";
      for (let i = 0; i < list.length; i += CHUNK) {
        const chunk = list.slice(i, i + CHUNK);
        try {
          const outcomes = await scan({ data: { submissionIds: chunk, force } });
          for (const o of outcomes)
            if (!o.ok) {
              failed++;
              firstError ||= o.error;
            }
        } catch (error) {
          failed += chunk.length;
          firstError ||= error instanceof Error ? error.message : "Scan failed.";
        }
        setProgress({ done: Math.min(list.length, i + CHUNK), total: list.length });
      }
      setProgress(null);
      await qc.invalidateQueries({ queryKey: ["ai-scans"] });
      if (failed > 0)
        toast.error(`${failed} of ${list.length} could not be scanned. ${firstError}`);
      else toast.success(`Scanned ${list.length} submission${list.length === 1 ? "" : "s"}.`);
    },
    [scan, qc],
  );
  return { run, progress, busy: progress !== null };
}

const RISK_STYLE = {
  low: "border-success/30 bg-success/15 text-success",
  medium: "border-warning/40 bg-warning/15 text-warning-foreground dark:text-warning",
  high: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;
const RISK_LABEL = { low: "Low", medium: "Review", high: "High" } as const;

/** Small pill for the queue: shows only once a scan exists. */
export function AiScanPill({ scan }: { scan?: AiScanResult | undefined }) {
  if (!scan || scan.status !== "done" || !scan.risk) return null;
  return (
    <span
      title={`AI indicators: ${scan.score}/100`}
      className={cn(
        "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        RISK_STYLE[scan.risk],
      )}
    >
      AI {RISK_LABEL[scan.risk]}
    </span>
  );
}

function Report({ scan }: { scan: AiScanResult }) {
  if (scan.status === "no_text") {
    return (
      <p className="text-sm text-muted-foreground">
        There is no typed text to scan. Handwritten pages can&apos;t be scanned yet.
      </p>
    );
  }
  if (scan.status === "too_short") {
    return (
      <p className="text-sm text-muted-foreground">
        Too short to assess ({scan.word_count} words; at least {MIN_WORDS_TO_SCORE} are needed).
        Short answers can&apos;t be judged reliably.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            RISK_STYLE[scan.risk ?? "low"],
          )}
        >
          {scan.risk === "high"
            ? "Strong indicators"
            : scan.risk === "medium"
              ? "Review suggested"
              : "Few indicators"}{" "}
          · {scan.score}/100
        </span>
        <span className="text-xs text-muted-foreground">
          {scan.word_count} words · scanned {new Date(scan.scanned_at).toLocaleString()}
        </span>
      </div>
      <ul className="space-y-1.5">
        {scan.signals.map((s) => (
          <li key={s.key} className="flex gap-2 text-sm">
            <span
              aria-hidden
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                s.fired ? "bg-warning" : "bg-muted-foreground/30",
              )}
            />
            <span>
              <span className="font-medium">{s.label}.</span>{" "}
              <span className="text-muted-foreground">{s.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {scan.flagged.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Sentences to look at</p>
          <ul className="mt-1 space-y-2">
            {scan.flagged.map((f, i) => (
              <li key={i} className="rounded-md border border-border bg-muted/40 p-2 text-sm">
                <p className="leading-6">&ldquo;{f.text}&rdquo;</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{f.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Per-submission panel in the grading view. Renders nothing on plans without AI detection. */
export function AiScanPanel({ submissionId }: { submissionId: string }) {
  const allowed = useAiDetectionAccess();
  const { scans } = useAiScans(allowed ? [submissionId] : []);
  const { run, busy } = useRunAiScans();
  if (!allowed) return null;
  const scan = scans.get(submissionId);
  return (
    <div className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <ScanSearch className="size-4" /> AI writing indicators
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run([submissionId], Boolean(scan))}
        >
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : scan ? (
            <RotateCcw className="mr-2 size-4" />
          ) : (
            <ScanSearch className="mr-2 size-4" />
          )}
          {busy ? "Scanning…" : scan ? "Rescan" : "Scan for AI"}
        </Button>
      </div>
      {scan ? (
        <Report scan={scan} />
      ) : (
        <p className="text-sm text-muted-foreground">Not scanned. Scans only run when you ask.</p>
      )}
      <p className="text-xs text-muted-foreground">
        These are indicators for your review, not proof. Formal or non-native English writing can
        trigger false positives. Nothing here changes marks.
      </p>
    </div>
  );
}

/** Toolbar above the queue: scan the ticked students in one go. */
export function AiScanToolbar({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  const { run, progress, busy } = useRunAiScans();
  const [confirming, setConfirming] = useState(false);
  const over = selectedIds.length > MAX_SCAN_BATCH;
  if (selectedIds.length === 0) return null;
  return (
    <div className="mb-2 space-y-2 rounded-lg border border-border bg-muted/40 p-2.5 text-sm">
      {busy && progress ? (
        <p className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Scanned {progress.done} of {progress.total}…
        </p>
      ) : confirming ? (
        <>
          <p>
            Scan {Math.min(selectedIds.length, MAX_SCAN_BATCH)} submission
            {selectedIds.length === 1 ? "" : "s"} for AI writing?
            {over &&
              ` (Limit is ${MAX_SCAN_BATCH} at a time; the first ${MAX_SCAN_BATCH} will be scanned.)`}{" "}
            Already-scanned work isn&apos;t rescanned.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setConfirming(false);
                void run(selectedIds).then(onClear);
              }}
            >
              Scan
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{selectedIds.length} selected</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setConfirming(true)}>
              <ScanSearch className="mr-2 size-4" /> Scan selected for AI
            </Button>
            <Button size="sm" variant="ghost" onClick={onClear}>
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
