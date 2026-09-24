import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Loader2, Megaphone, Paperclip, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string | null;
  audience: string;
  class_id: string | null;
  author_id: string;
  created_at: string;
  profiles: { full_name: string } | null;
  announcement_attachments: Array<{
    id: string;
    storage_path: string;
    file_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    downloadUrl: string;
  }>;
};

const AUDIENCE_LABEL: Record<string, string> = {
  everyone: "Everyone",
  teachers: "Teachers",
  students: "Students",
  class: "This class",
};

export function useAnnouncements(classId?: string) {
  return useQuery({
    queryKey: ["announcements", classId ?? "platform"],
    queryFn: async () => {
      let q = supabase
        .from("announcements")
        .select(
          "id, title, body, audience, class_id, author_id, created_at, profiles!announcements_author_profile_fkey(full_name), announcement_attachments(id, storage_path, file_name, mime_type, size_bytes)",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      q = classId ? q.eq("class_id", classId) : q.is("class_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return Promise.all(
        (data ?? []).map(async (announcement) => {
          const attachments = await Promise.all(
            (announcement.announcement_attachments ?? []).map(async (attachment) => {
              const { data: signed, error: signedError } = await supabase.storage
                .from("announcement-attachments")
                .createSignedUrl(attachment.storage_path, 3600);
              if (signedError) throw signedError;
              return { ...attachment, downloadUrl: signed.signedUrl };
            }),
          );
          return { ...announcement, announcement_attachments: attachments } as unknown as AnnouncementRow;
        }),
      );
    },
  });
}

/**
 * Announcement feed + composer. Platform mode (no classId) is admin-only for
 * posting; class mode lets the owning teacher post to their class.
 */
export function Announcements({
  classId,
  canPost,
  emptyText = "No announcements yet.",
}: {
  classId?: string;
  canPost: boolean;
  emptyText?: string;
}) {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const list = useAnnouncements(classId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState(classId ? "class" : "everyone");
  const [files, setFiles] = useState<File[]>([]);

  const post = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("A title is required");
      if (!user) throw new Error("Sign in to publish an announcement");
      const { data: announcement, error } = await supabase.from("announcements").insert({
        author_id: user.id,
        class_id: classId ?? null,
        audience: classId ? "class" : audience,
        title: title.trim().slice(0, 160),
        body: body.trim() || null,
      }).select("id").single();
      if (error) throw error;
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const path = `${announcement.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("announcement-attachments")
          .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (uploadError) throw uploadError;
        const { error: metadataError } = await supabase.from("announcement_attachments").insert({
          announcement_id: announcement.id,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
        if (metadataError) {
          await supabase.storage.from("announcement-attachments").remove([path]);
          throw metadataError;
        }
      }
    },
    onSuccess: () => {
      toast.success("Announcement published");
      setTitle("");
      setBody("");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      void qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Announcement removed");
      void qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {canPost && (
        <div className="panel space-y-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="ann-title">Title</Label>
            <Input
              id="ann-title"
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Exam timetable is out"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-body">Message</Label>
            <Textarea
              id="ann-body"
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-20"
            />
          </div>
          {!classId && (
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger className="sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  <SelectItem value="teachers">Teachers only</SelectItem>
                  <SelectItem value="students">Students only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ann-files">Attachments</Label>
            <Input
              ref={fileRef}
              id="ann-files"
              type="file"
              multiple
              disabled={post.isPending}
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {files.length} {files.length === 1 ? "file" : "files"} selected
              </p>
            )}
          </div>
          <Button onClick={() => post.mutate()} disabled={post.isPending}>
            {post.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Megaphone className="mr-1.5 size-4" />}
            {post.isPending ? "Publishing…" : "Publish announcement"}
          </Button>
        </div>
      )}

      {list.isLoading ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : list.isError ? (
        <div className="panel p-6">
          <p className="text-sm text-muted-foreground">We couldn't load announcements.</p>
          <Button className="mt-3" variant="outline" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : (list.data ?? []).length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-3">
          {(list.data ?? []).map((a) => (
            <li key={a.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{a.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.profiles?.full_name || "Staff"} ·{" "}
                    {new Date(a.created_at).toLocaleDateString()} ·{" "}
                    {AUDIENCE_LABEL[a.audience] ?? a.audience}
                  </p>
                </div>
                {(a.author_id === user?.id || role === "admin") && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete announcement"
                    onClick={() => remove.mutate(a.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              {a.body && <p className="mt-2 whitespace-pre-wrap text-sm">{a.body}</p>}
              {a.announcement_attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.announcement_attachments.map((attachment) => (
                    <Button key={attachment.id} asChild variant="outline" size="sm">
                      <a href={attachment.downloadUrl} download={attachment.file_name}>
                        <Paperclip className="mr-1.5 size-3.5" />
                        <span className="max-w-48 truncate">{attachment.file_name}</span>
                        <Download className="ml-1.5 size-3.5" />
                      </a>
                    </Button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
