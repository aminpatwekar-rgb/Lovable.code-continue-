import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CornerDownLeft, Loader2, Plus, SkipForward, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDue, type SubmissionStatus } from "@/lib/assignments";
import { percentOf, quickMarks } from "@/lib/grading/types";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmissionComments } from "@/components/SubmissionComments";
import { SubmissionViewer } from "@/components/grading/SubmissionViewer";
import { RubricGrader } from "@/components/grading/RubricGrader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const DEFAULT_COMMENTS = [
  "Well done.",
  "Show your working.",
  "Check your units.",
  "Good method, small slip.",
  "Please add more detail.",
];

/** Loads one submission and lets the teacher mark it. Remount (key) it per student. */
export function AssignmentGradePanel({
  submissionId,
  maxMarks,
  hasNext,
  onDone,
  onSkip,
}: {
  submissionId: string;
  maxMarks: number;
  hasNext: boolean;
  /** Called after a successful save so the workspace can move on. */
  onDone: (status: "reviewed" | "returned") => void;
  onSkip: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [marks, setMarks] = useState("");
  const [feedback, setFeedback] = useState("");
  const [notes, setNotes] = useState("");
  const [released, setReleased] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [feedbackSnippets, setFeedbackSnippets] = useState<string[]>(DEFAULT_COMMENTS);
  const [newFeedbackSnippet, setNewFeedbackSnippet] = useState("");

  useEffect(() => {
    if (!user?.id) {
      setFeedbackSnippets(DEFAULT_COMMENTS);
      return;
    }
    try {
      const stored = localStorage.getItem(`onyx.feedback-snippets.${user.id}`);
      if (!stored) {
        setFeedbackSnippets(DEFAULT_COMMENTS);
        return;
      }
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        setFeedbackSnippets(DEFAULT_COMMENTS);
        return;
      }
      const clean = parsed
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().slice(0, 120))
        .filter(Boolean);
      setFeedbackSnippets([...new Set(clean)].slice(0, 20));
    } catch {
      setFeedbackSnippets(DEFAULT_COMMENTS);
    }
  }, [user?.id]);

  function persistFeedbackSnippets(next: string[]) {
    setFeedbackSnippets(next);
    try {
      if (user?.id) {
        localStorage.setItem(`onyx.feedback-snippets.${user.id}`, JSON.stringify(next));
      }
    } catch {
      toast.error("Couldn't save reusable feedback in this browser.");
    }
  }

  function addFeedbackSnippet() {
    const snippet = newFeedbackSnippet.trim().slice(0, 120);
    if (!snippet) return;
    if (feedbackSnippets.some((saved) => saved.toLocaleLowerCase() === snippet.toLocaleLowerCase())) {
      toast.error("That feedback phrase is already saved.");
      return;
    }
    if (feedbackSnippets.length >= 20) {
      toast.error("You can save up to 20 reusable feedback phrases.");
      return;
    }
    persistFeedbackSnippets([...feedbackSnippets, snippet]);
    setNewFeedbackSnippet("");
    toast.success("Reusable feedback saved");
  }

  function removeFeedbackSnippet(snippet: string) {
    persistFeedbackSnippets(feedbackSnippets.filter((saved) => saved !== snippet));
  }

  const q = useQuery({
    queryKey: ["grading", "submission", submissionId],
    queryFn: async () => {
      const { data: sub, error } = await supabase
        .from("submissions")
        .select("*, assignments(rubric_id)")
        .eq("id", submissionId)
        .maybeSingle();
      if (error) throw error;
      if (!sub) return null;
      const [{ data: files }, { data: violations }] = await Promise.all([
        supabase
          .from("submission_files")
          .select("id, storage_path, file_name, kind, caption, page_order")
          .eq("submission_id", submissionId)
          .order("page_order", { ascending: true }),
        supabase
          .from("paste_violations")
          .select("id, kind, occurred_at")
          .eq("submission_id", submissionId)
          .order("occurred_at", { ascending: false }),
      ]);
      const signed = await Promise.all(
        (files ?? []).map(async (f) => {
          const { data } = await supabase.storage
            .from("submissions")
            .createSignedUrl(f.storage_path, 3600);
          return { ...f, url: data?.signedUrl ?? "" };
        }),
      );
      return { sub, files: signed, violations: violations ?? [] };
    },
  });

  useEffect(() => {
    if (hydrated || !q.data) return;
    const s = q.data.sub;
    setMarks(s.marks_awarded?.toString() ?? "");
    setFeedback(s.teacher_feedback ?? "");
    setNotes(s.improvement_notes ?? "");
    setReleased(s.grade_released ?? true);
    setHydrated(true);
  }, [q.data, hydrated]);

  const value = marks.trim() === "" ? null : Number(marks);
  const invalid = value !== null && (!Number.isFinite(value) || value < 0 || value > maxMarks);
  const pct = percentOf(value, maxMarks);

  const save = useMutation({
    mutationFn: async (status: "reviewed" | "returned") => {
      if (status === "reviewed" && value === null)
        throw new Error(`Enter marks from 0 to ${maxMarks}`);
      if (invalid) throw new Error(`Marks must be between 0 and ${maxMarks}`);
      if (status === "returned" && !feedback.trim())
        throw new Error("Tell the student what to change before returning the work");
      const { error } = await supabase
        .from("submissions")
        .update({
          marks_awarded: value,
          teacher_feedback: feedback.trim().slice(0, 4000) || null,
          improvement_notes: notes.trim().slice(0, 2000) || null,
          grade_released: released,
          status,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", submissionId);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      toast.success(status === "returned" ? "Returned to student" : "Grade saved");
      void qc.invalidateQueries();
      onDone(status);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }
  if (!q.data) return <p className="text-muted-foreground">Submission not found.</p>;

  const { sub, files, violations } = q.data;
  const alreadyGraded = sub.status === "reviewed" || sub.status === "completed";
  const busy = save.isPending;

  const submit = () => save.mutate("reviewed");

  return (
    <div className="space-y-5">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          {sub.submitted_at ? `Submitted ${formatDue(sub.submitted_at)}` : "Draft"} ·{" "}
          {sub.mode === "typed" ? "Typed" : "Handwritten"}
        </p>
        <StatusBadge status={(sub.is_late ? "late" : sub.status) as SubmissionStatus} />
      </div>

      <SubmissionViewer
        files={files}
        typedContent={sub.typed_content}
        violations={violations}
        violationCount={sub.paste_violation_count}
      />

      {((sub as any).assignments as { rubric_id?: string | null } | null)?.rubric_id && (
        <RubricGrader
          submissionId={submissionId}
          rubricId={((sub as any).assignments as { rubric_id: string }).rubric_id}
          onTotalChange={(total) => {
            if (total > 0 && marks.trim() === "") setMarks(String(total));
          }}
        />
      )}

      <section
        className="panel space-y-5 p-5 sm:p-6"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !busy) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <h2 className="text-lg font-semibold">Grade &amp; feedback</h2>

        <div className="space-y-2">
          <Label htmlFor="gp-marks">Marks</Label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-baseline gap-2">
              <Input
                id="gp-marks"
                type="number"
                inputMode="decimal"
                min={0}
                max={maxMarks}
                step={0.5}
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                aria-invalid={invalid}
                className={cn(
                  "h-12 w-28 text-center text-2xl font-semibold",
                  invalid && "border-destructive",
                )}
              />
              <span className="text-muted-foreground">/ {maxMarks}</span>
              {pct !== null && !invalid && (
                <span className="ml-1 text-sm font-medium text-muted-foreground tabular-nums">
                  {pct}%
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick marks">
              {quickMarks(maxMarks).map((m) => (
                <Button
                  key={m.label}
                  type="button"
                  size="sm"
                  variant={value === m.value ? "default" : "outline"}
                  onClick={() => setMarks(String(m.value))}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          </div>
          {invalid && (
            <p className="text-xs text-destructive">Marks must be between 0 and {maxMarks}.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="gp-fb">Feedback</Label>
          <Textarea
            id="gp-fb"
            maxLength={4000}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What went well, and what to fix"
            className="min-h-28"
          />
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reusable feedback phrases">
              {feedbackSnippets.map((snippet) => (
                <span
                  key={snippet}
                  className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-border"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setFeedback((current) =>
                        current.trim() ? `${current.trimEnd()} ${snippet}` : snippet,
                      )
                    }
                    className="rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title={`Insert: ${snippet}`}
                  >
                    + {snippet}
                  </button>
                  {!DEFAULT_COMMENTS.includes(snippet) && (
                    <button
                      type="button"
                      onClick={() => removeFeedbackSnippet(snippet)}
                      className="mr-1 rounded-full p-1 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove reusable phrase: ${snippet}`}
                      title="Remove saved phrase"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                value={newFeedbackSnippet}
                onChange={(event) => setNewFeedbackSnippet(event.target.value)}
                placeholder="Save a feedback phrase you reuse"
                maxLength={120}
                aria-label="New reusable feedback phrase"
                className="min-w-0 flex-1"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addFeedbackSnippet();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addFeedbackSnippet}
                disabled={!newFeedbackSnippet.trim() || feedbackSnippets.length >= 20}
              >
                <Plus className="mr-1.5 size-3.5" /> Save phrase
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Your reusable phrases are saved in this browser for your teacher account.
            </p>
          </div>
        </div>

        <details
          className="group rounded-md border border-border/70 px-3 py-2"
          open={Boolean(notes)}
        >
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Add a &ldquo;how to improve&rdquo; note (optional)
          </summary>
          <Textarea
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-2"
            aria-label="How to improve"
          />
        </details>

        <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
          <div>
            <Label htmlFor="gp-release" className="text-sm font-medium">
              Show the grade to the student
            </Label>
            <p className="text-xs text-muted-foreground">
              Turn off to keep marks hidden until you release them for the whole class.
            </p>
          </div>
          <Switch id="gp-release" checked={released} onCheckedChange={setReleased} />
        </div>
      </section>

      <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 lg:bottom-4">
        <div className="panel glass flex flex-wrap items-center gap-2 p-3 shadow-lg">
          <Button onClick={submit} disabled={busy || invalid} className="gap-1.5">
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CornerDownLeft className="size-4" />
            )}
            {alreadyGraded ? "Update grade" : hasNext ? "Save & next" : "Save grade"}
          </Button>
          <Button
            variant="outline"
            onClick={() => save.mutate("returned")}
            disabled={busy}
            className="gap-1.5"
          >
            <Undo2 className="size-4" /> Return for changes
          </Button>
          {hasNext && (
            <Button variant="ghost" onClick={onSkip} disabled={busy} className="ml-auto gap-1.5">
              <SkipForward className="size-4" /> Skip
            </Button>
          )}
          <span className="ml-auto hidden text-xs text-muted-foreground xl:inline">
            Ctrl + Enter to save
          </span>
        </div>
      </div>

      <details className="panel p-4">
        <summary className="cursor-pointer text-sm font-medium">Comments with the student</summary>
        <div className="mt-3">
          <SubmissionComments submissionId={submissionId} />
        </div>
      </details>
    </div>
  );
}
