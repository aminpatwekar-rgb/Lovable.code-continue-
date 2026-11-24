import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, HardDrive, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type ManagedFile = {
  id: string;
  file_name: string;
  size_bytes: number | null;
  storage_path: string;
  bucket: string;
  table: "class_resources" | "announcement_attachments" | "assignment_attachments" | "submission_files";
  category: string;
  created_at: string;
  shared: boolean;
};

function formatBytes(value: number | null) {
  const bytes = Number(value ?? 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function StorageManagementCard() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const files = useQuery({
    queryKey: ["storage-management", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ManagedFile[]> => {
      if (!user) return [];
      const db = supabase as any;
      const [resources, announcements, drafts, draftFiles] = await Promise.all([
        db.from("class_resources")
          .select("id,file_name,size_bytes,storage_path,created_at")
          .eq("uploader_id", user.id)
          .order("created_at", { ascending: false }),
        db.from("announcement_attachments")
          .select("id,file_name,size_bytes,storage_path,created_at,announcements!inner(author_id)")
          .eq("announcements.author_id", user.id)
          .order("created_at", { ascending: false }),
        db.from("assignments")
          .select("id,title")
          .eq("teacher_id", user.id)
          .eq("published", false),
        db.from("submission_files")
          .select("id,file_name,size_bytes,storage_path,created_at,submissions!inner(id,student_id,status,submitted_at)")
          .eq("submissions.student_id", user.id)
          .eq("submissions.status", "in_progress")
          .is("submissions.submitted_at", null)
          .order("created_at", { ascending: false }),
      ]);
      for (const result of [resources, announcements, drafts, draftFiles]) {
        if (result.error) throw result.error;
      }

      const draftIds = (drafts.data ?? []).map((item: any) => item.id);
      let draftAttachments: any[] = [];
      if (draftIds.length) {
        const [attachments, submissions] = await Promise.all([
          db.from("assignment_attachments")
            .select("id,file_name,size_bytes,storage_path,created_at,assignment_id")
            .in("assignment_id", draftIds)
            .order("created_at", { ascending: false }),
          db.from("submissions").select("assignment_id").in("assignment_id", draftIds),
        ]);
        if (attachments.error) throw attachments.error;
        if (submissions.error) throw submissions.error;
        const assignmentsWithSubmissions = new Set((submissions.data ?? []).map((row: any) => row.assignment_id));
        draftAttachments = (attachments.data ?? []).filter((row: any) => !assignmentsWithSubmissions.has(row.assignment_id));
      }

      return [
        ...(resources.data ?? []).map((row: any) => ({ ...row, bucket: "class-resources", table: "class_resources", category: "Class resource", shared: true })),
        ...(announcements.data ?? []).map((row: any) => ({ ...row, bucket: "announcement-attachments", table: "announcement_attachments", category: "Announcement attachment", shared: true })),
        ...draftAttachments.map((row: any) => ({ ...row, bucket: "assignment-attachments", table: "assignment_attachments", category: "Unpublished assignment attachment", shared: false })),
        ...(draftFiles.data ?? []).map((row: any) => ({ ...row, bucket: "submissions", table: "submission_files", category: "Your unsubmitted work", shared: false })),
      ] as ManagedFile[];
    },
  });

  const remove = useMutation({
    mutationFn: async (file: ManagedFile) => {
      const { error: storageError } = await supabase.storage.from(file.bucket).remove([file.storage_path]);
      if (storageError) throw storageError;
      const { error: rowError } = await (supabase as any).from(file.table).delete().eq("id", file.id);
      if (rowError) throw rowError;
    },
    onSuccess: () => {
      toast.success("File deleted and storage space reclaimed");
      void qc.invalidateQueries({ queryKey: ["storage-management", user?.id] });
      void qc.invalidateQueries({ queryKey: ["plan-summary"] });
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't delete this file."),
  });

  const confirmDelete = (file: ManagedFile) => {
    const impact = file.shared
      ? " This file is shared with your class or announcement audience, so they will no longer be able to access it."
      : "";
    if (window.confirm(`Permanently delete “${file.file_name}”? This cannot be undone.${impact}`)) {
      remove.mutate(file);
    }
  };

  const total = (files.data ?? []).reduce((sum, file) => sum + Number(file.size_bytes ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><HardDrive className="size-5 text-primary" />Storage Management</CardTitle>
        <CardDescription>
          Delete files you uploaded to free cloud storage. Shared files are clearly identified before deletion.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {files.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Finding files you can remove…</div>
        ) : files.isError ? (
          <p className="text-sm text-destructive">We couldn't load your files. Please try again.</p>
        ) : (files.data ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No files are currently eligible for deletion. Submitted work and files attached to published assignments are protected.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{files.data.length} files · {formatBytes(total)} eligible to reclaim</p>
            <ul className="divide-y divide-border rounded-lg border">
              {files.data.map((file) => (
                <li key={`${file.table}:${file.id}`} className="flex items-center gap-3 p-3">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.file_name}</p>
                    <p className="text-xs text-muted-foreground">{file.category} · {formatBytes(file.size_bytes)}{file.shared ? " · Shared" : ""}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${file.file_name}`} disabled={remove.isPending} onClick={() => confirmDelete(file)}>
                    {remove.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-xs text-muted-foreground">Submitted assignments and attachments on published assignments are kept intact. Storage usage refreshes after a successful deletion.</p>
      </CardContent>
    </Card>
  );
}
