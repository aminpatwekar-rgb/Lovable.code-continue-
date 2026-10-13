import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, Download, Loader2, Printer, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { Button } from "@/components/ui/button";
import { PlanGate } from "@/components/PlanGate";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCsv, toCsv } from "@/lib/csv";
import { getStudentWeaknessInsights } from "@/lib/differentiation.functions";

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
      const q = isTeacher
        ? await db.from("classes").select("id, name").eq("teacher_id", user!.id).eq("archived", false).order("name")
        : await db.from("class_members").select("class_id, classes(id, name)").eq("student_id", user!.id);
      if (q.error) throw q.error;
      return (q.data ?? []).map((x: any) => isTeacher ? x : x.classes).filter(Boolean);
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

  const integrity = useQuery({
    queryKey: ["integrity-report", classId],
    enabled: isTeacher && Boolean(classId),
    queryFn: async () => {
      const assignmentsResult = await db.from("assignments").select("id, title").eq("class_id", classId);
      if (assignmentsResult.error) throw assignmentsResult.error;
      const assignments = assignmentsResult.data ?? [];
      if (!assignments.length) return { rows: [], events: [] };
      const ids = assignments.map((item: any) => item.id);
      const submissionsResult = await db.from("submissions")
        .select("id, student_id, assignment_id, status, submitted_at, paste_violation_count")
        .in("assignment_id", ids)
        .order("submitted_at", { ascending: false });
      if (submissionsResult.error) throw submissionsResult.error;
      const submissionRows = submissionsResult.data ?? [];
      const submissionIds = submissionRows.map((item: any) => item.id);
      let eventRows: any[] = [];
      if (submissionIds.length) {
        const eventsResult = await db.from("paste_violations")
          .select("id, submission_id, kind, occurred_at")
          .in("submission_id", submissionIds)
          .order("occurred_at", { ascending: false });
        if (eventsResult.error) throw eventsResult.error;
        eventRows = eventsResult.data ?? [];
      }
      const names = new Map<string, string>((roster.data ?? []).map((item: any) => [item.student_id, item.full_name || "Student"]));
      const titles = new Map<string, string>(assignments.map((item: any) => [item.id, item.title || "Assignment"]));
      const eventsBySubmission = new Map<string, any[]>();
      for (const event of eventRows) {
        const list = eventsBySubmission.get(event.submission_id) ?? [];
        list.push(event);
        eventsBySubmission.set(event.submission_id, list);
      }
      const rows = submissionRows.map((submission: any) => ({
        submission_id: submission.id,
        student: names.get(submission.student_id) ?? "Student",
        assignment: titles.get(submission.assignment_id) ?? "Assignment",
        submitted_at: submission.submitted_at,
        status: submission.status,
        recorded_count: Number(submission.paste_violation_count) || 0,
        event_count: (eventsBySubmission.get(submission.id) ?? []).length,
        event_types: [...new Set((eventsBySubmission.get(submission.id) ?? []).map((event: any) => event.kind))].join(", "),
      }));
      return { rows, events: eventRows };
    },
  });

  const flaggedRows = useMemo(
    () => (integrity.data?.rows ?? []).filter((row: any) => row.recorded_count > 0 || row.event_count > 0),
    [integrity.data],
  );

  const exportReport = () => {
    if (!report.data) return;
    downloadCsv(`onyx-progress-${target}.csv`, toCsv(["Metric", "Value"], Object.entries(report.data)));
  };
  const exportIntegrity = () => {
    downloadCsv(
      `onyx-assessment-review-${classId}.csv`,
      toCsv(
        ["Student", "Assignment", "Submitted at", "Status", "Recorded warning count", "Event count", "Event types"],
        flaggedRows.map((row: any) => [row.student, row.assignment, row.submitted_at, row.status, row.recorded_count, row.event_count, row.event_types]),
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
              Displays recorded blocked copy/paste warnings for teacher review. A warning is not proof of misconduct and must not automatically affect grades or trigger disciplinary action.
            </p>
          </div>
          <Button variant="outline" onClick={exportIntegrity} disabled={!flaggedRows.length}><Download className="mr-2 size-4" />Export review CSV</Button>
        </header>
        {integrity.isLoading ? <p className="text-sm text-muted-foreground">Loading recorded events…</p>
          : integrity.isError ? <div className="space-y-2 text-sm text-destructive">
            <p>Integrity records couldn't be loaded.</p>
            <Button size="sm" variant="outline" onClick={() => void integrity.refetch()}>Retry</Button>
          </div>
          : <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Submissions checked</p><p className="mt-1 text-2xl font-semibold">{integrity.data?.rows.length ?? 0}</p></div>
              <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">With recorded warnings</p><p className="mt-1 text-2xl font-semibold">{flaggedRows.length}</p></div>
              <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Recorded events</p><p className="mt-1 text-2xl font-semibold">{integrity.data?.events.length ?? 0}</p></div>
            </div>
            {!flaggedRows.length ? <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No blocked copy/paste warnings are recorded for this class.</p>
              : <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[46rem] text-sm">
                  <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="p-3 font-medium">Student</th><th className="p-3 font-medium">Assignment</th><th className="p-3 font-medium">Submitted</th><th className="p-3 font-medium">Warnings</th><th className="p-3 font-medium">Recorded event types</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {flaggedRows.map((row: any) => <tr key={row.submission_id}>
                      <td className="p-3">{row.student}</td><td className="p-3">{row.assignment}</td>
                      <td className="p-3 text-muted-foreground">{row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "—"}</td>
                      <td className="p-3 tabular-nums">{row.recorded_count || row.event_count}</td>
                      <td className="p-3 text-muted-foreground">{row.event_types || "No event detail recorded"}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>}
          </>}
      </section>}
    </div>
  </PlanGate>;
}
