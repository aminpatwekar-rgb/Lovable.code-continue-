import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, Download, Loader2, Printer, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { PlanGate } from "@/components/PlanGate";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCsv, toCsv } from "@/lib/csv";
import { getAssessmentIntegrityReport, getStudentWeaknessInsights } from "@/lib/differentiation.functions";

const db = supabase as any;

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Progress Reports — ONYX" }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const { effectiveRole } = useViewRole();
  const isTeacher = effectiveRole === "teacher" || effectiveRole === "admin";
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");

  const classes = useQuery({
    queryKey: ["report-classes", user?.id, isTeacher],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!isTeacher) {
        const q = await db.from("class_members").select("class_id, classes(id, name)").eq("student_id", user!.id);
        if (q.error) throw q.error;
        return (q.data ?? []).map((item: any) => item.classes).filter(Boolean);
      }
      const [owned, coTaught] = await Promise.all([
        db.from("classes").select("id, name").eq("teacher_id", user!.id).eq("archived", false).order("name"),
        db.from("class_members").select("class_id, classes(id, name)").eq("student_id", user!.id).eq("member_role", "teacher"),
      ]);
      if (owned.error) throw owned.error;
      if (coTaught.error) throw coTaught.error;
      const unique = new Map<string, any>();
      for (const item of owned.data ?? []) unique.set(item.id, item);
      for (const item of coTaught.data ?? []) {
        if (item.classes?.id) unique.set(item.classes.id, item.classes);
      }
      return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const roster = useQuery({
    queryKey: ["report-roster", classId],
    enabled: isTeacher && Boolean(classId),
    queryFn: async () => {
      const q = await db.from("class_members").select("student_id, full_name").eq("class_id", classId).eq("member_role", "student").order("full_name");
      if (q.error) throw q.error;
      return q.data ?? [];
    },
  });

  const target = isTeacher ? (studentId || roster.data?.[0]?.student_id) : user?.id;
  const report = useQuery({
    queryKey: ["progress-report", target, classId],
    enabled: Boolean(target),
    queryFn: async () => {
      const q = await db.rpc("get_progress_report", { _student_id: target, _class_id: classId || null });
      if (q.error) throw q.error;
      return q.data as Record<string, unknown>;
    },
  });

  const getWeaknessInsights = useServerFn(getStudentWeaknessInsights);
  const weaknessInsights = useMutation({
    mutationFn: () => {
      if (!classId || !target) throw new Error("Select a class and student first.");
      return getWeaknessInsights({ data: { classId, studentId: target } });
    },
  });

  const getIntegrityReport = useServerFn(getAssessmentIntegrityReport);
  const integrity = useQuery({
    queryKey: ["integrity-report", classId],
    enabled: isTeacher && Boolean(classId),
    queryFn: () => getIntegrityReport({ data: { classId } }),
  });

  const exportReport = () => {
    if (!report.data) return;
    downloadCsv(`onyx-progress-${target}.csv`, toCsv(["Metric", "Value"], Object.entries(report.data)));
  };
  const exportIntegrity = () => {
    const alerts = integrity.data?.alerts ?? [];
    downloadCsv(
      `onyx-assessment-review-${classId}.csv`,
      toCsv(
        ["Type", "Student", "Assessment", "Details", "Occurred at"],
        alerts.map((item) => [item.kind, item.studentName, item.activityName, item.details, item.occurredAt]),
      ),
    );
  };

  return <PlanGate feature="progress_reports">
    <div className="space-y-6 print:space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Progress Reports</h1>
          <p className="text-sm text-muted-foreground">Real assignment progress calculated from ONYX records.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 size-4" />Print</Button>
          <Button variant="outline" onClick={exportReport} disabled={!report.data}><Download className="mr-2 size-4" />CSV</Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        <Select value={classId} onValueChange={value => { setClassId(value); setStudentId(""); }}>
          <SelectTrigger className="w-60"><SelectValue placeholder="Select class" /></SelectTrigger>
          <SelectContent>{(classes.data ?? []).map((item: any) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
        </Select>
        {isTeacher && <Select value={studentId || roster.data?.[0]?.student_id || ""} onValueChange={setStudentId}>
          <SelectTrigger className="w-60"><SelectValue placeholder="Select student" /></SelectTrigger>
          <SelectContent>{(roster.data ?? []).map((item: any) => <SelectItem key={item.student_id} value={item.student_id}>{item.full_name || "Student"}</SelectItem>)}</SelectContent>
        </Select>}
      </div>

      {!target ? <div className="panel p-8 text-center text-sm text-muted-foreground">Select a class to generate a report.</div>
        : report.isLoading ? <div className="panel p-8">Generating report…</div>
        : report.isError ? <div className="panel p-5 text-sm text-destructive">Progress report couldn't be loaded. Please retry.</div>
        : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(report.data ?? {}).map(([key, value]) => <div className="panel p-5" key={key}>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{key.replaceAll("_", " ")}</p>
            <p className="mt-2 text-2xl font-semibold">{String(value)}</p>
          </div>)}
        </div>}

      {isTeacher && classId && <section className="panel space-y-4 p-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpenCheck className="size-5" /> Learning insights</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Summarizes this student's completed quiz results and question types with lower observed accuracy. It is a study-support signal, not a diagnosis or a final judgement of ability. Results depend on how many questions have been graded.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => weaknessInsights.mutate()}
            disabled={!target || weaknessInsights.isPending}
          >
            {weaknessInsights.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <BookOpenCheck className="mr-2 size-4" />}
            {weaknessInsights.isPending ? "Analyzing…" : "Generate learning insights"}
          </Button>
        </header>
        {weaknessInsights.isError && <p role="alert" className="text-sm text-destructive">{(weaknessInsights.error as Error).message}</p>}
        {weaknessInsights.data && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Quizzes available</p><p className="mt-1 text-2xl font-semibold">{weaknessInsights.data.quizzesAvailable}</p></div>
              <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Quizzes completed</p><p className="mt-1 text-2xl font-semibold">{weaknessInsights.data.quizzesCompleted}</p></div>
              <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Average completed score</p><p className="mt-1 text-2xl font-semibold">{weaknessInsights.data.averagePct == null ? "—" : `${weaknessInsights.data.averagePct}%`}</p></div>
              <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Incorrect graded responses</p><p className="mt-1 text-2xl font-semibold">{weaknessInsights.data.weakQuestionCount}</p></div>
            </div>
            {weaknessInsights.data.quizzesCompleted === 0 ? (
              <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No completed quiz attempts are available for this student yet.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Accuracy by question type</h3>
                  {weaknessInsights.data.questionTypes.length === 0 ? <p className="text-sm text-muted-foreground">No answered and graded question data is available yet.</p> : (
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-sm">
                        <thead className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="p-2.5">Question type</th><th className="p-2.5 text-right">Graded</th><th className="p-2.5 text-right">Accuracy</th></tr></thead>
                        <tbody className="divide-y divide-border">
                          {weaknessInsights.data.questionTypes.map((item) => <tr key={item.type}><td className="p-2.5 capitalize">{item.type}</td><td className="p-2.5 text-right tabular-nums">{item.graded}</td><td className="p-2.5 text-right tabular-nums">{item.accuracyPct == null ? "—" : `${item.accuracyPct}%`}</td></tr>)}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Questions to revisit</h3>
                  {weaknessInsights.data.weakQuestions.length === 0 ? <p className="text-sm text-muted-foreground">No incorrect graded responses were identified in the available attempts.</p> : (
                    <ul className="max-h-80 space-y-2 overflow-y-auto">
                      {weaknessInsights.data.weakQuestions.map((item) => <li key={item.questionId} className="rounded-lg border border-border p-3">
                        <p className="text-xs text-muted-foreground">{item.quizTitle} · {item.questionType}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{item.prompt}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{item.awardedPoints == null ? "Not scored" : `${item.awardedPoints} / ${item.maxPoints} points`}</p>
                      </li>)}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>}

      {isTeacher && classId && <section className="panel space-y-4 p-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldAlert className="size-5" /> Assessment integrity review</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Shows recorded paste warnings, locked quiz attempts, manual-review attempts and late submissions. Alerts are review cues, not proof of misconduct; never use them alone to determine grades or discipline.
            </p>
          </div>
          <Button variant="outline" onClick={exportIntegrity} disabled={!integrity.data?.alerts.length}><Download className="mr-2 size-4" />Export review CSV</Button>
        </header>
        {integrity.isLoading ? <p className="text-sm text-muted-foreground">Loading recorded events…</p>
          : integrity.isError ? <div className="space-y-2 text-sm text-destructive">
            <p>Integrity records couldn't be loaded.</p>
            <Button size="sm" variant="outline" onClick={() => void integrity.refetch()}>Retry</Button>
          </div>
          : <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Paste warnings</p><p className="mt-1 text-2xl font-semibold">{integrity.data?.pasteWarnings ?? 0}</p></div>
              <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Students with warnings</p><p className="mt-1 text-2xl font-semibold">{integrity.data?.studentsWithPasteWarnings ?? 0}</p></div>
              <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Locked attempts</p><p className="mt-1 text-2xl font-semibold">{integrity.data?.lockedAttempts ?? 0}</p></div>
              <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Late submissions</p><p className="mt-1 text-2xl font-semibold">{integrity.data?.lateSubmissions ?? 0}</p></div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border px-2.5 py-1">Manual review needed: {integrity.data?.manualReviewAttempts ?? 0}</span>
              <span className="rounded-full border border-border px-2.5 py-1">Showing up to 50 recent events</span>
            </div>
            {!integrity.data?.alerts.length ? <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No matching integrity or deadline events are recorded for this class.</p>
              : <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[50rem] text-sm">
                  <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="p-3 font-medium">Type</th><th className="p-3 font-medium">Student</th><th className="p-3 font-medium">Assessment</th><th className="p-3 font-medium">Details</th><th className="p-3 font-medium">Occurred</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {integrity.data.alerts.map((item, index) => <tr key={`${item.kind}-${item.occurredAt}-${index}`}>
                      <td className="p-3 capitalize">{item.kind.replaceAll("_", " ")}</td><td className="p-3">{item.studentName}</td>
                      <td className="p-3">{item.activityName}</td><td className="p-3 text-muted-foreground">{item.details}</td>
                      <td className="p-3 text-muted-foreground">{item.occurredAt ? new Date(item.occurredAt).toLocaleString() : "—"}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>}
          </>}
      </section>}
    </div>
  </PlanGate>;
}
