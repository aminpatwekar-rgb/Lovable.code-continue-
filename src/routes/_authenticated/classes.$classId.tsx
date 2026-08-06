import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, Link2, Plus, Settings, UserMinus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AssignmentDialog } from "@/components/AssignmentDialog";
import { AssignmentActions, type AssignmentRow } from "@/components/AssignmentActions";
import { DueDateChip } from "@/components/DueDateChip";
import { Announcements } from "@/components/Announcements";
import { ClassDiscussion } from "@/components/ClassDiscussion";
import { ClassSettingsDialog, type ClassRecord } from "@/components/ClassSettingsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/classes/$classId")({
  head: () => ({
    meta: [
      { title: "Class — ONYX" },
      { name: "description", content: "Class roster, assignments and join code." },
      { property: "og:title", content: "Class — ONYX" },
      { property: "og:description", content: "Class roster and assignments." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClassDetail,
});

type Member = {
  id: string;
  joined_at: string;
  student_id: string;
  profiles: { full_name: string; email: string | null } | null;
};

function ClassDetail() {
  const { classId } = Route.useParams();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isTeacher = role === "teacher" || role === "admin";
  const [open, setOpen] = useState(false);

  const klass = useQuery({
    queryKey: ["class", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject, section, description, join_code, teacher_id")
        .eq("id", classId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const roster = useQuery({
    queryKey: ["roster", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_members")
        .select(
          "id, joined_at, student_id, profiles!class_members_student_profile_fkey(full_name, email)",
        )
        .eq("class_id", classId)
        .order("joined_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Member[];
    },
  });

  const assignments = useQuery({
    queryKey: ["class-assignments", classId, isTeacher],
    queryFn: async () => {
      let q = supabase
        .from("assignments")
        .select("*")
        .eq("class_id", classId)
        .order("due_date", { ascending: true });
      if (!isTeacher) q = q.eq("published", true).eq("archived", false);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AssignmentRow[];
    },
  });

  // Per-student submission progress, always derived from the database.
  const progress = useQuery({
    enabled: isTeacher && (assignments.data ?? []).length > 0,
    queryKey: ["class-progress", classId, (assignments.data ?? []).length],
    queryFn: async () => {
      const ids = (assignments.data ?? []).filter((a) => !a.archived).map((a) => a.id);
      if (!ids.length) return { total: 0, byStudent: new Map<string, number>() };
      const { data } = await supabase
        .from("submissions")
        .select("student_id, status")
        .in("assignment_id", ids);
      const byStudent = new Map<string, number>();
      for (const s of data ?? []) {
        if (["submitted", "late", "reviewed", "completed"].includes(s.status))
          byStudent.set(s.student_id, (byStudent.get(s.student_id) ?? 0) + 1);
      }
      return { total: ids.length, byStudent };
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("class_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student removed");
      void qc.invalidateQueries({ queryKey: ["roster", classId] });
      void qc.invalidateQueries({ queryKey: ["teacher-dash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (klass.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (klass.isError)
    return (
      <div className="panel p-6">
        <p className="text-sm text-muted-foreground">We couldn't load this class.</p>
        <Button className="mt-3" variant="outline" onClick={() => void klass.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (!klass.data) return <p className="text-muted-foreground">Class not found.</p>;

  const all = assignments.data ?? [];
  const active = all.filter((a) => !a.archived && a.published);
  const drafts = all.filter((a) => !a.archived && !a.published);
  const archived = all.filter((a) => a.archived);

  function AssignmentList({ items }: { items: AssignmentRow[] }) {
    if (assignments.isLoading)
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      );
    if (!items.length)
      return <p className="panel p-6 text-sm text-muted-foreground">Nothing here yet.</p>;
    return (
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((a) => (
          <li key={a.id} className="panel lift flex items-start gap-3 p-4 hover:lift-hover">
            <Link
              to="/assignments/$assignmentId"
              params={{ assignmentId: a.id }}
              className="min-w-0 flex-1"
            >
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{a.title}</p>
                {!a.published && (
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    Draft
                  </span>
                )}
                {a.archived && (
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    Archived
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Due {formatDue(a.due_date)}</p>
            </Link>
            {isTeacher && user && <AssignmentActions assignment={a} teacherId={user.id} />}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-8">
      <Link
        to="/classes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All classes
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{klass.data.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {[klass.data.subject, klass.data.section].filter(Boolean).join(" · ") || "No subject"}
          </p>
        </div>
        {isTeacher && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(klass.data!.join_code);
                toast.success("Join code copied");
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-mono text-sm tracking-widest"
            >
              {klass.data.join_code}
              <Copy className="size-3.5" />
            </button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 size-4" /> New assignment
            </Button>
            {user && (
              <AssignmentDialog
                open={open}
                onOpenChange={setOpen}
                classId={classId}
                teacherId={user.id}
                onSaved={(id) =>
                  void navigate({
                    to: "/assignments/$assignmentId",
                    params: { assignmentId: id },
                  })
                }
              />
            )}
          </div>
        )}
      </header>

      <Tabs defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments">Assignments ({active.length})</TabsTrigger>
          {isTeacher && <TabsTrigger value="drafts">Drafts ({drafts.length})</TabsTrigger>}
          {isTeacher && <TabsTrigger value="archived">Archived ({archived.length})</TabsTrigger>}
          <TabsTrigger value="students">Students ({roster.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="mt-5 space-y-3">
          <AssignmentList items={active} />
        </TabsContent>
        {isTeacher && (
          <TabsContent value="drafts" className="mt-5 space-y-3">
            <AssignmentList items={drafts} />
          </TabsContent>
        )}
        {isTeacher && (
          <TabsContent value="archived" className="mt-5 space-y-3">
            <AssignmentList items={archived} />
          </TabsContent>
        )}

        <TabsContent value="students" className="mt-5">
          {roster.isLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : roster.isError ? (
            <div className="panel p-6">
              <p className="text-sm text-muted-foreground">We couldn't load the roster.</p>
              <Button className="mt-3" variant="outline" onClick={() => void roster.refetch()}>
                Try again
              </Button>
            </div>
          ) : (roster.data ?? []).length === 0 ? (
            <p className="panel p-6 text-sm text-muted-foreground">
              {isTeacher
                ? "No students yet. Share the join code above."
                : "No classmates yet."}
            </p>
          ) : (
            <ul className="panel divide-y divide-border">
              {(roster.data ?? []).map((m) => {
                const p = m.profiles;
                const name = p?.full_name?.trim() || "Student";
                const submitted = progress.data?.byStudent.get(m.student_id) ?? 0;
                const total = progress.data?.total ?? 0;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 p-4">
                    <Avatar className="size-9">
                      <AvatarFallback className="text-xs">
                        {name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p?.email ?? "No email"}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Joined {new Date(m.joined_at).toLocaleDateString()}
                    </div>
                    <span className="rounded-full border border-success/40 bg-success/15 px-2 py-0.5 text-xs text-success">
                      {total > 0 ? `Active · ${submitted}/${total} submitted` : "Active"}
                    </span>
                    {isTeacher && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Remove ${name}`}>
                            <UserMinus className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove {name} from this class?</AlertDialogTitle>
                            <AlertDialogDescription>
                              They will lose access to this class's assignments. They can rejoin
                              with the join code.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(e) => {
                                e.preventDefault();
                                removeMember.mutate(m.id);
                              }}
                              disabled={removeMember.isPending}
                            >
                              Remove student
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
