import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type Post = {
  id: string;
  body: string;
  author_id: string;
  parent_id: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
};

/** Class discussion board with one level of threaded replies. */
export function ClassDiscussion({ classId, canModerate }: { classId: string; canModerate: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const posts = useQuery({
    queryKey: ["class-discussion", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_discussions")
        .select(
          "id, body, author_id, parent_id, created_at, profiles!class_discussions_author_profile_fkey(full_name)",
        )
        .eq("class_id", classId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Post[];
    },
  });

  const add = useMutation({
    mutationFn: async ({ text, parent }: { text: string; parent: string | null }) => {
      const trimmed = text.trim();
      if (!trimmed) throw new Error("Write something first");
      const { error } = await supabase.from("class_discussions").insert({
        class_id: classId,
        author_id: user!.id,
        parent_id: parent,
        body: trimmed.slice(0, 2000),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      setReplyBody("");
      setReplyTo(null);
      void qc.invalidateQueries({ queryKey: ["class-discussion", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("class_discussions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["class-discussion", classId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const all = posts.data ?? [];
  const roots = all.filter((p) => !p.parent_id);

  function Row({ p, nested = false }: { p: Post; nested?: boolean }) {
    const name = p.profiles?.full_name?.trim() || "Member";
    return (
      <div className={nested ? "ml-11 mt-3 border-l border-border pl-4" : ""}>
        <div className="flex items-start gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {name}{" "}
              <span className="font-normal text-xs text-muted-foreground">
                {new Date(p.created_at).toLocaleString()}
              </span>
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{p.body}</p>
            {!nested && (
              <button
                type="button"
                className="mt-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setReplyTo(replyTo === p.id ? null : p.id)}
              >
                Reply
              </button>
            )}
          </div>
          {(p.author_id === user?.id || canModerate) && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete message"
              onClick={() => remove.mutate(p.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-4">
        <Textarea
          value={body}
          maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Start a discussion with your class…"
          className="min-h-20"
          aria-label="New discussion message"
        />
        <Button
          onClick={() => add.mutate({ text: body, parent: null })}
          disabled={add.isPending || !body.trim()}
        >
          <Send className="mr-1.5 size-4" /> Post
        </Button>
      </div>

      {posts.isLoading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : roots.length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">
          No discussion yet. Be the first to post.
        </p>
      ) : (
        <ul className="space-y-3">
          {roots.map((p) => (
            <li key={p.id} className="panel p-4">
              <Row p={p} />
              {all
                .filter((r) => r.parent_id === p.id)
                .map((r) => (
                  <Row key={r.id} p={r} nested />
                ))}
              {replyTo === p.id && (
                <div className="ml-11 mt-3 space-y-2 border-l border-border pl-4">
                  <Textarea
                    value={replyBody}
                    maxLength={2000}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Write a reply…"
                    className="min-h-16"
                    aria-label="Reply message"
                  />
                  <Button
                    size="sm"
                    onClick={() => add.mutate({ text: replyBody, parent: p.id })}
                    disabled={add.isPending || !replyBody.trim()}
                  >
                    Reply
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
