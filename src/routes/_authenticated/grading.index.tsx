import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, Clock } from "lucide-react";
import { useViewRole } from "@/lib/viewRole";
import { formatDue } from "@/lib/assignments";
import { getGradingOverview } from "@/lib/grading/overview.functions";
import {
  isOverdueForGrading,
  waitingLabel,
  type AssignmentGroup,
  type QuizGroup,
  type WaitingItem,
} from "@/lib/grading/types";
import { ReleaseGradesButton } from "@/components/grading/ReleaseGradesButton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/grading/")({
  head: () => ({
    meta: [
      { title: "Grading — ONYX" },
      { name: "description", content: "Everything waiting for your marks, oldest first." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GradingHub,
});

type Kind = "assignments" | "quizzes";
type Filter = "todo" | "all";

const time = (v: string | null) => (v ? new Date(v).getTime() : Number.POSITIVE_INFINITY);

function openItem(item: WaitingItem) {
  return item.kind === "assignment"
    ? ({
        to: "/grading/assignment/$assignmentId",
        params: { assignmentId: item.group_id },
        search: { s: item.item_id },
      } as const)
    : ({
        to: "/grading/quiz/$quizId",
        params: { quizId: item.group_id },
        search: { s: item.item_id },
      } as const);
}

function GradingHub() {
  const { effectiveRole } = useViewRole();
  const canGrade = effectiveRole === "teacher" || effectiveRole === "admin";
  const [kind, setKind] = useState<Kind>("assignments");
  const [filter, setFilter] = useState<Filter>("todo");

  const overview = useQuery({
    queryKey: ["grading", "overview"],
    queryFn: () => getGradingOverview(),
    enabled: canGrade,
    // Counts change as soon as a mark is saved in a workspace, so always refetch on return.
    refetchOnMount: "always",
  });

  const data = overview.data;

  const assignments = useMemo(() => {
    const list = data?.assignments ?? [];
    const shown =
      filter === "all" ? list : list.filter((a) => a.waiting > 0 || a.graded_unreleased > 0);
    return [...shown].sort(
      (a, b) =>
        time(a.oldest_waiting_at) - time(b.oldest_waiting_at) || a.title.localeCompare(b.title),
    );
  }, [data, filter]);

  const quizzes = useMemo(() => {
    const list = data?.quizzes ?? [];
    const shown = filter === "all" ? list : list.filter((q) => q.waiting > 0);
    return [...shown].sort(
      (a, b) =>
        time(a.oldest_waiting_at) - time(b.oldest_waiting_at) || a.title.localeCompare(b.title),
    );
  }, [data, filter]);

  if (!canGrade) {
    return (
      <div className="panel p-8 text-center text-muted-foreground">
        Grading is available to teachers only.
      </div>
    );
  }

  const waitingAssignments = (data?.assignments ?? []).reduce((n, a) => n + a.waiting, 0);
  const waitingQuizzes = (data?.quizzes ?? []).reduce((n, q) => n + q.waiting, 0);
  const first = data?.up_next[0];

  return (
    <div className="space-y-5 sm:space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Grading</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            Everything waiting for your marks, oldest first. Mark one student after another, then
            release the grades.
          </p>
        </div>
        {first && (
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link {...openItem(first)}>
              <ClipboardCheck className="mr-2 size-4" />
              Start grading
              <span className="ml-2 rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs">
                {data?.stats.waiting}
              </span>
            </Link>
          </Button>
        )}
      </header>

      {overview.isError && !data ? (
        <div className="panel space-y-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">Could not load your grading queue.</p>
          <Button variant="outline" onClick={() => void overview.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Grading summary">
            <Stat label="To grade" value={data?.stats.waiting} loading={overview.isLoading} />
            <Stat
              label="Late"
              value={data?.stats.late_waiting}
              loading={overview.isLoading}
              tone={data && data.stats.late_waiting > 0 ? "warn" : undefined}
            />
            <Stat
              label="Ready to release"
              value={data?.stats.ready_to_release}
              loading={overview.isLoading}
            />
            <Stat
              label="Graded this week"
              value={data?.stats.graded_this_week}
              loading={overview.isLoading}
            />
          </section>

          {data && data.up_next.length > 0 && (
            <section aria-labelledby="up-next" className="space-y-2">
              <h2 id="up-next" className="text-sm font-semibold">
                Up next
              </h2>
              <ul className="panel divide-y divide-border/60 overflow-hidden">
                {data.up_next.slice(0, 5).map((item, i) => (
                  <li
                    key={`${item.kind}-${item.item_id}`}
                    className={cn(i >= 3 && "hidden sm:block")}
                  >
                    <Link
                      {...openItem(item)}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.student_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.title} · {item.class_name}
                        </p>
                      </div>
                      {item.is_late && (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning-foreground">
                          Late
                        </span>
                      )}
                      <span
                        className={cn(
                          "shrink-0 text-xs",
                          isOverdueForGrading(item.submitted_at)
                            ? "font-medium text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {waitingLabel(item.submitted_at).replace("Waiting ", "")}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-4" aria-label="Assignments and quizzes">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
                <TabsList>
                  <TabsTrigger value="assignments">
                    Assignments{waitingAssignments > 0 && <Count n={waitingAssignments} />}
                  </TabsTrigger>
                  <TabsTrigger value="quizzes">
                    Quizzes{waitingQuizzes > 0 && <Count n={waitingQuizzes} />}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex gap-1.5" role="group" aria-label="Filter">
                <Button
                  size="sm"
                  variant={filter === "todo" ? "default" : "outline"}
                  aria-pressed={filter === "todo"}
                  onClick={() => setFilter("todo")}
                >
                  To do
                </Button>
                <Button
                  size="sm"
                  variant={filter === "all" ? "default" : "outline"}
                  aria-pressed={filter === "all"}
                  onClick={() => setFilter("all")}
                >
                  All
                </Button>
              </div>
            </div>

            {overview.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : kind === "assignments" ? (
              assignments.length === 0 ? (
                <AllCaught
                  noun="assignments"
                  showAll={filter === "todo" && (data?.assignments.length ?? 0) > 0}
                  onShowAll={() => setFilter("all")}
                />
              ) : (
                <ul className="space-y-3">
                  {assignments.map((a) => (
                    <AssignmentCard key={a.id} group={a} />
                  ))}
                </ul>
              )
            ) : quizzes.length === 0 ? (
              <AllCaught
                noun="quizzes"
                showAll={filter === "todo" && (data?.quizzes.length ?? 0) > 0}
                onShowAll={() => setFilter("all")}
              />
            ) : (
              <ul className="space-y-3">
                {quizzes.map((q) => (
                  <QuizCard key={q.id} group={q} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">
      {n}
    </span>
  );
}

function Stat({
  label,
  value,
  loading,
  tone,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  tone?: "warn" | undefined;
}) {
  return (
    <div className="panel p-3.5 sm:p-5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-12" />
      ) : (
        <p
          className={cn(
            "mt-1.5 text-2xl font-bold tabular-nums tracking-tight sm:mt-3 sm:text-3xl",
            tone === "warn" && "text-warning-foreground",
          )}
        >
          {value ?? 0}
        </p>
      )}
    </div>
  );
}

function AllCaught({
  noun,
  showAll,
  onShowAll,
}: {
  noun: string;
  showAll: boolean;
  onShowAll: () => void;
}) {
  return (
    <div className="panel flex flex-col items-center gap-2 p-8 text-center">
      <CheckCircle2 className="size-8 text-success" />
      <p className="font-medium">You are all caught up</p>
      <p className="text-sm text-muted-foreground">Nothing in {noun} is waiting for your marks.</p>
      {showAll && (
        <Button variant="outline" size="sm" onClick={onShowAll}>
          Show all {noun}
        </Button>
      )}
    </div>
  );
}

function WaitChip({ since }: { since: string | null }) {
  if (!since) return null;
  const overdue = isOverdueForGrading(since);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        overdue ? "font-medium text-destructive" : "text-muted-foreground",
      )}
    >
      {overdue ? <AlertTriangle className="size-3.5" /> : <Clock className="size-3.5" />}
      {waitingLabel(since)}
    </span>
  );
}

function AssignmentCard({ group: a }: { group: AssignmentGroup }) {
  const handedIn = a.waiting + a.graded_unreleased + a.released + a.returned;
  const graded = a.graded_unreleased + a.released;
  const pct = handedIn > 0 ? Math.round((graded / handedIn) * 100) : 0;

  return (
    <li className="panel space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to="/grading/assignment/$assignmentId"
            params={{ assignmentId: a.id }}
            search={{ s: undefined }}
            className="block truncate font-semibold hover:underline"
          >
            {a.title}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {a.class_name}
            {a.subject ? ` · ${a.subject}` : ""}
            {a.due_date ? ` · Due ${formatDue(a.due_date)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {a.late_waiting > 0 && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning-foreground">
              {a.late_waiting} late
            </span>
          )}
          <WaitChip since={a.oldest_waiting_at} />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          {handedIn} of {a.roster} handed in · {graded} graded
          {a.graded_unreleased > 0 && ` (${a.graded_unreleased} not released)`}
          {a.returned > 0 && ` · ${a.returned} returned`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={a.waiting > 0 ? "default" : "outline"}>
          <Link
            to="/grading/assignment/$assignmentId"
            params={{ assignmentId: a.id }}
            search={{ s: undefined }}
          >
            {a.waiting > 0 ? `Grade ${a.waiting}` : "Open"}
          </Link>
        </Button>
        {a.graded_unreleased > 0 && (
          <ReleaseGradesButton
            assignmentId={a.id}
            assignmentTitle={a.title}
            count={a.graded_unreleased}
            variant="outline"
          />
        )}
      </div>
    </li>
  );
}

function QuizCard({ group: q }: { group: QuizGroup }) {
  return (
    <li className="panel space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to="/grading/quiz/$quizId"
            params={{ quizId: q.id }}
            search={{ s: undefined }}
            className="block truncate font-semibold hover:underline"
          >
            {q.title}
          </Link>
          <p className="truncate text-xs capitalize text-muted-foreground">
            {q.class_name} · {q.kind}
          </p>
        </div>
        <WaitChip since={q.oldest_waiting_at} />
      </div>

      <p className="text-xs text-muted-foreground">
        {q.attempts} attempt{q.attempts === 1 ? "" : "s"} · {q.graded} graded
        {q.waiting > 0 && ` · ${q.waiting} with written answers to mark`}
      </p>

      <Button asChild size="sm" variant={q.waiting > 0 ? "default" : "outline"}>
        <Link to="/grading/quiz/$quizId" params={{ quizId: q.id }} search={{ s: undefined }}>
          {q.waiting > 0 ? `Grade ${q.waiting}` : "Open"}
        </Link>
      </Button>
    </li>
  );
}
