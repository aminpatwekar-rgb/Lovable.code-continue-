import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { useViewRole } from "@/lib/viewRole";
import { formatDue } from "@/lib/assignments";
import { getAssignmentGradingQueue } from "@/lib/grading/overview.functions";
import {
  GRADED_STATUSES,
  WAITING_STATUSES,
  nextId,
  waitingLabel,
  type AssignmentQueueRow,
} from "@/lib/grading/types";
import { AssignmentGradePanel } from "@/components/grading/AssignmentGradePanel";
import { QueueList, type QueueEntry } from "@/components/grading/QueueList";
import { ReleaseGradesButton } from "@/components/grading/ReleaseGradesButton";
import { WorkspaceShell } from "@/components/grading/WorkspaceShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/grading/assignment/$assignmentId")({
  validateSearch: (search: Record<string, unknown>) => ({
    s: typeof search["s"] === "string" ? (search["s"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Grade assignment — ONYX" },
      { name: "description", content: "Mark submissions one after another and release grades." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AssignmentGradingWorkspace,
});

type Tab = "waiting" | "graded" | "missing";

const isWaiting = (r: AssignmentQueueRow) =>
  (WAITING_STATUSES as readonly string[]).includes(r.status);
const isGraded = (r: AssignmentQueueRow) =>
  (GRADED_STATUSES as readonly string[]).includes(r.status) || r.status === "returned";

function AssignmentGradingWorkspace() {
  const { assignmentId } = Route.useParams();
  const { s } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { effectiveRole } = useViewRole();
  const canGrade = effectiveRole === "teacher" || effectiveRole === "admin";
  const [tab, setTab] = useState<Tab>("waiting");
  const [tabChosen, setTabChosen] = useState(false);

  const q = useQuery({
    queryKey: ["grading", "assignment", assignmentId],
    queryFn: () => getAssignmentGradingQueue({ data: { assignmentId } }),
    enabled: canGrade,
  });

  const lists = useMemo(() => {
    const rows = q.data?.rows ?? [];
    const time = (v: string | null) => new Date(v ?? 0).getTime();
    return {
      waiting: rows.filter(isWaiting).sort((a, b) => time(a.submitted_at) - time(b.submitted_at)),
      graded: rows.filter(isGraded).sort((a, b) => time(b.reviewed_at) - time(a.reviewed_at)),
      all: rows,
    };
  }, [q.data]);

  // Open on the right tab: the one holding the student a link pointed at, else the first with work.
  useEffect(() => {
    if (!q.data || tabChosen) return;
    const target = s ? q.data.rows.find((r) => r.submission_id === s) : undefined;
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
        <p className="font-medium">We couldn&apos;t open this assignment.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {q.error instanceof Error ? q.error.message : "Please try again."}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/grading">Back to Grading</Link>
        </Button>
      </div>
    );
  }

  const { assignment, rows, missing } = q.data;
  const unreleased = rows.filter(
    (r) => (r.status === "reviewed" || r.status === "completed") && !r.grade_released,
  ).length;
  const gradedCount = lists.graded.length;
  const totalSubmitted = rows.length;

  const activeList = tab === "waiting" ? lists.waiting : tab === "graded" ? lists.graded : [];
  const selected =
    tab === "missing"
      ? null
      : (activeList.find((r) => r.submission_id === s) ?? activeList[0] ?? null);
  const index = selected
    ? activeList.findIndex((r) => r.submission_id === selected.submission_id)
    : -1;

  const select = (id: string | undefined) => void navigate({ search: { s: id }, replace: true });
  const changeTab = (v: string) => {
    setTab(v as Tab);
    setTabChosen(true);
    select(undefined);
  };

  const entries: QueueEntry[] =
    tab === "missing"
      ? missing.map((m) => ({
          id: m.student_id,
          name: m.student_name,
          detail: "Hasn't submitted",
          tone: "muted",
        }))
      : activeList.map((r) => ({
          id: r.submission_id,
          name: r.student_name,
          detail:
            tab === "waiting"
              ? `${waitingLabel(r.submitted_at) || "Submitted"}${r.is_late ? " · Late" : ""}`
              : r.status === "returned"
                ? "Returned for changes"
                : r.grade_released
                  ? "Released"
                  : "Not released yet",
          badge:
            tab === "waiting"
              ? r.is_late
                ? "Late"
                : "To grade"
              : r.status === "returned"
                ? "Returned"
                : `${r.marks_awarded ?? "–"}/${assignment.max_marks}`,
          tone:
            tab === "waiting"
              ? r.is_late
                ? "warn"
                : "waiting"
              : r.status === "returned"
                ? "warn"
                : "done",
          flag:
            r.paste_violation_count > 0 ? (
              <ShieldAlert
                className="size-3.5 shrink-0 text-destructive"
                aria-label={`${r.paste_violation_count} paste attempts`}
              />
            ) : null,
        }));

  const goTo = (offset: number) => {
    const target = activeList[index + offset];
    if (target) select(target.submission_id);
  };

  const afterSave = () => {
    // Move to the next student still waiting, based on the list as it was before saving.
    if (tab === "waiting" && selected) {
      const upcoming = nextId(
        lists.waiting.map((r) => r.submission_id),
        selected.submission_id,
      );
      select(upcoming ?? undefined);
    }
  };

  const queue = (
    <QueueList
      entries={entries}
      selectedId={tab === "missing" ? null : (selected?.submission_id ?? null)}
      onSelect={(id) => {
        if (tab !== "missing") select(id);
      }}
      empty={
        tab === "waiting"
          ? "Nothing waiting. Nice work."
          : tab === "graded"
            ? "No graded work yet."
            : "Everyone has submitted."
      }
    />
  );

  return (
    <WorkspaceShell
      title={assignment.title}
      subtitle={`${assignment.class_name} · ${formatDue(assignment.due_date)} · out of ${assignment.max_marks}`}
      graded={gradedCount}
      total={totalSubmitted}
      tabs={[
        { value: "waiting", label: "To grade", count: lists.waiting.length },
        { value: "graded", label: "Graded", count: lists.graded.length },
        { value: "missing", label: "Missing", count: missing.length },
      ]}
      tab={tab}
      onTab={changeTab}
      queue={queue}
      position={selected ? `${index + 1} of ${activeList.length}` : null}
      onPrev={index > 0 ? () => goTo(-1) : null}
      onNext={index >= 0 && index < activeList.length - 1 ? () => goTo(1) : null}
    >
      {unreleased > 0 && (
        <div className="panel flex flex-wrap items-center justify-between gap-3 border-info/40 bg-info/5 p-4">
          <p className="text-sm">
            <span className="font-medium">
              {unreleased} graded submission{unreleased === 1 ? " is" : "s are"} hidden from
              students.
            </span>{" "}
            <span className="text-muted-foreground">Release them when you&apos;re ready.</span>
          </p>
          <ReleaseGradesButton
            assignmentId={assignment.id}
            assignmentTitle={assignment.title}
            count={unreleased}
          />
        </div>
      )}

      {tab === "missing" ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          {missing.length === 0
            ? "Every student in the class has submitted."
            : `${missing.length} student${missing.length === 1 ? " hasn't" : "s haven't"} submitted yet. They're listed on the left.`}
        </div>
      ) : selected ? (
        <AssignmentGradePanel
          key={selected.submission_id}
          submissionId={selected.submission_id}
          maxMarks={assignment.max_marks}
          hasNext={tab === "waiting" && activeList.length > 1}
          onDone={afterSave}
          onSkip={() => {
            const upcoming = nextId(
              activeList.map((r) => r.submission_id),
              selected.submission_id,
            );
            select(upcoming ?? undefined);
          }}
        />
      ) : (
        <div className="panel flex flex-col items-center gap-3 p-10 text-center">
          <CheckCircle2 className="size-10 text-success" />
          <p className="text-lg font-semibold">
            {tab === "waiting" ? "You're all caught up" : "Nothing here yet"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {tab === "waiting"
              ? "Every submitted assignment has been graded."
              : "Graded work will show up here."}
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {tab === "waiting" && gradedCount > 0 && (
              <Button variant="outline" onClick={() => changeTab("graded")}>
                Review graded work
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/grading">Back to Grading</Link>
            </Button>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}
