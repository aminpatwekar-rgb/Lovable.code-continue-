import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Download, FileText, FileUp, Loader2, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { daysLate, formatDue, type SubmissionStatus } from "@/lib/assignments";
import { SPRING_PRESS, getPressProps } from "@/lib/motionPresets";
import { StatusBadge } from "@/components/StatusBadge";
import { AssignmentAttachments } from "@/components/AssignmentAttachments";
import { TypedEditor, type ImageBlock } from "@/components/TypedEditor";
import { RenderMathText } from "@/components/math/RenderMathText";
import { AssignmentActions, type AssignmentRow } from "@/components/AssignmentActions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { downloadCsv, toCsv } from "@/lib/csv";
import { Pagination } from "@/components/Pagination";

export const Route = createFileRoute("/_authenticated/assignments/$assignmentId")({
  head: () => ({
    meta: [
      { title: "Assignment — ONYX" },
      { name: "description", content: "Assignment details, instructions and submission." },
      { property: "og:title", content: "Assignment — ONYX" },
      { property: "og:description", content: "View instructions and submit your work." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AssignmentPage,
});

type Page = {
  id: string;
  storage_path: string;
  file_name: string;
  url: string;
  page_order: number;
};

type SubmissionAttachment = {
  id: string;
  storage_path: string;
  file_name: string;
  url: string;
  mime_type: string | null;
  size_bytes: number | null;
};

function AssignmentPage() {
  const { assignmentId } = Route.useParams();
  const { user, role } = useAuth();
  const { effectiveRole } = useViewRole();
  const qc = useQueryClient();
  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";
  const submissionsRef = useRef<HTMLDivElement>(null);

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
  if (assignment.isError)
    return (
      <div className="panel p-6">
        <p className="text-sm text-muted-foreground">We couldn't load this assignment.</p>
        <Button className="mt-3" variant="outline" onClick={() => void assignment.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (!assignment.data) return <p className="text-muted-foreground">Assignment not found.</p>;

  const a = assignment.data;
  const late = daysLate(a.due_date);

  if (!isTeacher && (!a.published || a.archived))
    return (
      <div className="panel p-6">
        <p className="text-sm text-muted-foreground">
          This assignment isn't available right now. Your teacher may have unpublished or archived
          it.
        </p>
        <Button asChild className="mt-3" variant="outline">
          <Link to="/assignments" search={{ tab: "upcoming" }}>
            Back to assignments
          </Link>
        </Button>
      </div>
    );

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
          {a.archived && (
            <span className="rounded-full border border-border px-2 py-0.5">Archived</span>
          )}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-semibold">{a.title}</h1>
          {isTeacher && user && (
            <AssignmentActions
              assignment={a as unknown as AssignmentRow}
              teacherId={user.id}
              onViewSubmissions={() =>
                submissionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            />
          )}
        </div>
        <p className="text-muted-foreground">
          Due {formatDue(a.due_date)} · {a.max_marks} marks
          {late > 0 && (
            <span className="ml-2 font-medium text-destructive">
              Overdue by {late} day{late === 1 ? "" : "s"}
            </span>
          )}
        </p>
      </header>

      <AssignmentAttachments assignmentId={a.id} />

      {a.instructions && (
        <section className="panel p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">Instructions</h2>
          <p className="mt-2 whitespace-pre-wrap leading-7">{a.instructions}</p>
        </section>
      )}

      {isTeacher ? (
        <div ref={submissionsRef}>
          <TeacherView assignmentId={assignmentId} maxMarks={a.max_marks} />
        </div>
      ) : (
        <StudentSubmission
          assignment={{
            id: a.id,
            due_date: a.due_date,
            submission_type: a.submission_type,
            max_marks: a.max_marks,

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
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const subs = useQuery({
    queryKey: ["assignment-subs", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select(
          "id, status, is_late, marks_awarded, submitted_at, paste_violation_count, student_id, profiles!submissions_student_profile_fkey(full_name)",
        )
        .eq("assignment_id", assignmentId)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (subs.isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;

  const rows = subs.data ?? [];
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);

  const exportGrades = () => {
    const csv = toCsv(
      ["Student", "Submission status", "Submitted at", "Late", "Marks", "Max marks", "Paste flags"],
      rows.map((s) => {
        const p = s.profiles as unknown as { full_name: string } | null;
        return [
          p?.full_name ?? "Student",
          s.status,
          s.submitted_at ?? "",
          s.is_late ? "Yes" : "No",
          s.marks_awarded ?? "",
          maxMarks,
          s.paste_violation_count ?? 0,
        ];
      }),
    );
    downloadCsv(`onyx-${assignmentId}-grades.csv`, csv);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Submissions ({rows.length})</h2>
        <Button variant="outline" onClick={exportGrades} disabled={rows.length === 0}>
          <Download className="mr-1.5 size-4" /> Export grades CSV
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">Nothing submitted yet.</p>
      ) : (
        <>
          <ul className="panel divide-y divide-border">
            {visible.map((s) => {
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
                        {s.paste_violation_count > 0 && ` · ${s.paste_violation_count} paste flags`}
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
          <Pagination
            page={page}
            pageCount={pageCount}
            onPageChange={setPage}
            label={`${rows.length} submissions`}
          />
        </>
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
    max_marks: number;

    allow_images: boolean;
    allow_autocorrect: boolean;
    allow_voice_typing: boolean;
  };
  userId: string;
  onSaved: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [blocks, setBlocks] = useState<ImageBlock[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [attachments, setAttachments] = useState<SubmissionAttachment[]>([]);
  const [violations, setViolations] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const attachmentRef = useRef<HTMLInputElement>(null);
  const lastSavedSnapshot = useRef<string | null>(null);
  const latestAutosaveSnapshot = useRef("");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosavePromise = useRef<Promise<void> | null>(null);
  const submissionIdRef = useRef<string | null>(null);
  const ensureSubmissionPromise = useRef<Promise<string> | null>(null);

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
        .select("id, storage_path, file_name, page_order, kind, caption, mime_type, size_bytes")
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

  const mode: "handwritten" | "typed" =
    assignment.submission_type === "typed"
      ? "typed"
      : assignment.submission_type === "handwritten"
        ? "handwritten"
        : ((submission.data?.sub.mode as "handwritten" | "typed") ?? "handwritten");

  const [choice, setChoice] = useState<"handwritten" | "typed">(mode);

  useEffect(() => {
    if (hydrated || submission.isLoading || submission.isError) return;
    if (!submission.data) {
      lastSavedSnapshot.current = JSON.stringify([mode, ""]);
      setHydrated(true);
      return;
    }
    const { sub, files } = submission.data;
    setText(sub.typed_content ?? "");
    lastSavedSnapshot.current = JSON.stringify([sub.mode ?? mode, sub.typed_content ?? ""]);
    setChoice(sub.mode === "typed" ? "typed" : "handwritten");
    setViolations(sub.paste_violation_count ?? 0);
    setBlocks(
      files
        .filter((f) => f.kind === "inline_image")
        .map((f) => ({ id: f.id, path: f.storage_path, url: f.url, caption: f.caption ?? "" })),
    );
    setPages(files.filter((f) => f.kind === "page") as Page[]);
    setAttachments(
      files
        .filter((f) => f.kind === "attachment")
        .map((f) => ({
          id: f.id,
          storage_path: f.storage_path,
          file_name: f.file_name,
          url: f.url,
          mime_type: f.mime_type ?? null,
          size_bytes: f.size_bytes ?? null,
        })),
    );
    setHydrated(true);
  }, [submission.data, submission.isLoading, submission.isError, hydrated, mode]);

  const locked = ["submitted", "reviewed", "completed", "late"].includes(
    submission.data?.sub.status ?? "",
  );

  const activeMode = assignment.submission_type === "either" ? choice : mode;
  const draftSnapshot = JSON.stringify([activeMode, text]);
  latestAutosaveSnapshot.current = draftSnapshot;
  const existingSubmissionId = submission.data?.sub?.id ?? null;

  const ensureSubmission = useCallback(async () => {
    if (submissionIdRef.current) return submissionIdRef.current;
    if (existingSubmissionId) {
      submissionIdRef.current = existingSubmissionId;
      return existingSubmissionId;
    }
    if (ensureSubmissionPromise.current) return ensureSubmissionPromise.current;

    const createPromise = (async () => {
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
      submissionIdRef.current = data.id;
      await qc.invalidateQueries({ queryKey: ["my-submission", assignment.id, userId] });
      return data.id;
    })();

    ensureSubmissionPromise.current = createPromise;
    try {
      return await createPromise;
    } finally {
      if (ensureSubmissionPromise.current === createPromise) ensureSubmissionPromise.current = null;
    }
  }, [activeMode, assignment.id, existingSubmissionId, qc, userId]);

  useEffect(() => {
    if (!hydrated || submission.isLoading || submission.isError || locked || activeMode !== "typed") return;
    if (draftSnapshot === lastSavedSnapshot.current) return;
    if (!text.trim() && !existingSubmissionId && !submissionIdRef.current) {
      setDraftSaveState("idle");
      return;
    }

    setDraftSaveState("pending");
    const snapshot = draftSnapshot;
    const textToSave = text;
    const modeToSave = activeMode;
    const timer = setTimeout(() => {
      if (autosaveTimer.current === timer) autosaveTimer.current = null;
      const job = (async () => {
        const inFlight = autosavePromise.current;
        if (inFlight) await inFlight.catch(() => undefined);
        if (
          latestAutosaveSnapshot.current !== snapshot ||
          lastSavedSnapshot.current === snapshot
        ) return;

        setDraftSaveState("saving");
        try {
          const submissionId = await ensureSubmission();
          if (latestAutosaveSnapshot.current !== snapshot) return;
          const { error } = await supabase
            .from("submissions")
            .update({ typed_content: textToSave, mode: modeToSave })
            .eq("id", submissionId);
          if (error) throw error;
          if (latestAutosaveSnapshot.current === snapshot) {
            lastSavedSnapshot.current = snapshot;
            setDraftSaveState("saved");
            setLastSavedAt(new Date());
            void qc.invalidateQueries({ queryKey: ["my-submission", assignment.id, userId] });
          }
        } catch {
          if (latestAutosaveSnapshot.current === snapshot) setDraftSaveState("error");
        }
      })();
      autosavePromise.current = job;
      void job.finally(() => {
        if (autosavePromise.current === job) autosavePromise.current = null;
      });
    }, 1000);
    autosaveTimer.current = timer;

    return () => {
      clearTimeout(timer);
      if (autosaveTimer.current === timer) autosaveTimer.current = null;
    };
  }, [
    activeMode,
    assignment.id,
    draftSnapshot,
    ensureSubmission,
    existingSubmissionId,
    hydrated,
    locked,
    qc,
    submission.isError,
    submission.isLoading,
    text,
    userId,
  ]);

  async function uploadFile(file: File, kind: "page" | "inline_image" | "attachment", order: number) {
    const quota = await (supabase as any).rpc("assert_storage_available", {
      _additional_bytes: file.size,
    });
    if (quota.error) throw quota.error;
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
    const { data: signed } = await supabase.storage.from("submissions").createSignedUrl(path, 3600);
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

  function isAllowedAttachment(file: File) {
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    return (
      file.type.startsWith("image/") ||
      ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "csv"].includes(extension)
    );
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleAttachments(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: SubmissionAttachment[] = [];
      let order = pages.length + attachments.length;
      for (const file of Array.from(files)) {
        if (!isAllowedAttachment(file)) {
          toast.error(`${file.name} is not a supported file type`);
          continue;
        }
        if (file.size > 15 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 15MB`);
          continue;
        }
        const r = await uploadFile(file, "attachment", order);
        added.push({
          id: r.id,
          storage_path: r.path,
          file_name: r.file_name,
          url: r.url,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        order += 1;
      }
      setAttachments((prev) => [...prev, ...added]);
      if (added.length) toast.success(`${added.length} file(s) attached`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "File upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(file: SubmissionAttachment) {
    await supabase.from("submission_files").delete().eq("id", file.id);
    await supabase.storage.from("submissions").remove([file.storage_path]);
    setAttachments((prev) => prev.filter((x) => x.id !== file.id));
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
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
      if (autosavePromise.current) await autosavePromise.current.catch(() => undefined);
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
      lastSavedSnapshot.current = JSON.stringify([activeMode, text]);
      setDraftSaveState("saved");
      setLastSavedAt(new Date());
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
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Your submission</h2>
          {!locked && activeMode === "typed" && hydrated && (
            <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
              {draftSaveState === "pending"
                ? "Unsaved changes"
                : draftSaveState === "saving"
                  ? "Saving draft…"
                  : draftSaveState === "saved"
                    ? `Draft saved${lastSavedAt ? ` at ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`
                    : draftSaveState === "error"
                      ? "Autosave failed — use Save draft to retry"
                      : "Draft saves automatically"}
            </p>
          )}
        </div>
        <StatusBadge
          status={(sub?.is_late ? "late" : (sub?.status ?? "not_started")) as SubmissionStatus}
        />
      </div>

      {sub?.grade_released && (sub.marks_awarded !== null || sub.teacher_feedback) && (
        <div className="panel border-info/40 bg-info/5 p-5">
          <h3 className="text-sm font-semibold">Your grade</h3>
          {sub.marks_awarded !== null && (
            <p className="mt-1 text-3xl font-semibold">
              {sub.marks_awarded}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {assignment.max_marks}
              </span>
            </p>
          )}
          {sub.teacher_feedback && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{sub.teacher_feedback}</p>
          )}
          {sub.improvement_notes && (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">How to improve: </span>
              {sub.improvement_notes}
            </p>
          )}
        </div>
      )}
      {sub?.reviewed_at && !sub.grade_released && (
        <p className="panel p-4 text-sm text-muted-foreground">
          Your teacher hasn&apos;t released your grade yet.
        </p>
      )}
      {sub?.status === "returned" && (
        <p className="panel border-warning/40 bg-warning/5 p-4 text-sm">
          Your teacher returned this submission for changes. Update your work, then submit it again when ready.
        </p>
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
          {sub?.typed_content && <RenderMathText text={sub.typed_content} className="mt-4" />}
          {attachments.length > 0 && (
            <div className="mt-5 space-y-2">
              <p className="text-sm font-medium">Attached files</p>
              <div className="divide-y divide-border rounded-lg border border-border">
                {attachments.map((file) => (
                  <a
                    key={file.id}
                    href={file.url || undefined}
                    target="_blank"
                    rel="noreferrer"
                    download={file.file_name}
                    className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/40"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{file.file_name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatFileSize(file.size_bytes)}
                    </span>
                    <Download className="size-4 shrink-0 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <Tabs value={activeMode} onValueChange={(v) => setChoice(v as "handwritten" | "typed")}>
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
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
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
                      <motion.button
                        type="button"
                        {...getPressProps(shouldReduceMotion, { hoverScale: 1.15, tapScale: 0.9 })}
                        onClick={() => void removePage(p)}
                        className="cursor-pointer"
                        aria-label="Remove page"
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </motion.button>
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

          <section
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void handleAttachments(e.dataTransfer.files);
            }}
            className="panel border-dashed p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Additional files</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Attach PDFs, Word, PowerPoint, Excel, text, CSV, or image files to this submission.
                  Maximum 15MB per file.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => attachmentRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 size-4" />
                )}
                Upload files
              </Button>
              <input
                ref={attachmentRef}
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,image/*"
                multiple
                className="hidden"
                onChange={(e) => void handleAttachments(e.target.files)}
              />
            </div>

            {attachments.length > 0 && (
              <div className="mt-4 divide-y divide-border rounded-lg border border-border">
                {attachments.map((file) => (
                  <div key={file.id} className="flex items-center gap-3 p-3">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.mime_type || "File"}
                        {file.size_bytes ? ` · ${formatFileSize(file.size_bytes)}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void removeAttachment(file)}
                      aria-label={`Remove ${file.file_name}`}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => save.mutate(false)}
              disabled={save.isPending || uploading}
            >
              Save draft
            </Button>
            <Button
              onClick={() => {
                if (activeMode === "handwritten" && pages.length === 0) {
                  toast.error("Upload at least one page before submitting");
                  return;
                }
                if (activeMode === "typed" && text.trim().length < 10) {
                  toast.error("Write at least 10 characters before submitting");
                  return;
                }
                setConfirmSubmitOpen(true);
              }}
              disabled={save.isPending || uploading}
            >
              {save.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Submit assignment
            </Button>
          </div>
          <AlertDialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Submit this assignment?</AlertDialogTitle>
                <AlertDialogDescription>
                  Check your answer and attached files before continuing. After submission, you cannot edit your work unless your teacher returns it for changes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Continue editing</AlertDialogCancel>
                <AlertDialogAction onClick={() => save.mutate(true)} disabled={save.isPending}>
                  Submit final answer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Tabs>
      )}
    </section>
  );
}
