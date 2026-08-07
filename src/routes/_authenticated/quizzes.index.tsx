import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Lock, Plus, Timer, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { KIND_LABEL, percent, type QuizKind } from "@/lib/quiz/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/quizzes/")({
  head: () => ({
    meta: [
      { title: "Quizzes & Exams — ONYX" },
      {
        name: "description",
        content:
          "Create AI-generated quizzes, run secure exams and track attempts across your ONYX classes.",
      },
      { property: "og:title", content: "Quizzes & Exams — ONYX" },
      { property: "og:description", content: "AI quiz generation and secure exams in ONYX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QuizzesPage,
});

function QuizzesPage() {
  const { role } = useAuth();
  if (!role) return <ListSkeleton />;
  return role === "student" ? <StudentQuizzes /> : <TeacherQuizzes />;
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-52" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel flex flex-col items-center gap-2 p-10 text-center">
      <ClipboardList className="size-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/* ------------------------------- teacher -------------------------------- */

function CreateQuizDialog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [classId, setClassId] = useState("");
  const [kind, setKind] = useState<QuizKind>("practice");

  const classes = useQuery({
    queryKey: ["teacher-classes-min", user?.id],
    enabled: Boolean(user) && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, subject")
        .eq("archived", false)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .insert({
          title: title.trim(),
          class_id: classId,
          teacher_id: user!.id,
          kind,
          lockdown_enabled: kind === "exam",
          time_limit_minutes: kind === "practice" ? null : 30,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      setOpen(false);
      setTitle("");
      navigate({ to: "/quizzes/$quizId/edit", params: { quizId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" /> New quiz
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a quiz</DialogTitle>
          <DialogDescription>
            Start blank, then generate questions with AI or pull them from your question bank.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="quiz-title">Title</Label>
            <Input
              id="quiz-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Chapter 4 — Thermodynamics"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-class">Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger id="quiz-class">
                <SelectValue placeholder="Choose a class" />
              </SelectTrigger>
              <SelectContent>
                {(classes.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.subject ? ` · ${c.subject}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {classes.isSuccess && !classes.data.length && (
              <p className="text-xs text-muted-foreground">Create a class first.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quiz-kind">Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as QuizKind)}>
              <SelectTrigger id="quiz-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as QuizKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!title.trim() || !classId || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Creating…" : "Create & add questions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeacherQuizzes() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["teacher-quizzes", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select(
          "id, title, kind, published, archived, lockdown_enabled, time_limit_minutes, class_id, classes(name), quiz_questions(count), quiz_attempts(count)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await supabase.from("quizzes").update({ published }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.published ? "Quiz published" : "Quiz unpublished");
      void qc.invalidateQueries({ queryKey: ["teacher-quizzes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <ListSkeleton />;
  if (q.isError)
    return (
      <div className="panel p-6 text-sm text-destructive">
        Couldn't load quizzes. {(q.error as Error).message}
      </div>
    );

  const live = (q.data ?? []).filter((x) => !x.archived);
  const archived = (q.data ?? []).filter((x) => x.archived);

  const row = (x: (typeof live)[number]) => {
    const questions = x.quiz_questions?.[0]?.count ?? 0;
    const attempts = x.quiz_attempts?.[0]?.count ?? 0;
    return (
      <div key={x.id} className="panel flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <Link
            to="/quizzes/$quizId"
            params={{ quizId: x.id }}
            className="font-medium hover:underline"
          >
            {x.title}
          </Link>
          <p className="truncate text-sm text-muted-foreground">
            {x.classes?.name ?? "Class"} · {KIND_LABEL[x.kind as QuizKind]} · {questions} question
            {questions === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {x.lockdown_enabled && (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" /> Lockdown
            </Badge>
          )}
          {x.time_limit_minutes && (
            <Badge variant="outline" className="gap-1">
              <Timer className="size-3" /> {x.time_limit_minutes}m
            </Badge>
          )}
          <Badge variant="outline" className="gap-1">
            <Users className="size-3" /> {attempts}
          </Badge>
          <Badge variant={x.published ? "default" : "secondary"}>
            {x.published ? "Published" : "Draft"}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link to="/quizzes/$quizId/edit" params={{ quizId: x.id }}>
              Edit
            </Link>
          </Button>
          <Button
            size="sm"
            variant={x.published ? "ghost" : "default"}
            disabled={togglePublish.isPending || questions === 0}
            onClick={() => togglePublish.mutate({ id: x.id, published: !x.published })}
          >
            {x.published ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quizzes & exams</h1>
          <p className="text-sm text-muted-foreground">
            Generate questions with AI, run secure exams, and track every attempt.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/question-bank">Question bank</Link>
          </Button>
          <CreateQuizDialog />
        </div>
      </header>

      <Tabs defaultValue="live">
        <TabsList>
          <TabsTrigger value="live">Active ({live.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archived.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="live" className="mt-4 space-y-3">
          {live.length ? (
            live.map(row)
          ) : (
            <EmptyState
              title="No quizzes yet"
              body="Create your first quiz and let AI draft the questions from your notes."
            />
          )}
        </TabsContent>
        <TabsContent value="archived" className="mt-4 space-y-3">
          {archived.length ? (
            archived.map(row)
          ) : (
            <EmptyState title="Nothing archived" body="Archived quizzes will appear here." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------- student -------------------------------- */

function StudentQuizzes() {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ["student-quizzes", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data: quizzes, error } = await supabase
        .from("quizzes")
        .select(
          "id, title, kind, start_at, end_at, time_limit_minutes, max_attempts, lockdown_enabled, class_id, classes(name), quiz_questions(count)",
        )
        .eq("published", true)
        .eq("archived", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const { data: attempts } = await supabase
        .from("quiz_attempts")
        .select("id, quiz_id, status, score, max_score, attempt_no, submitted_at")
        .eq("student_id", user!.id)
        .order("attempt_no", { ascending: false });
      return { quizzes: quizzes ?? [], attempts: attempts ?? [] };
    },
  });

  if (q.isLoading) return <ListSkeleton />;
  if (q.isError)
    return (
      <div className="panel p-6 text-sm text-destructive">
        Couldn't load quizzes. {(q.error as Error).message}
      </div>
    );

  const attempts = q.data?.attempts ?? [];
  const best = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) if (!best.has(a.quiz_id)) best.set(a.quiz_id, a);

  const all = q.data?.quizzes ?? [];
  const done = all.filter((x) => {
    const a = best.get(x.id);
    return a && (a.status === "graded" || a.status === "submitted");
  });
  const available = all.filter((x) => !done.includes(x));

  const card = (x: (typeof all)[number]) => {
    const a = best.get(x.id);
    const count = x.quiz_questions?.[0]?.count ?? 0;
    const used = attempts.filter((t) => t.quiz_id === x.id).length;
    const exhausted = used >= (x.max_attempts ?? 1);
    const notOpen = x.start_at ? new Date(x.start_at) > new Date() : false;
    const closed = x.end_at ? new Date(x.end_at) < new Date() : false;

    return (
      <div key={x.id} className="panel flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <Link
            to="/quizzes/$quizId"
            params={{ quizId: x.id }}
            className="font-medium hover:underline"
          >
            {x.title}
          </Link>
          <p className="truncate text-sm text-muted-foreground">
            {x.classes?.name ?? "Class"} · {count} question{count === 1 ? "" : "s"}
            {x.time_limit_minutes ? ` · ${x.time_limit_minutes} min` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {x.lockdown_enabled && (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" /> Lockdown
            </Badge>
          )}
          {a?.status === "graded" && a.max_score ? (
            <Badge>{percent(a.score ?? 0, a.max_score)}%</Badge>
          ) : a?.status === "submitted" ? (
            <Badge variant="secondary">Awaiting grading</Badge>
          ) : null}
          <Button asChild size="sm" variant={a ? "outline" : "default"} disabled={count === 0}>
            <Link to="/quizzes/$quizId" params={{ quizId: x.id }}>
              {notOpen ? "Not open yet" : closed ? "Closed" : exhausted ? "View result" : a ? "Retake" : "Start"}
            </Link>
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quizzes</h1>
          <p className="text-sm text-muted-foreground">
            Practise, take timed tests and see where you stand.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/leaderboard">Leaderboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/achievements">Achievements</Link>
          </Button>
        </div>
      </header>

      <Tabs defaultValue="available">
        <TabsList>
          <TabsTrigger value="available">To do ({available.length})</TabsTrigger>
          <TabsTrigger value="done">Completed ({done.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="available" className="mt-4 space-y-3">
          {available.length ? (
            available.map(card)
          ) : (
            <EmptyState
              title="Nothing to take right now"
              body="New quizzes from your teachers will show up here."
            />
          )}
        </TabsContent>
        <TabsContent value="done" className="mt-4 space-y-3">
          {done.length ? (
            done.map(card)
          ) : (
            <EmptyState title="No attempts yet" body="Your completed quizzes will be listed here." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
