import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadCsv, toCsv } from "@/lib/csv";
import { getInstitutionInsights } from "@/lib/institution-insights.functions";

type Focus = "reports" | "grading" | "quizzes";

const COPY: Record<Focus, { title: string; blurb: string }> = {
  reports: { title: "Institution reports", blurb: "Released results and activity across every class in your institution." },
  grading: { title: "Grading across the institution", blurb: "How much student work is waiting for teachers to mark, class by class." },
  quizzes: { title: "Quiz results across the institution", blurb: "Published quizzes, attempts and average scores for every class." },
};

const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

/** Read-only institution-wide view shown to institution admins on Reports, Grading and Quizzes. */
export function InstitutionInsightsView({ focus }: { focus: Focus }) {
  const fetchInsights = useServerFn(getInstitutionInsights);
  const q = useQuery({ queryKey: ["institution-insights"], queryFn: () => fetchInsights(), staleTime: 30_000 });
  const copy = COPY[focus];

  if (q.isLoading) return <div className="space-y-3"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (q.isError || !q.data) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <p>{(q.error as Error)?.message || "Institution data could not be loaded."}</p>
        <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Retry</Button>
      </div>
    );
  }
  const { totals, classes, institutionName } = q.data;

  const stats =
    focus === "grading"
      ? [["Submitted work", totals.submitted], ["Waiting to grade", totals.waitingToGrade], ["Graded", totals.graded], ["Results released", totals.released]]
      : focus === "quizzes"
        ? [["Published quizzes", totals.quizzes], ["Attempts", totals.quizAttempts], ["Average quiz score", pct(totals.quizAvgPct)], ["Classes", totals.classes]]
        : [["Classes", totals.classes], ["Students", totals.students], ["Assignments", totals.assignments], ["Average released result", pct(totals.avgReleasedPct)]];

  const exportCsv = () =>
    downloadCsv(
      `onyx-${focus}-institution.csv`,
      toCsv(
        ["Class", "Department", "Teacher", "Students", "Assignments", "Submitted", "Waiting to grade", "Graded", "Released", "Avg released %", "Quizzes", "Quiz attempts", "Avg quiz %"],
        classes.map((c) => [c.name, c.departmentName ?? "", c.teacherName, c.students, c.assignments, c.submitted, c.waitingToGrade, c.graded, c.released, c.avgReleasedPct ?? "", c.quizzes, c.quizAttempts, c.quizAvgPct ?? ""]),
      ),
    );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"><Building2 className="size-3.5" />{institutionName}</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.blurb} Only results teachers have released are averaged.</p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!classes.length}>Export CSV</Button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([label, value]) => <Stat key={String(label)} label={String(label)} value={value as string | number} />)}
      </div>

      {classes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          No active classes belong to your institution yet. Classes appear here once teachers in your institution create them.
        </p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-3">Class</th><th className="p-3">Teacher</th>
                {focus === "grading" ? (<><th className="p-3">Submitted</th><th className="p-3">Waiting</th><th className="p-3">Graded</th><th className="p-3">Released</th></>)
                  : focus === "quizzes" ? (<><th className="p-3">Quizzes</th><th className="p-3">Attempts</th><th className="p-3">Avg score</th></>)
                  : (<><th className="p-3">Students</th><th className="p-3">Assignments</th><th className="p-3">Released</th><th className="p-3">Avg result</th></>)}
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="p-3">
                    <Link to="/classes/$classId" params={{ classId: c.id }} className="font-medium text-foreground hover:text-primary hover:underline">{c.name}</Link>
                    {c.departmentName && <p className="text-xs text-muted-foreground">{c.departmentName}</p>}
                  </td>
                  <td className="p-3 text-muted-foreground">{c.teacherName}</td>
                  {focus === "grading" ? (<><td className="p-3 tabular-nums">{c.submitted}</td><td className="p-3 tabular-nums">{c.waitingToGrade}</td><td className="p-3 tabular-nums">{c.graded}</td><td className="p-3 tabular-nums">{c.released}</td></>)
                    : focus === "quizzes" ? (<><td className="p-3 tabular-nums">{c.quizzes}</td><td className="p-3 tabular-nums">{c.quizAttempts}</td><td className="p-3 tabular-nums">{pct(c.quizAvgPct)}</td></>)
                    : (<><td className="p-3 tabular-nums">{c.students}</td><td className="p-3 tabular-nums">{c.assignments}</td><td className="p-3 tabular-nums">{c.released}</td><td className="p-3 tabular-nums">{pct(c.avgReleasedPct)}</td></>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
