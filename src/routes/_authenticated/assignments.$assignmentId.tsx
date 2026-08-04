import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ArrowLeft, FileUp, Loader2, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { daysLate, formatDue, type SubmissionStatus } from "@/lib/assignments";
import { StatusBadge } from "@/components/StatusBadge";
import { TypedEditor, type ImageBlock } from "@/components/TypedEditor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/assignments/$assignmentId")({
  head: () => ({
    meta: [
      { title: "Assignment — Scriptio" },
      { name: "description", content: "Assignment details, instructions and submission." },
      { property: "og:title", content: "Assignment — Scriptio" },
      { property: "og:description", content: "View instructions and submit your work." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AssignmentPage,
});

type Page = { id: string; storage_path: string; file_name: string; url: string; page_order: number };

function AssignmentPage() {
  const { assignmentId } = Route.useParams();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isTeacher = role === "teacher" || role === "admin";

  const assignment = useQuery({
    queryKey: ["assignment", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*, classes(name)")
        .eq("id", assignmentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (assignment.isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (!assignment.data) return <p className="text-muted-foreground">Assignment not found.</p>;

  const a = assignment.data;
  const late = daysLate(a.due_date);

  return (
    <div className="space-y-8">
      <Link
        to="/classes/$classId"
        params={{ classId: a.class_id }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {(a.classes as { name: string } | null)?.name ?? "Class"}
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border px-2 py-0.5">
            {a.subject || "General"}
          </span>
          <span className="rounded-full border border-border px-2 py-0.5 capitalize">
            {a.priority} priority
          </span>
          <span className="rounded-full border border-border px-2 py-0.5 capitalize">
            {a.submission_type}
          </span>
          {!a.published && (
            <span className="rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5">
              Draft
            </span>
          )}
        </div>
        <h1 className="text-3xl font-semibold">{a.title}</h1>
        <p className="text-muted-foreground">
          Due {formatDue(a.due_date)} · {a.max_marks} marks
          {late > 0 && (
            <span className="ml-2 font-medium text-destructive">
              Overdue by {late} day{late === 1 ? "" : "s"}
            </span>
          )}
        </p>
      </header>

      {a.instructions && (
        <section className="panel p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">Instructions</h2>
          <p className="mt-2 whitespace-pre-wrap leading-7">{a.instructions}</p>
        </section>
      )}

      {isTeacher ? (
        <TeacherView assignmentId={assignmentId} maxMarks={a.max_marks} />
      ) : (
        <StudentSubmission
          assignment={{
            id: a.id,
            due_date: a.due_date,
            submission_type: a.submission_type,
            allow_images: a.allow_images,
            allow_autocorrect: a.allow_autocorrect,
            allow_voice_typing: a.allow_voice_typing,
          }}
          userId={user!.id}
          onSaved={() => void qc.invalidateQueries()}
        />
      )}
    </div>
  );
}

function TeacherView({ assignmentId, maxMarks }: { assignmentId: string; maxMarks: number }) {
  const subs = useQuery({
    queryKey: ["assignment-subs", assignmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("submissions")
        .select(
          "id, status, is_late, marks_awarded, submitted_at, paste_violation_count, student_id, profiles:student_id(full_name)",
        )
        .eq("assignment_id", assignmentId)
        .order("submitted_at", { ascending: false });
      return data ?? [];
    },
  });

  if (subs.isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Submissions ({subs.data?.length ?? 0})</h2>
      {(subs.data ?? []).length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">Nothing submitted yet.</p>
      ) : (
        <ul className="panel divide-y divide-border">
          {(subs.data ?? []).map((s) => {
            const p = s.profiles as unknown as { full_name: string } | null;
            return (
              <li key={s.id}>
                <Link
                  to="/submissions/$submissionId"
                  params={{ submissionId: s.id }}
                  className="flex items-center gap-3 p-4 transition-colors hover:bg-accent/40"
                >
                  <Avatar className="size-9">
                    <AvatarFallback>{(p?.full_name ?? "?").slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p?.full_name ?? "Student"}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.submitted_at ? formatDue(s.submitted_at) : "Draft"}
                      {s.paste_violation_count > 0 &&
                        ` · ${s.paste_violation_count} paste flags`}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {s.marks_awarded == null ? "—" : `${s.marks_awarded}/${maxMarks}`}
                  </span>
                  <StatusBadge status={(s.is_late ? "late" : s.status) as SubmissionStatus} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StudentSubmission({
  assignment,
  userId,
  onSaved,
}: {
  assignment: {
    id: string;
    due_date: string | null;
    submission_type: string;
    allow_images: boolean;
    allow_autocorrect: boolean;
    allow_voice_typing: boolean;
  };
  userId: string;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [blocks, setBlocks] = useState<ImageBlock[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [violations, setViolations] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const submission = useQuery({
    queryKey: ["my-submission", assignment.id, userId],
    queryFn: async () => {
      const { data: sub } = await supabase
        .from("submissions")
        .select("*")
        .eq("assignment_id", assignment.id)
        .eq("student_id", userId)
        .maybeSingle();
      if (!sub) return null;
      const { data: files } = await supabase
        .from("submission_files")
        .select("id, storage_path, file_name, page_order, kind, caption")
        .eq("submission_id", sub.id)
        .order("page_order", { ascending: true });
      const signed = await Promise.all(
        (files ?? []).map(async (f) => {
          const { data } = await supabase.storage
            .from("submissions")
            .createSignedUrl(f.storage_path, 3600);
          return { ...f, url: data?.signedUrl ?? "" };
        }),
      );
      return { sub, files: signed };
    },
  });

  useEffect(() => {
    if (hydrated || !submission.data) return;
    const { sub, files } = submission.data;
    setText(sub.typed_content ?? "");
    setViolations(sub.paste_violation_count ?? 0);
    setBlocks(
      files
        .filter((f) => f.kind === "inline_image")
        .map((f) => ({ id: f.id, path: f.storage_path, url: f.url, caption: f.caption ?? "" })),
    );
    setPages(files.filter((f) => f.kind === "page") as Page[]);
    setHydrated(true);
  }, [submission.data, hydrated]);

  const locked = ["submitted", "reviewed", "completed", "late"].includes(
    submission.data?.sub.status ?? "",
  );

  const mode: "handwritten" | "typed" =
    assignment.submission_type === "typed"
      ? "typed"
      : assignment.submission_type === "handwritten"
        ? "handwritten"
        : ((submission.data?.sub.mode as "handwritten" | "typed") ?? "handwritten");
  const [choice, setChoice] = useState<"handwritten" | "typed">(mode);
  const activeMode = assignment.submission_type === "either" ? choice : mode;

  async function ensureSubmission() {
    if (submission.data?.sub) return submission.data.sub.id;
    const { data, error } = await supabase
      .from("submissions")
      .insert({
        assignment_id: assignment.id,
        student_id: userId,
        status: "in_progress",
        mode: activeMode,
      })
      .select("id")
      .single();
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["my-submission"] });
    return data.id;
  }

  async function uploadFile(file: File, kind: "page" | "inline_image", order: number) {
    const submissionId = await ensureSubmission();
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${assignment.id}/${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("submissions").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;
    const { data: row, error: rowErr } = await supabase
      .from("submission_files")
      .insert({
        submission_id: submissionId,
        storage_path: path,
        file_name: file.name.slice(0, 160),
        mime_type: file.type,
        size_bytes: file.size,
        kind,
        page_order: order,
      })
      .select("id")
      .single();
    if (rowErr) throw rowErr;
    const { data: signed } = await supabase.storage
      .from("submissions")
      .createSignedUrl(path, 3600);
    return { id: row.id, path, url: signed?.signedUrl ?? "", file_name: file.name };
  }

  async function handlePages(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: Page[] = [];
      let order = pages.length;
      for (const file of Array.from(files)) {
        const ok = file.type.startsWith("image/") || file.type === "application/pdf";
        if (!ok) {
          toast.error(`${file.name} must be an image or PDF`);
          continue;
        }
        if (file.size > 15 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 15MB`);
          continue;
        }
        const r = await uploadFile(file, "page", order);
        added.push({
          id: r.id,
          storage_path: r.path,
          url: r.url,
          file_name: r.file_name,
          page_order: order,
        });
        order += 1;
      }
      setPages((p) => [...p, ...added]);
      if (added.length) toast.success(`${added.length} page(s) uploaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removePage(p: Page) {
    await supabase.from("submission_files").delete().eq("id", p.id);
    await supabase.storage.from("submissions").remove([p.storage_path]);
    setPages((prev) => prev.filter((x) => x.id !== p.id));
  }

  async function logViolation(kind: string) {
    setViolations((v) => v + 1);
    try {
      const submissionId = await ensureSubmission();
      await supabase
        .from("paste_violations")
        .insert({ submission_id: submissionId, student_id: userId, kind });
      await supabase
        .from("submissions")
        .update({ paste_violation_count: violations + 1 })
        .eq("id", submissionId);
    } catch {
      /* non-blocking */
    }
  }

  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      const submissionId = await ensureSubmission();
      if (submit) {
        if (activeMode === "handwritten" && pages.length === 0)
          throw new Error("Upload at least one page before submitting");
        if (activeMode === "typed" && text.trim().length < 10)
          throw new Error("Write your answer before submitting");
      }
      const isLate = assignment.due_date ? new Date() > new Date(assignment.due_date) : false;
      const { error } = await supabase
        .from("submissions")
        .update({
          typed_content: activeMode === "typed" ? text : null,
          typed_blocks: blocks.map((b, i) => ({ path: b.path, caption: b.caption, order: i })),
          mode: activeMode,
          paste_violation_count: violations,
          ...(submit
            ? {
                status: isLate ? ("late" as const) : ("submitted" as const),
                is_late: isLate,
                submitted_at: new Date().toISOString(),
              }
            : { status: "in_progress" as const }),
        })
        .eq("id", submissionId);
      if (error) throw error;
      for (const [i, b] of blocks.entries()) {
        await supabase
          .from("submission_files")
          .update({ caption: b.caption, page_order: i })
          .eq("id", b.id);
      }
      return submit;
    },
    onSuccess: (submitted) => {
      toast.success(submitted ? "Submitted" : "Draft saved");
      onSaved();
      void qc.invalidateQueries({ queryKey: ["my-submission"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (submission.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  const sub = submission.data?.sub;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Your submission</h2>
        <StatusBadge status={(sub?.is_late ? "late" : (sub?.status ?? "not_started")) as SubmissionStatus} />
      </div>

      {sub?.teacher_feedback && (
        <div className="panel border-info/40 bg-info/5 p-5">
          <h3 className="text-sm font-semibold">Teacher feedback</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{sub.teacher_feedback}</p>
          {sub.improvement_notes && (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">How to improve: </span>
              {sub.improvement_notes}
            </p>
          )}
        </div>
      )}

      {locked ? (
        <div className="panel p-6">
          <p className="text-sm text-muted-foreground">
            Submitted {sub?.submitted_at ? formatDue(sub.submitted_at) : ""}. You can no longer edit
            this submission.
          </p>
          {pages.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {pages.map((p) => (
                <img
                  key={p.id}
                  src={p.url}
                  alt={p.file_name}
                  className="aspect-[3/4] w-full rounded-md border border-border object-cover"
                />
              ))}
            </div>
          )}
          {sub?.typed_content && (
            <p className="mt-4 whitespace-pre-wrap leading-7">{sub.typed_content}</p>
          )}
        </div>
      ) : (
        <Tabs
          value={activeMode}
          onValueChange={(v) => setChoice(v as "handwritten" | "typed")}
        >
          {assignment.submission_type === "either" && (
            <TabsList>
              <TabsTrigger value="handwritten">Handwritten</TabsTrigger>
              <TabsTrigger value="typed">Typed</TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="handwritten" className="mt-5 space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handlePages(e.dataTransfer.files);
              }}
              className="panel flex flex-col items-center gap-3 border-dashed p-10 text-center"
            >
              <FileUp className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag pages here, or take photos of your handwritten work.
              </p>
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 size-4" />
                )}
                Choose files
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => void handlePages(e.target.files)}
              />
            </div>

            {pages.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {pages.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="panel relative overflow-hidden p-0"
                  >
                    <img
                      src={p.url}
                      alt={`Page ${i + 1}`}
                      className="aspect-[3/4] w-full object-cover"
                    />
                    <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                      <span className="text-muted-foreground">Page {i + 1}</span>
                      <button type="button" onClick={() => void removePage(p)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="typed" className="mt-5">
            <TypedEditor
              value={text}
              onChange={setText}
              blocks={blocks}
              onBlocksChange={setBlocks}
              allowImages={assignment.allow_images}
              allowAutocorrect={assignment.allow_autocorrect}
              allowVoice={assignment.allow_voice_typing}
              violations={violations}
              onViolation={(k) => void logViolation(k)}
              onUploadImage={async (file) => {
                try {
                  const r = await uploadFile(file, "inline_image", blocks.length);
                  return { id: r.id, path: r.path, url: r.url, caption: "" };
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Upload failed");
                  return null;
                }
              }}
            />
          </TabsContent>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>
              Save draft
            </Button>
            <Button onClick={() => save.mutate(true)} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Submit assignment
            </Button>
          </div>
        </Tabs>
      )}
    </section>
  );
}
