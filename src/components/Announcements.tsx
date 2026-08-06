import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Megaphone, Trash2 } from "lucide-react";
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
          "id, title, body, audience, class_id, author_id, created_at, profiles!announcements_author_profile_fkey(full_name)",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      q = classId ? q.eq("class_id", classId) : q.is("class_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AnnouncementRow[];
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
  const list = useAnnouncements(classId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState(classId ? "class" : "everyone");

  const post = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("A title is required");
      const { error } = await supabase.from("announcements").insert({
        author_id: user!.id,
        class_id: classId ?? null,
        audience: classId ? "class" : audience,
        title: title.trim().slice(0, 160),
        body: body.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Announcement published");
      setTitle("");
      setBody("");
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
          <Button onClick={() => post.mutate()} disabled={post.isPending}>
            <Megaphone className="mr-1.5 size-4" /> Publish announcement
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
