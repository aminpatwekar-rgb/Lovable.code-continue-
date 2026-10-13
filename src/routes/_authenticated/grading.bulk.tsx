import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Search, Users } from "lucide-react";
import { getAssignmentGradingQueue, getGradingOverview } from "@/lib/grading/overview.functions";
import type { AssignmentQueueRow } from "@/lib/grading/types";
import { AssignmentGradePanel } from "@/components/grading/AssignmentGradePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useViewRole } from "@/lib/viewRole";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/grading/bulk")({
  head: () => ({
    meta: [
      { title: "Bulk grading — ONYX" },
      { name: "description", content: "Grade submissions across assignments in one focused queue." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BulkGradingWorkspace,
});

type BulkRow = AssignmentQueueRow & {
  assignmentId: string;
  assignmentTitle: string;
  className: string;
  maxMarks: number;
};

function BulkGradingWorkspace() {
  const { effectiveRole } = useViewRole();
  const canGrade = effectiveRole === "teacher" || effectiveRole === "admin";
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set());

  const queue = useQuery({
    queryKey: ["grading", "bulk-queue"],
    enabled: canGrade,
    queryFn: async () => {
      const overview = await getGradingOverview();
      const groups = overview.assignments.filter((a) => a.waiting > 0);
      const queues = await Promise.all(
        groups.map(async (group) => ({
          group,
          queue: await getAssignmentGradingQueue({ data: { assignmentId: group.id } }),
        })),
      );
      return queues.flatMap(({ group, queue: assignmentQueue }) =>
        assignmentQueue.rows
          .filter((row) => row.status === "submitted" || row.status === "late")
          .map((row) => ({
            ...row,
            assignmentId: group.id,
            assignmentTitle: group.title,
            className: group.class_name,
            maxMarks: assignmentQueue.assignment.max_marks,
          })),
      ).sort((a, b) =>
        new Date(a.submitted_at ?? 0).getTime() - new Date(b.submitted_at ?? 0).getTime(),
      ) as BulkRow[];
    },
    refetchOnMount: "always",
  });

  const rows = queue.data ?? [];
  const remaining = useMemo(() => rows.filter((row) => !completedIds.has(row.submission_id)), [rows, completedIds]);
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return remaining;
    return remaining.filter((row) =>
      [row.student_name, row.assignmentTitle, row.className].some((value) =>
        value.toLocaleLowerCase().includes(term),
      ),
    );
  }, [remaining, search]);
  const selected = visible.find((row) => row.submission_id === selectedId) ?? visible[0] ?? null;

  if (!canGrade) {
    return <div className="panel p-8 text-center text-muted-foreground">Bulk grading is available to teachers only.</div>;
  }

  if (queue.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-96 w-full rounded-xl" /></div>;
  }

  if (queue.isError) {
    return (
      <div className="panel space-y-3 p-6 text-center">
        <p className="font-medium">Couldn’t load the bulk grading queue.</p>
        <p className="text-sm text-muted-foreground">{queue.error instanceof Error ? queue.error.message : "Please try again."}</p>
        <Button variant="outline" onClick={() => void queue.refetch()}>Try again</Button>
      </div>
    );
  }

  const markDone = () => {
    if (!selected) return;
    setCompletedIds((current) => new Set(current).add(selected.submission_id));
    const index = visible.findIndex((row) => row.submission_id === selected.submission_id);
    const next = visible[index + 1] ?? visible[index - 1];
    setSelectedId(next?.submission_id);
  };

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <Link to="/grading" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to grading
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Bulk grading</h1>
            <p className="mt-1 text-sm text-muted-foreground">Work through submissions across assignments, one student at a time.</p>
          </div>
          <div className="rounded-xl border border-border px-4 py-2.5">
            <p className="text-xs text-muted-foreground">Remaining in queue</p>
            <p className="text-xl font-semibold tabular-nums">{remaining.length}</p>
          </div>
        </div>
      </header>

      {remaining.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 p-10 text-center">
          <CheckCircle2 className="size-10 text-success" />
          <h2 className="text-lg font-semibold">You’re all caught up</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {rows.length ? "You’ve worked through every submission in this queue. Your saved grades remain saved." : "There are no submitted assignments waiting for a grade."}
          </p>
          <Button asChild variant="outline"><Link to="/grading">Return to grading</Link></Button>
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(250px,0.78fr)_minmax(0,1.6fr)]">
          <aside className="panel min-w-0 overflow-hidden">
            <div className="space-y-3 border-b border-border p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find student or assignment" className="pl-9" aria-label="Find student or assignment" />
              </div>
              <p className="text-xs text-muted-foreground">{visible.length} of {remaining.length} submissions · oldest first</p>
            </div>
            <div className="max-h-[65vh] overflow-y-auto">
              {visible.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No matching submissions. Try another search.</p>
              ) : visible.map((row) => (
                <button
                  key={row.submission_id}
                  type="button"
                  onClick={() => setSelectedId(row.submission_id)}
                  className={cn(
                    "block w-full border-b border-border/60 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                    selected?.submission_id === row.submission_id && "bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">{row.student_name}</span>
                    {row.is_late && <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning-foreground">Late</span>}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{row.assignmentTitle}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{row.className}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0 space-y-3">
            {selected ? (
              <>
                <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Now grading</p>
                    <h2 className="truncate font-semibold">{selected.student_name}</h2>
                    <p className="truncate text-sm text-muted-foreground">{selected.assignmentTitle} · {selected.className}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-4" /> {selected.maxMarks} marks possible
                  </div>
                </div>
                <AssignmentGradePanel
                  key={selected.submission_id}
                  submissionId={selected.submission_id}
                  maxMarks={selected.maxMarks}
                  hasNext={visible.length > 1}
                  onDone={markDone}
                  onSkip={() => {
                    const index = visible.findIndex((row) => row.submission_id === selected.submission_id);
                    setSelectedId((visible[index + 1] ?? visible[index - 1])?.submission_id);
                  }}
                />
              </>
            ) : (
              <div className="panel p-8 text-center text-sm text-muted-foreground">Choose a submission from the queue.</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
