import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useViewRole } from "@/lib/viewRole";
import { getQuizGradingQueue } from "@/lib/grading/overview.functions";
import { nextId, waitingLabel, type QuizQueueRow } from "@/lib/grading/types";
import { QuizAttemptGrader } from "@/components/grading/QuizAttemptGrader";
import { QueueList, type QueueEntry } from "@/components/grading/QueueList";
import { WorkspaceShell } from "@/components/grading/WorkspaceShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/grading/quiz/$quizId")({
  validateSearch: (search: Record<string, unknown>) => ({
    s: typeof search["s"] === "string" ? (search["s"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Grade quiz — ONYX" },
      { name: "description", content: "Mark written quiz answers one student at a time." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QuizGradingWorkspace,
});

type Tab = "waiting" | "graded";
const isWaiting = (r: QuizQueueRow) => r.status === "submitted" && r.needs_manual_grading;

function QuizGradingWorkspace() {
  const { quizId } = Route.useParams();
  const { s } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { effectiveRole } = useViewRole();
  const canGrade = effectiveRole === "teacher" || effectiveRole === "admin";
  const [tab, setTab] = useState<Tab>("waiting");
  const [tabChosen, setTabChosen] = useState(false);

  const q = useQuery({
    queryKey: ["grading", "quiz", quizId],
    queryFn: () => getQuizGradingQueue({ data: { quizId } }),
    enabled: canGrade,
  });

  const lists = useMemo(() => {
    const rows = q.data?.rows ?? [];
    const time = (v: string | null) => new Date(v ?? 0).getTime();
    return {
      waiting: rows.filter(isWaiting).sort((a, b) => time(a.submitted_at) - time(b.submitted_at)),
      graded: rows
        .filter((r) => !isWaiting(r))
        .sort((a, b) => time(b.graded_at ?? b.submitted_at) - time(a.graded_at ?? a.submitted_at)),
    };
  }, [q.data]);

  useEffect(() => {
    if (!q.data || tabChosen) return;
    const target = s ? q.data.rows.find((r) => r.attempt_id === s) : undefined;
    if (target) setTab(isWaiting(target) ? "waiting" : "graded");
    else setTab(lists.waiting.length > 0 ? "waiting" : "graded");
    setTabChosen(true);
  }, [q.data, s, lists.waiting.length, tabChosen]);

  if (!canGrade) {
    return (
      <div className="panel p-8 text-center text-muted-foreground">
        Grading is available to teachers only.
      </div>
    );
  }
  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="panel p-8 text-center">
        <p className="font-medium">We couldn&apos;t open this quiz.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {q.error instanceof Error ? q.error.message : "Please try again."}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/grading">Back to Grading</Link>
        </Button>
      </div>
    );
  }

  const { quiz, rows } = q.data;
  const activeList = tab === "waiting" ? lists.waiting : lists.graded;
  const selected = activeList.find((r) => r.attempt_id === s) ?? activeList[0] ?? null;
  const index = selected ? activeList.findIndex((r) => r.attempt_id === selected.attempt_id) : -1;

  const select = (id: string | undefined) => void navigate({ search: { s: id }, replace: true });
  const changeTab = (v: string) => {
    setTab(v as Tab);
    setTabChosen(true);
    select(undefined);
  };
  const goTo = (offset: number) => {
    const target = activeList[index + offset];
    if (target) select(target.attempt_id);
  };

  const entries: QueueEntry[] = activeList.map((r) => ({
    id: r.attempt_id,
    name: r.student_name,
    detail:
      tab === "waiting"
        ? `Attempt ${r.attempt_no} · ${waitingLabel(r.submitted_at) || "Submitted"}`
        : `Attempt ${r.attempt_no}`,
    badge: tab === "waiting" ? "To grade" : `${r.score ?? "–"}/${r.max_score ?? "–"}`,
    tone: tab === "waiting" ? "waiting" : "done",
  }));

  return (
    <WorkspaceShell
      title={quiz.title}
      subtitle={`${quiz.class_name} · written answers`}
      graded={lists.graded.length}
      total={rows.length}
      tabs={[
        { value: "waiting", label: "To grade", count: lists.waiting.length },
        { value: "graded", label: "Graded", count: lists.graded.length },
      ]}
      tab={tab}
      onTab={changeTab}
      queue={
        <QueueList
          entries={entries}
          selectedId={selected?.attempt_id ?? null}
          onSelect={select}
          empty={tab === "waiting" ? "Nothing waiting. Nice work." : "No graded attempts yet."}
        />
      }
      position={selected ? `${index + 1} of ${activeList.length}` : null}
      onPrev={index > 0 ? () => goTo(-1) : null}
      onNext={index >= 0 && index < activeList.length - 1 ? () => goTo(1) : null}
    >
      {selected ? (
        <>
          <div className="panel flex flex-wrap items-center justify-between gap-2 p-4">
            <p className="font-medium">{selected.student_name}</p>
            <p className="text-sm text-muted-foreground">Attempt {selected.attempt_no}</p>
          </div>
          <QuizAttemptGrader
            key={selected.attempt_id}
            attemptId={selected.attempt_id}
            hasNext={tab === "waiting" && activeList.length > 1}
            onDone={() => {
              if (tab !== "waiting") return;
              const upcoming = nextId(
                lists.waiting.map((r) => r.attempt_id),
                selected.attempt_id,
              );
              select(upcoming ?? undefined);
            }}
            onSkip={() => {
              const upcoming = nextId(
                activeList.map((r) => r.attempt_id),
                selected.attempt_id,
              );
              select(upcoming ?? undefined);
            }}
          />
        </>
      ) : (
        <div className="panel flex flex-col items-center gap-3 p-10 text-center">
          <CheckCircle2 className="size-10 text-success" />
          <p className="text-lg font-semibold">
            {tab === "waiting" ? "You're all caught up" : "Nothing here yet"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {tab === "waiting"
              ? "Every written answer has been marked."
              : "Graded attempts will show up here."}
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link to="/grading">Back to Grading</Link>
          </Button>
        </div>
      )}
    </WorkspaceShell>
  );
}
