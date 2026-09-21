import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Resource = {
  id: string;
  class_id: string;
  uploader_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  downloadUrl: string;
};

function formatSize(bytes: number | null) {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ClassResources({ classId, canManage }: { classId: string; canManage: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const resources = useQuery({
    queryKey: ["class-resources", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_resources")
        .select("id, class_id, uploader_id, storage_path, file_name, mime_type, size_bytes, created_at")
        .eq("class_id", classId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return Promise.all(
        (data ?? []).map(async (resource) => {
          const { data: signed, error: signedError } = await supabase.storage
            .from("class-resources")
            .createSignedUrl(resource.storage_path, 3600);
          if (signedError) throw signedError;
          return { ...resource, downloadUrl: signed.signedUrl } as Resource;
        }),
      );
    },
  });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      if (!user) throw new Error("Sign in to upload resources");
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const path = `${classId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("class-resources")
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (uploadError) throw uploadError;
        const { error: metadataError } = await supabase.from("class_resources").insert({
          class_id: classId,
          uploader_id: user.id,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        if (metadataError) {
          await supabase.storage.from("class-resources").remove([path]);
          throw metadataError;
        }
      }
    },
    onSuccess: () => {
      toast.success("Resources uploaded");
      if (inputRef.current) inputRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["class-resources", classId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (resource: Resource) => {
      const { error: storageError } = await supabase.storage
        .from("class-resources")
        .remove([resource.storage_path]);
      if (storageError) throw storageError;
      const { error } = await supabase.from("class_resources").delete().eq("id", resource.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resource removed");
      void queryClient.invalidateQueries({ queryKey: ["class-resources", classId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="class-resources" className="text-sm font-medium">
              Add class files
            </label>
            <Input
              ref={inputRef}
              id="class-resources"
              type="file"
              multiple
              disabled={upload.isPending}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) upload.mutate(files);
              }}
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {upload.isPending ? "Uploading…" : "Up to 50 MB each"}
          </div>
        </div>
      )}

      {resources.isLoading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : resources.isError ? (
        <div className="panel p-6 text-sm text-muted-foreground">We couldn't load class resources.</div>
      ) : (resources.data ?? []).length === 0 ? (
        <div className="panel p-6 text-sm text-muted-foreground">No class resources yet.</div>
      ) : (
        <ul className="panel divide-y divide-border">
          {(resources.data ?? []).map((resource) => (
            <li key={resource.id} className="flex flex-wrap items-center gap-3 p-4 transition-all duration-200 ease-out">
              <FileText className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{resource.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {[formatSize(resource.size_bytes), new Date(resource.created_at).toLocaleDateString()]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href={resource.downloadUrl} download={resource.file_name}>
                  <Download className="mr-1.5 size-4" /> Download
                </a>
              </Button>
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${resource.file_name}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(resource)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}