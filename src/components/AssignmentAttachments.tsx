import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Attachment = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
};

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssignmentAttachments({ assignmentId }: { assignmentId: string }) {
  const q = useQuery({
    queryKey: ["assignment-attachments", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_attachments")
        .select("id,file_name,mime_type,size_bytes,storage_path")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      return Promise.all(
        (data ?? []).map(async (file) => {
          const { data: signed } = await supabase.storage
            .from("assignment-attachments")
            .createSignedUrl(file.storage_path, 3600);
          return { ...file, url: signed?.signedUrl ?? "" };
        }),
      );
    },
  });

  if (q.isLoading) {
    return (
      <div className="panel flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading attachments…
      </div>
    );
  }

  const files = q.data ?? [];
  if (!files.length) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Attachments</h2>
      <div className="panel divide-y divide-border">
        {files.map((file) => (
          <a
            key={file.id}
            href={file.url || undefined}
            target="_blank"
            rel="noreferrer"
            download={file.file_name}
            className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/40"
          >
            <FileText className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.file_name}</p>
              <p className="text-xs text-muted-foreground">
                {file.mime_type || "File"}{file.size_bytes ? ` · ${formatSize(file.size_bytes)}` : ""}
              </p>
            </div>
            <Download className="size-4 shrink-0 text-muted-foreground" />
          </a>
        ))}
      </div>
    </section>
  );
}
