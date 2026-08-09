import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Clock, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { finalizeQuizAttempt } from "@/lib/quiz/grading.functions";
import { formatClock, shuffle, TYPE_LABEL, type QuestionType } from "@/lib/quiz/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/quizzes/$quizId/take")({
  head: () => ({
    meta: [
      { title: "Take quiz — ONYX" },
      { name: "description", content: "Attempt a quiz in ONYX." },
      { property: "og:title", content: "Take quiz — ONYX" },
      { property: "og:description", content: "Attempt a quiz in ONYX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type Question = {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  points: number;
};

type Quiz = {
  id: string;
  title: string;
  description: string | null;
  time_limit_minutes: number | null;
  max_attempts: number;
  lockdown_enabled: boolean;
  randomize_questions: boolean;
  randomize_choices: boolean;
  auto_submit: boolean;
  published: boolean;
  start_at: string | null;
  end_at: string | null;
};

type Attempt = { id: string; attempt_no: number; started_at: string; question_order: string[] };

function Page() {
  const { quizId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const finalize = useServerFn(finalizeQuizAttempt);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [responses, setResponses] = useState<Record<string, string[]>>({});
  const [answerIds, setAnswerIds] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [warnings, setWarnings] = useState(0);
  const [locked, setLocked] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // ---- load quiz, questions and the student's live attempt -----------------
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const { data: q, error: qErr } = await supabase
          .from("quizzes")
          .select(
            "id, title, description, time_limit_minutes, max_attempts, lockdown_enabled, randomize_questions, randomize_choices, auto_submit, published, start_at, end_at",
          )
          .eq("id", quizId)
          .maybeSingle();
        if (qErr) throw qErr;
        if (!q) throw new Error("Quiz not found.");
        if (!q.published) throw new Error("This quiz is not open yet.");
        if (q.start_at && new Date(q.start_at) > new Date())
          throw new Error("This quiz has not opened yet.");
        if (q.end_at && new Date(q.end_at) < new Date()) throw new Error("This quiz has closed.");

        // Answer keys are never sent to the browser: this RPC returns the
        // student-safe columns only (no `correct`, no `explanation`).
        const { data: rows, error: rErr } = await supabase.rpc(
          "get_quiz_questions_for_student",
          { _quiz_id: quizId },
        );
        if (rErr) throw rErr;
        if (!rows?.length) throw new Error("This quiz has no questions yet.");


        let live: Attempt | null = null;
        const { data: open } = await supabase
          .from("quiz_attempts")
          .select("id, attempt_no, started_at, question_order, status")
          .eq("quiz_id", quizId)
          .eq("student_id", user.id)
          .eq("status", "in_progress")
          .order("attempt_no", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (open) {
          live = {
            id: open.id,
            attempt_no: open.attempt_no,
            started_at: open.started_at,
            question_order: Array.isArray(open.question_order)
              ? (open.question_order as unknown[]).map(String)
              : [],
          };
        } else {
          const { count } = await supabase
            .from("quiz_attempts")
            .select("id", { count: "exact", head: true })
            .eq("quiz_id", quizId)
            .eq("student_id", user.id);
          if ((count ?? 0) >= q.max_attempts) {
            throw new Error("You have used all your attempts for this quiz.");
          }
          const order = q.randomize_questions
            ? shuffle(
                rows.map((r) => r.id),
                `${user.id}:${quizId}:${(count ?? 0) + 1}`,
              )
            : rows.map((r) => r.id);
          const { data: created, error: cErr } = await supabase
            .from("quiz_attempts")
            .insert({
              quiz_id: quizId,
              student_id: user.id,
              attempt_no: (count ?? 0) + 1,
              question_order: order,
            })
            .select("id, attempt_no, started_at, question_order")
            .single();
          if (cErr) throw cErr;
          live = {
            id: created.id,
            attempt_no: created.attempt_no,
            started_at: created.started_at,
            question_order: order,
          };
        }

        const orderMap = new Map(live.question_order.map((id, i) => [id, i]));
        const ordered = [...rows].sort(
          (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
        );

        const prepared: Question[] = ordered.map((r) => {
          const options = Array.isArray(r.options) ? (r.options as unknown[]).map(String) : [];
          return {
            id: r.id,
            type: r.type as QuestionType,
            prompt: r.prompt,
            points: Number(r.points) || 1,
            options:
              q.randomize_choices && r.type !== "true_false"
                ? shuffle(options, `${live!.id}:${r.id}`)
                : options,
          };
        });

        const { data: saved } = await supabase
          .from("quiz_answers")
          .select("id, question_id, response")
          .eq("attempt_id", live.id);

        if (cancelled) return;
        setQuiz(q as Quiz);
        setQuestions(prepared);
        setAttempt(live);
        setResponses(
          Object.fromEntries(
            (saved ?? []).map((a) => [
              a.question_id,
              Array.isArray(a.response) ? (a.response as unknown[]).map(String) : [],
            ]),
          ),
        );
        setAnswerIds(Object.fromEntries((saved ?? []).map((a) => [a.question_id, a.id])));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not start this quiz.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [quizId, user]);

  const total = questions.length;
  const answeredCount = useMemo(
    () => questions.filter((q) => (responses[q.id] ?? []).some((v) => v.trim())).length,
    [questions, responses],
  );

  const submit = useCallback(
    async (reason?: string) => {
      if (!attempt || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        const res = await finalize({ data: { attemptId: attempt.id } });
        toast.success(
          res.needsManual
            ? "Submitted — your teacher will grade the written answers."
            : `Submitted — you scored ${res.score}/${res.max}.`,
        );
        if (reason) toast.warning(reason);
        await navigate({ to: "/quizzes/$quizId", params: { quizId } });
      } catch (e) {
        submittedRef.current = false;
        toast.error(e instanceof Error ? e.message : "Could not submit your attempt.");
      } finally {
        setSubmitting(false);
      }
    },
    [attempt, finalize, navigate, quizId],
  );

  // ---- countdown ----------------------------------------------------------
  useEffect(() => {
    if (!quiz?.time_limit_minutes || !attempt) return;
    const deadline = new Date(attempt.started_at).getTime() + quiz.time_limit_minutes * 60_000;
    const tick = () => {
      const left = Math.floor((deadline - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) void submit("Time is up — your attempt was submitted automatically.");
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [quiz?.time_limit_minutes, attempt, submit]);

  // ---- lockdown -----------------------------------------------------------
  useEffect(() => {
    if (!quiz?.lockdown_enabled || !attempt || !user) return;
    let awaySince = 0;

    const record = async (kind: string, awayMs: number, lock: boolean) => {
      await supabase.from("quiz_violations").insert({
        attempt_id: attempt.id,
        quiz_id: quizId,
        student_id: user.id,
        kind,
        away_ms: Math.round(awayMs),
        locked: lock,
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        awaySince = Date.now();
        return;
      }
      const away = awaySince ? Date.now() - awaySince : 0;
      awaySince = 0;
      setWarnings((prev) => {
        const next = prev + 1;
        const shouldLock = next >= 3;
        void record("tab_switch", away, shouldLock);
        if (shouldLock) {
          setLocked("You left the quiz too many times. The attempt has been locked and submitted.");
          void supabase
            .from("quiz_attempts")
            .update({ locked_at: new Date().toISOString(), lock_reason: "Too many tab switches" })
            .eq("id", attempt.id)
            .then(() => submit("Attempt locked after repeated tab switches."));
        } else {
          toast.warning(`Stay on this tab — warning ${next} of 3.`);
        }
        return next;
      });
    };

    const blockContext = (e: Event) => e.preventDefault();
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("contextmenu", blockContext);
    document.addEventListener("copy", blockContext);
    document.addEventListener("paste", blockContext);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("contextmenu", blockContext);
      document.removeEventListener("copy", blockContext);
      document.removeEventListener("paste", blockContext);
    };
  }, [quiz?.lockdown_enabled, attempt, user, quizId, submit]);

  async function persist(questionId: string, value: string[]) {
    if (!attempt) return;
    const existing = answerIds[questionId];
    if (existing) {
      await supabase.from("quiz_answers").update({ response: value }).eq("id", existing);
      return;
    }
    const { data, error: insErr } = await supabase
      .from("quiz_answers")
      .insert({ attempt_id: attempt.id, question_id: questionId, response: value })
      .select("id")
      .single();
    if (!insErr && data) setAnswerIds((prev) => ({ ...prev, [questionId]: data.id }));
  }

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function answer(questionId: string, value: string[], debounce = false) {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
    const timers = saveTimers.current;
    if (timers[questionId]) clearTimeout(timers[questionId]);
    if (debounce) {
      timers[questionId] = setTimeout(() => void persist(questionId, value), 600);
    } else {
      void persist(questionId, value);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel space-y-3 p-10 text-center">
        <ShieldAlert className="mx-auto size-6 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">Can't start this quiz</h1>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button asChild>
          <Link to="/quizzes">Back to quizzes</Link>
        </Button>
      </div>
    );
  }

  const current = questions[index];
  const response = current ? (responses[current.id] ?? []) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{quiz?.title}</h1>
          <p className="text-xs text-muted-foreground">
            Attempt {attempt?.attempt_no} · {answeredCount} of {total} answered
          </p>
        </div>
        <div className="flex items-center gap-3">
          {quiz?.lockdown_enabled && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs">
              <ShieldAlert className="size-3.5" /> Lockdown
            </span>
          )}
          {remaining !== null && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium tabular-nums ${
                remaining < 60 ? "bg-destructive/15 text-destructive" : "bg-muted"
              }`}
            >
              <Clock className="size-4" /> {formatClock(remaining)}
            </span>
          )}
        </div>
      </header>

      <Progress value={total ? (answeredCount / total) * 100 : 0} />

      {warnings > 0 && !locked && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Leaving this tab is recorded. Warning {warnings} of 3 — the attempt locks after that.
        </div>
      )}

      {locked ? (
        <div className="panel space-y-2 p-10 text-center">
          <ShieldAlert className="mx-auto size-6 text-destructive" aria-hidden />
          <h2 className="text-lg font-semibold">Attempt locked</h2>
          <p className="text-sm text-muted-foreground">{locked}</p>
        </div>
      ) : (
        current && (
          <div className="panel space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Question {index + 1} of {total} · {TYPE_LABEL[current.type]}
              </p>
              <span className="text-xs text-muted-foreground">
                {current.points} mark{current.points === 1 ? "" : "s"}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-base font-medium">{current.prompt}</p>

            {(current.type === "mcq" || current.type === "true_false") && (
              <div className="space-y-2">
                {current.options.map((opt) => (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                      response.includes(opt)
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${current.id}`}
                      className="accent-primary"
                      checked={response.includes(opt)}
                      onChange={() => answer(current.id, [opt])}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}

            {current.type === "multi_select" && (
              <div className="space-y-2">
                {current.options.map((opt) => (
                  <label
                    key={opt}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                      response.includes(opt)
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={response.includes(opt)}
                      onCheckedChange={() =>
                        answer(
                          current.id,
                          response.includes(opt)
                            ? response.filter((r) => r !== opt)
                            : [...response, opt],
                        )
                      }
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}

            {(current.type === "fill_blank" || current.type === "short_answer") && (
              <Input
                value={response[0] ?? ""}
                onChange={(e) => answer(current.id, [e.target.value], true)}
                placeholder="Type your answer"
              />
            )}

            {current.type === "essay" && (
              <Textarea
                value={response[0] ?? ""}
                onChange={(e) => answer(current.id, [e.target.value], true)}
                placeholder="Write your response"
                className="min-h-48"
              />
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                variant="outline"
                disabled={index === 0}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
              >
                Previous
              </Button>
              {index < total - 1 ? (
                <Button onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}>Next</Button>
              ) : (
                <Button onClick={() => setConfirming(true)} disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Submit quiz
                </Button>
              )}
            </div>
          </div>
        )
      )}

      {!locked && (
        <div className="flex flex-wrap gap-1.5">
          {questions.map((q, i) => {
            const done = (responses[q.id] ?? []).some((v) => v.trim());
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to question ${i + 1}`}
                aria-current={i === index}
                className={`size-8 rounded-md border text-xs font-medium transition-colors ${
                  i === index
                    ? "border-primary bg-primary text-primary-foreground"
                    : done
                      ? "border-primary/40 bg-primary/10"
                      : "border-border hover:bg-muted"
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this attempt?</AlertDialogTitle>
            <AlertDialogDescription>
              You answered {answeredCount} of {total} questions. You can't change your answers after
              submitting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit()}>Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
