import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Paperclip, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const db = supabase as any;

export type AssignmentDraft = {
  id: string;
  class_id: string;
  title: string;
  subject: string | null;
  instructions: string | null;
  due_date: string | null;
  max_marks: number;
  priority: string;
  submission_type: string;
  allow_images: boolean;
  allow_autocorrect: boolean;
  allow_voice_typing: boolean;
  published: boolean;
  rubric_id?: string | null;
};

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AssignmentDialog({
  open,
  onOpenChange,
  classId,
  teacherId,
  assignment,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classId: string;
  teacherId: string;
  assignment?: AssignmentDraft | null;
  onSaved?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const editing = Boolean(assignment);

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [instructions, setInstructions] = useState("");
  const [due, setDue] = useState("");
  const [maxMarks, setMaxMarks] = useState("100");
  const [priority, setPriority] = useState("normal");
  const [type, setType] = useState<"handwritten" | "typed" | "either">("handwritten");
  const [allowImages, setAllowImages] = useState(true);
  const [allowAutocorrect, setAllowAutocorrect] = useState(false);
  const [allowVoice, setAllowVoice] = useState(false);
  const [rubricId, setRubricId] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Array<{ id: string; file_name: string; size_bytes: number | null; storage_path: string }>>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);

  // Callers pass a freshly built object literal on every render, so this effect
  // must key off the dialog opening and the assignment id only — depending on the
  // object itself re-ran it mid-edit and wiped fields such as the due date.
  const latest = useRef(assignment);
  latest.current = assignment;
  const assignmentId = assignment?.id ?? null;

  const rubrics = useQuery({
    queryKey: ["rubrics", teacherId],
    enabled: Boolean(open && teacherId),
    queryFn: async () => {
      const q = await (supabase as any).from("rubrics").select("id,title").eq("owner_id", teacherId).order("title");
      if (q.error) throw q.error;
      return q.data ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    const a = latest.current;
    setTitle(a?.title ?? "");
    setSubject(a?.subject ?? "");
    setInstructions(a?.instructions ?? "");
    setDue(toLocalInput(a?.due_date ?? null));
    setMaxMarks(String(a?.max_marks ?? 100));
    setPriority(a?.priority ?? "normal");
    setType((a?.submission_type as typeof type) ?? "handwritten");
    setAllowImages(a?.allow_images ?? true);
    setAllowAutocorrect(a?.allow_autocorrect ?? false);
    setAllowVoice(a?.allow_voice_typing ?? false);
    setRubricId(a?.rubric_id ?? "");
    setAttachmentFiles([]);
    if (a?.id) { void (async () => { const { data } = await db.from("assignment_attachments").select("id,file_name,size_bytes,storage_path").eq("assignment_id", a.id).order("created_at", { ascending: true }); setExistingAttachments(data ?? []); })(); } else setExistingAttachments([]);
  }, [open, assignmentId]);

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      if (!title.trim()) throw new Error("Title is required");
      if (!editing && !rubricId) throw new Error("A rubric is required when creating an assignment");
      const marks = Number(maxMarks);
      if (!Number.isFinite(marks) || marks <= 0 || marks > 1000)
        throw new Error("Max marks must be between 1 and 1000");
      const payload = {
        title: title.trim().slice(0, 160),
        subject: subject.trim() || null,
        instructions: instructions.trim() || null,
        due_date: due ? new Date(due).toISOString() : null,
        max_marks: marks,
        priority,
        submission_type: type,
        allow_images: allowImages,
        allow_autocorrect: allowAutocorrect,
        allow_voice_typing: allowVoice,
        rubric_id: rubricId || null,
        published: publish,
      };
      let id: string;
      if (assignment) {
        const { error } = await db.from("assignments").update(payload).eq("id", assignment.id);
        if (error) throw error;
        id = assignment.id;
      } else {
        const { data, error } = await db.from("assignments").insert({ ...payload, class_id: classId, teacher_id: teacherId }).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      if (attachmentFiles.length) {
        setUploadingAttachments(true);
        try {
          const allowed = new Set(["application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","image/jpeg","image/png","application/zip"]);
          for (const file of attachmentFiles) {
            if (!allowed.has(file.type)) throw new Error(`Unsupported file type: ${file.name}`);
            if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is larger than 25MB`);
            const quota = await db.rpc("assert_storage_available", { _additional_bytes: file.size });
            if (quota.error) throw quota.error;
            const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
            const path = `${id}/${crypto.randomUUID()}.${ext}`;
            const { data: row, error: rowError } = await db.from("assignment_attachments").insert({ assignment_id: id, storage_path: path, file_name: file.name.slice(0, 160), mime_type: file.type || "application/octet-stream", size_bytes: file.size }).select("id").single();
            if (rowError) throw rowError;
            const { error: uploadError } = await supabase.storage.from("assignment-attachments").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
            if (uploadError) { await db.from("assignment_attachments").delete().eq("id", row.id); throw uploadError; }
          }
        } finally { setUploadingAttachments(false); }
      }
      return id;
    },
    onSuccess: (id) => {
      toast.success(editing ? "Assignment updated" : "Assignment created");
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: ["class-assignments"] });
      void qc.invalidateQueries({ queryKey: ["assignment"] });
      void qc.invalidateQueries({ queryKey: ["all-assignments"] });
      void qc.invalidateQueries({ queryKey: ["teacher-dash"] });
      onSaved?.(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit assignment" : "New assignment"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="a-title">Title</Label>
            <Input
              id="a-title"
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Chapter 4 problem set"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-subject">Subject</Label>
              <Input
                id="a-subject"
                maxLength={60}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-marks">Max marks</Label>
              <Input
                id="a-marks"
                type="number"
                min={1}
                max={1000}
                value={maxMarks}
                onChange={(e) => setMaxMarks(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-due">Due date</Label>
              <Input
                id="a-due"
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Submission type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="handwritten">Handwritten (photo upload)</SelectItem>
                <SelectItem value="typed">Typed (paste protected)</SelectItem>
                <SelectItem value="either">Student's choice</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Rubric</Label>
            <Select value={rubricId || "none"} onValueChange={(v) => setRubricId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="No rubric" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No rubric</SelectItem>
                {(rubrics.data ?? []).map((r: { id: string; title: string }) => (
                  <SelectItem value={r.id} key={r.id}>{r.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Reuse a saved rubric during grading.
            </p>
          </div>
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div><Label>Attachments</Label><p className="text-xs text-muted-foreground">PDF, Word, PowerPoint, Excel, images or ZIP · max 25MB each</p></div>
              <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("assignment-attachments-input")?.click()} disabled={uploadingAttachments}><Paperclip className="mr-1.5 size-4" /> Add files</Button>
              <input id="assignment-attachments-input" type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.zip" className="hidden" onChange={(e) => setAttachmentFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])} />
            </div>
            {(existingAttachments.length > 0 || attachmentFiles.length > 0) && <div className="space-y-1.5">
              {existingAttachments.map((file) => <div key={file.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-2 text-sm"><Paperclip className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{file.file_name}</span><button type="button" className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${file.file_name}`} onClick={async () => { const { error } = await db.from("assignment_attachments").delete().eq("id", file.id); if (!error) { await supabase.storage.from("assignment-attachments").remove([file.storage_path]); setExistingAttachments((prev) => prev.filter((x) => x.id !== file.id)); } else toast.error(error.message); }}><X className="size-4" /></button></div>)}
              {attachmentFiles.map((file, index) => <div key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-2 text-sm"><Paperclip className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-xs text-muted-foreground">{Math.max(1, Math.round(file.size / 1024))} KB</span><button type="button" className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${file.name}`} onClick={() => setAttachmentFiles((prev) => prev.filter((_, i) => i !== index))}><X className="size-4" /></button></div>)}
            </div>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-inst">Instructions</Label>
            <Textarea
              id="a-inst"
              maxLength={4000}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="min-h-28"
            />
          </div>
          <div className="space-y-3 rounded-lg border border-border p-3">
            {(
              [
                ["Allow images in typed answers", allowImages, setAllowImages],
                ["Allow autocorrect / spellcheck", allowAutocorrect, setAllowAutocorrect],
                ["Allow voice typing", allowVoice, setAllowVoice],
              ] as const
            ).map(([label, val, set]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <span className="text-sm">{label}</span>
                <Switch checked={val} onCheckedChange={set} />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending || uploadingAttachments}>
            {save.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {editing ? "Save as draft" : "Save draft"}
          </Button>
          <Button onClick={() => save.mutate(true)} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {editing ? "Save & publish" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
