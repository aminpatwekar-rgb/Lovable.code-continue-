import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["assignment-attachments", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_attachments")
        .select("id,file_name,mime_type,size_bytes,storage_path")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });

  const downloadAttachment = async (file: Attachment) => {
    setDownloadingId(file.id);
    try {
      // Fetch through the authenticated Storage SDK instead of navigating to a
      // signed Supabase URL, which some browsers/extensions block as a new tab.
      const { data, error } = await supabase.storage
        .from("assignment-attachments")
        .download(file.storage_path);
      if (error) throw error;
      if (!data) throw new Error("The file was empty or unavailable.");

      const objectUrl = URL.createObjectURL(data);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.file_name || "assignment-attachment";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Couldn't download this attachment. Please try again.";
      toast.error(message);
    } finally {
      setDownloadingId(null);
    }
  };

  if (q.isLoading) {
    return (
      <div className="panel flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading attachments…
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
        <span>We couldn't load the assignment attachments.</span>
        <Button type="button" variant="outline" size="sm" onClick={() => void q.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const files = q.data ?? [];
  if (!files.length) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Attachments</h2>
      <div className="panel divide-y divide-border">
        {files.map((file) => {
          const isDownloading = downloadingId === file.id;
          return (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 transition-colors hover:bg-muted/40"
            >
              <FileText className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {file.mime_type || "File"}
                  {file.size_bytes ? ` · ${formatSize(file.size_bytes)}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={downloadingId !== null}
                onClick={() => void downloadAttachment(file)}
              >
                {isDownloading ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Download className="mr-1.5 size-4" />
                )}
                {isDownloading ? "Downloading…" : "Download"}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
