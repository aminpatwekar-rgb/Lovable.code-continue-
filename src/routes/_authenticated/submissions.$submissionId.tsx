import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDue, type SubmissionStatus } from "@/lib/assignments";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmissionComments } from "@/components/SubmissionComments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/submissions/$submissionId")({
  head: () => ({
    meta: [
      { title: "Review submission — ONYX" },
      { name: "description", content: "Review a student submission, grade it and leave feedback." },
      { property: "og:title", content: "Review submission — ONYX" },
      { property: "og:description", content: "Grade work and leave improvement notes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReviewSubmission,
});

function ReviewSubmission() {
  const { submissionId } = Route.useParams();
  const { role } = useAuth();
  const qc = useQueryClient();
  const isTeacher = role === "teacher" || role === "admin";
  const [marks, setMarks] = useState("");
  const [feedback, setFeedback] = useState("");
  const [notes, setNotes] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const q = useQuery({
    queryKey: ["submission", submissionId],
    queryFn: async () => {
      const { data: sub, error } = await supabase
        .from("submissions")
        .select(
          "*, profiles!submissions_student_profile_fkey(full_name, email), assignments(id, title, max_marks, class_id)",
        )
        .eq("id", submissionId)
        .maybeSingle();
      if (error) throw error;
      if (!sub) return null;
      const { data: files } = await supabase
        .from("submission_files")
        .select("id, storage_path, file_name, kind, caption, page_order")
        .eq("submission_id", submissionId)
        .order("page_order", { ascending: true });
      const signed = await Promise.all(
        (files ?? []).map(async (f) => {
          const { data } = await supabase.storage
            .from("submissions")
            .createSignedUrl(f.storage_path, 3600);
          return { ...f, url: data?.signedUrl ?? "" };
        }),
      );
      const { data: violations } = await supabase
        .from("paste_violations")
        .select("id, kind, occurred_at")
        .eq("submission_id", submissionId)
        .order("occurred_at", { ascending: false });
      return { sub, files: signed, violations: violations ?? [] };
    },
  });

  useEffect(() => {
    if (hydrated || !q.data) return;
    setMarks(q.data.sub.marks_awarded?.toString() ?? "");
    setFeedback(q.data.sub.teacher_feedback ?? "");
    setNotes(q.data.sub.improvement_notes ?? "");
    setHydrated(true);
  }, [q.data, hydrated]);

  const grade = useMutation({
    mutationFn: async (next?: "reviewed" | "returned") => {
      const max = q.data?.sub.assignments
        ? (q.data.sub.assignments as unknown as { max_marks: number }).max_marks
        : 100;
      const value = marks.trim() === "" ? null : Number(marks);
      if (value !== null && (!Number.isFinite(value) || value < 0 || value > max))
        throw new Error(`Marks must be between 0 and ${max}`);
      const { error } = await supabase
        .from("submissions")
        .update({
          marks_awarded: value,
          teacher_feedback: feedback.trim().slice(0, 4000) || null,
          improvement_notes: notes.trim().slice(0, 2000) || null,
          status: next ?? "reviewed",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", submissionId);
      if (error) throw error;
      return next ?? "reviewed";
    },
    onSuccess: (status) => {
      toast.success(status === "returned" ? "Returned to student" : "Feedback saved");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (!q.data) return <p className="text-muted-foreground">Submission not found.</p>;

  const { sub, files, violations } = q.data;
  const student = sub.profiles as unknown as { full_name: string; email: string } | null;
  const assignment = sub.assignments as unknown as {
    id: string;
    title: string;
    max_marks: number;
  } | null;
  const pages = files.filter((f) => f.kind === "page");
  const inline = files.filter((f) => f.kind === "inline_image");

  return (
    <div className="space-y-8">
      {assignment && (
        <Link
          to="/assignments/$assignmentId"
          params={{ assignmentId: assignment.id }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {assignment.title}
        </Link>
      )}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{student?.full_name ?? "Submission"}</h1>
          <p className="mt-1 text-muted-foreground">
            {sub.submitted_at ? `Submitted ${formatDue(sub.submitted_at)}` : "Draft"} ·{" "}
            {sub.mode === "typed" ? "Typed" : "Handwritten"}
          </p>
        </div>
        <StatusBadge status={(sub.is_late ? "late" : sub.status) as SubmissionStatus} />
      </header>

      {sub.paste_violation_count > 0 && (
        <div className="panel border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <ShieldAlert className="size-4" />
            {sub.paste_violation_count} blocked copy/paste attempt
            {sub.paste_violation_count === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {violations.slice(0, 6).map((v) => (
              <li key={v.id}>
                {v.kind} · {formatDue(v.occurred_at)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pages.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pages</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {pages.map((p, i) => (
              <figure key={p.id} className="panel overflow-hidden p-0">
                <img src={p.url} alt={`Page ${i + 1}`} className="w-full object-contain" />
                <figcaption className="px-3 py-2 text-xs text-muted-foreground">
                  Page {i + 1} · {p.file_name}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {sub.typed_content && (
        <section className="panel p-6">
          <h2 className="text-lg font-semibold">Typed answer</h2>
          <p className="mt-3 whitespace-pre-wrap leading-7">{sub.typed_content}</p>
          {inline.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {inline.map((f) => (
                <figure key={f.id}>
                  <img
                    src={f.url}
                    alt={f.caption || "Student illustration"}
                    className="w-full rounded-md border border-border object-cover"
                  />
                  {f.caption && (
                    <figcaption className="mt-1 text-xs text-muted-foreground">
                      {f.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}
        </section>
      )}

      {isTeacher ? (
        <section className="panel space-y-4 p-6">
          <h2 className="text-lg font-semibold">Grade &amp; feedback</h2>
          <div className="space-y-1.5">
            <Label htmlFor="marks">Marks (out of {assignment?.max_marks ?? 100})</Label>
            <Input
              id="marks"
              type="number"
              min={0}
              max={assignment?.max_marks ?? 100}
              value={marks}
              onChange={(e) => setMarks(e.target.value)}
              className="max-w-32"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fb">Feedback</Label>
            <Textarea
              id="fb"
              maxLength={4000}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="min-h-28"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imp">How to improve</Label>
            <Textarea
              id="imp"
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => grade.mutate("reviewed")} disabled={grade.isPending}>
              {grade.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Save review
            </Button>
            <Button
              variant="outline"
              onClick={() => grade.mutate("returned")}
              disabled={grade.isPending}
            >
              Return for changes
            </Button>
          </div>
        </section>
      ) : (
        sub.teacher_feedback && (
          <section className="panel border-info/40 bg-info/5 p-6">
            <h2 className="text-lg font-semibold">Teacher feedback</h2>
            <p className="mt-2 whitespace-pre-wrap leading-7">{sub.teacher_feedback}</p>
            {sub.improvement_notes && (
              <p className="mt-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">How to improve: </span>
                {sub.improvement_notes}
              </p>
            )}
          </section>
        )
      )}

      <SubmissionComments submissionId={submissionId} />
    </div>
  );
}
