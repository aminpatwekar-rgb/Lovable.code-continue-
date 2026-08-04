import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDue } from "@/lib/assignments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  profiles: { full_name: string } | null;
};

export function SubmissionComments({ submissionId }: { submissionId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const q = useQuery({
    queryKey: ["comments", submissionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, body, created_at, author_id, profiles!comments_author_profile_fkey(full_name)")
        .eq("submission_id", submissionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CommentRow[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (!text) throw new Error("Write something first");
      const { error } = await supabase
        .from("comments")
        .insert({ submission_id: submissionId, author_id: user!.id, body: text.slice(0, 2000) });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: ["comments", submissionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["comments", submissionId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="panel space-y-4 p-6">
      <h2 className="text-lg font-semibold">Discussion</h2>

      {q.isLoading ? (
        <Skeleton className="h-20 w-full rounded-lg" />
      ) : q.isError ? (
        <div>
          <p className="text-sm text-muted-foreground">Couldn't load comments.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => void q.refetch()}>
            Try again
          </Button>
        </div>
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-4">
          {(q.data ?? []).map((c) => {
            const name = c.profiles?.full_name?.trim() || "User";
            return (
              <li key={c.id} className="flex gap-3">
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">
                    {name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {name}{" "}
                    <span className="font-normal text-xs text-muted-foreground">
                      {formatDue(c.created_at)}
                    </span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{c.body}</p>
                </div>
                {c.author_id === user?.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete comment"
                    onClick={() => remove.mutate(c.id)}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2">
        <Textarea
          value={body}
          maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          className="min-h-20"
        />
        <Button onClick={() => add.mutate()} disabled={add.isPending || !body.trim()}>
          {add.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          Post comment
        </Button>
      </div>
    </section>
  );
}
