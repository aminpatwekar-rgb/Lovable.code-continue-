import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Pencil,
  PlayCircle,
  ShieldAlert,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { KIND_LABEL, percent, TYPE_LABEL, type QuestionType, type QuizKind } from "@/lib/quiz/types";
import { DeleteQuizButton } from "@/components/DeleteQuizButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/quizzes/$quizId/")({
  head: () => ({
    meta: [
      { title: "Quiz — ONYX" },
      { name: "description", content: "Quiz overview, attempts and results in ONYX." },
      { property: "og:title", content: "Quiz — ONYX" },
      { property: "og:description", content: "Quiz overview, attempts and results in ONYX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function fmt(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Page() {
  const { quizId } = Route.useParams();
  const { user, role } = useAuth();
  const isTeacher = role === "teacher" || role === "admin";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const removeQuiz = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("quizzes").delete().eq("id", quizId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Quiz deleted");
      void qc.invalidateQueries({ queryKey: ["teacher-quizzes"] });
      void navigate({ to: "/quizzes" });
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const q = useQuery({
    queryKey: ["quiz-detail", quizId, user?.id, role],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data: quiz, error } = await supabase
        .from("quizzes")
        .select("*, classes(id, name)")
        .eq("id", quizId)
        .maybeSingle();
      if (error) throw error;
      if (!quiz) throw new Error("Quiz not found.");

      // Teachers own the rows; students read a key-free projection via RPC so
      // the `correct`/`explanation` columns never reach the browser.
      const { data: questions } = isTeacher
        ? await supabase
            .from("quiz_questions")
            .select("id, type, prompt, points, position")
            .eq("quiz_id", quizId)
            .order("position")
        : await supabase.rpc("get_quiz_questions_for_student", { _quiz_id: quizId });


      const attemptQuery = supabase
        .from("quiz_attempts")
        .select("id, student_id, attempt_no, status, score, max_score, submitted_at, started_at")
        .eq("quiz_id", quizId)
        .order("submitted_at", { ascending: false, nullsFirst: false });

      const { data: attempts } = isTeacher
        ? await attemptQuery
        : await attemptQuery.eq("student_id", user!.id);

      let names: Record<string, string> = {};
      if (isTeacher && attempts?.length) {
        const ids = [...new Set(attempts.map((a) => a.student_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));
      }

      return { quiz, questions: questions ?? [], attempts: attempts ?? [], names };
    },
  });

  if (q.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="panel space-y-3 p-10 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Quiz unavailable</h1>
        <p className="text-sm text-muted-foreground">{(q.error as Error).message}</p>
        <Button asChild>
          <Link to="/quizzes">Back to quizzes</Link>
        </Button>
      </div>
    );
  }

  const { quiz, questions, attempts, names } = q.data!;
  const totalMarks = questions.reduce((s, item) => s + (Number(item.points) || 0), 0);
  const myAttempts = attempts.filter((a) => a.student_id === user?.id);
  const graded = attempts.filter((a) => a.score != null && a.max_score);
  const average = graded.length
    ? Math.round(
        graded.reduce((s, a) => s + percent(a.score ?? 0, a.max_score ?? 0), 0) / graded.length,
      )
    : null;
  const canAttempt =
    !isTeacher &&
    quiz.published &&
    myAttempts.length < quiz.max_attempts &&
    (!quiz.start_at || new Date(quiz.start_at) <= new Date()) &&
    (!quiz.end_at || new Date(quiz.end_at) >= new Date());
  const openAttempt = myAttempts.find((a) => a.status === "in_progress");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/quizzes">
              <ArrowLeft className="mr-1.5 size-4" /> Quizzes
            </Link>
          </Button>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{quiz.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{KIND_LABEL[quiz.kind as QuizKind]}</Badge>
            {quiz.published ? (
              <Badge>Published</Badge>
            ) : (
              <Badge variant="outline">Draft</Badge>
            )}
            {quiz.lockdown_enabled && (
              <span className="inline-flex items-center gap-1">
                <ShieldAlert className="size-3.5" /> Lockdown
              </span>
            )}
            <span>{quiz.classes?.name}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isTeacher ? (
            <>
              <Button asChild>
                <Link to="/quizzes/$quizId/edit" params={{ quizId }}>
                  <Pencil className="mr-2 size-4" /> Edit quiz
                </Link>
              </Button>
              <DeleteQuizButton
                title={quiz.title}
                label="Delete quiz"
                variant="outline"
                pending={removeQuiz.isPending}
                onConfirm={() => removeQuiz.mutate()}
              />
            </>
          ) : canAttempt ? (
            <Button asChild>
              <Link to="/quizzes/$quizId/take" params={{ quizId }}>
                <PlayCircle className="mr-2 size-4" />
                {openAttempt ? "Resume attempt" : "Start quiz"}
              </Link>
            </Button>
          ) : (
            <Button disabled>No attempts left</Button>
          )}
        </div>
      </header>

      {quiz.description && (
        <p className="panel whitespace-pre-wrap p-5 text-sm text-muted-foreground">
          {quiz.description}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Questions", `${questions.length}`],
          ["Total marks", `${totalMarks}`],
          [
            "Time limit",
            quiz.time_limit_minutes ? `${quiz.time_limit_minutes} min` : "No limit",
          ],
          [
            isTeacher ? "Attempts" : "Your attempts",
            `${isTeacher ? attempts.length : myAttempts.length} / ${quiz.max_attempts}${isTeacher ? "" : ""}`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="panel p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Opens</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm">
            <Clock className="size-4 text-muted-foreground" /> {fmt(quiz.start_at)}
          </p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Closes</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm">
            <Clock className="size-4 text-muted-foreground" /> {fmt(quiz.end_at)}
          </p>
        </div>
      </div>

      {isTeacher && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Student attempts</h2>
            {average !== null && (
              <p className="text-sm text-muted-foreground">Class average {average}%</p>
            )}
          </div>
          {attempts.length === 0 ? (
            <p className="panel p-6 text-sm text-muted-foreground">
              <Users className="mb-2 size-5" />
              No one has attempted this quiz yet.
            </p>
          ) : (
            <div className="panel divide-y divide-border">
              {attempts.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {names[a.student_id] ?? "Student"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Attempt {a.attempt_no} · {a.submitted_at ? fmt(a.submitted_at) : "in progress"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Badge variant={a.status === "graded" ? "default" : "outline"}>
                      {a.status.replace("_", " ")}
                    </Badge>
                    <span className="tabular-nums">
                      {a.score != null && a.max_score
                        ? `${a.score}/${a.max_score} · ${percent(a.score, a.max_score)}%`
                        : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {!isTeacher && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Your attempts</h2>
          {myAttempts.length === 0 ? (
            <p className="panel p-6 text-sm text-muted-foreground">
              You haven't attempted this quiz yet.
            </p>
          ) : (
            <div className="panel divide-y divide-border">
              {myAttempts.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium">Attempt {a.attempt_no}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.submitted_at ? fmt(a.submitted_at) : `Started ${fmt(a.started_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {a.status === "in_progress" ? (
                      <Button asChild size="sm">
                        <Link to="/quizzes/$quizId/take" params={{ quizId }}>
                          Resume
                        </Link>
                      </Button>
                    ) : quiz.show_results && a.score != null && a.max_score ? (
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <CheckCircle2 className="size-4 text-muted-foreground" />
                        {a.score}/{a.max_score} · {percent(a.score, a.max_score)}%
                      </span>
                    ) : (
                      <Badge variant="outline">{a.status.replace("_", " ")}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {isTeacher && questions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Questions</h2>
          <ol className="panel divide-y divide-border">
            {questions.map((item, i) => (
              <li key={item.id} className="flex items-start justify-between gap-3 p-4">
                <p className="text-sm">
                  <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                  {item.prompt}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {TYPE_LABEL[item.type as QuestionType]} · {item.points}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
