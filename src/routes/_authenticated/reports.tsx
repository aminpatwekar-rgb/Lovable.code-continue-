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
import { getStudentProgressAnalytics } from "@/lib/progress-analytics.functions";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const db = supabase as any;

function averageScore(points: Array<{ scorePct: number }>): number | null {
  return points.length
    ? Math.round((points.reduce((total, point) => total + point.scorePct, 0) / points.length) * 10) / 10
    : null;
}

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
  const [analyticsPeriod, setAnalyticsPeriod] = useState("all");

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

  const getProgressAnalytics = useServerFn(getStudentProgressAnalytics);
  const progressAnalytics = useQuery({
    queryKey: ["progress-report-analytics", target, classId],
    enabled: isTeacher && Boolean(classId) && Boolean(target),
    queryFn: () => getProgressAnalytics({ data: { classId, studentId: target! } }),
  });

  const analyticsData = progressAnalytics.data;
  const analyticsCutoff = analyticsPeriod === "all"
    ? 0
    : Date.now() - (analyticsPeriod === "30d" ? 30 : 90) * 24 * 60 * 60 * 1000;
  const visibleTrend = (analyticsData?.trend ?? []).filter((point) =>
    analyticsCutoff === 0 || new Date(point.date).getTime() >= analyticsCutoff
  );
  const selectedStudentAverage = averageScore(visibleTrend);
  const selectedClassAverage = averageScore(
    visibleTrend
      .filter((point) => point.classAveragePct != null)
      .map((point) => ({ scorePct: point.classAveragePct! })),
  );
  const trendSplit = Math.floor(visibleTrend.length / 2);
  const earlyAverage = averageScore(visibleTrend.slice(0, trendSplit));
  const recentAverage = averageScore(visibleTrend.slice(trendSplit));
  const improvementDelta = visibleTrend.length >= 4 && earlyAverage != null && recentAverage != null
    ? Math.round((recentAverage - earlyAverage) * 10) / 10
    : null;
  const assessmentBars = visibleTrend.slice(-8).map((point) => ({
    ...point,
    label: `${point.title.slice(0, 15)} · ${new Date(point.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
  }));
  const assignmentStatusData = analyticsData ? [
    { name: "Submitted on time", value: Math.max(0, analyticsData.assignmentsSubmitted - analyticsData.lateSubmissions), fill: "#16a34a" },
    { name: "Late", value: analyticsData.lateSubmissions, fill: "#f59e0b" },
    { name: "Not submitted", value: Math.max(0, analyticsData.assignmentCount - analyticsData.assignmentsSubmitted), fill: "#cbd5e1" },
  ].filter((item) => item.value > 0) : [];
  const attendancePct = Number(report.data?.["attendance_percentage"] ?? 0);
  const teacherInsights: string[] = [];
  if (analyticsData) {
    if (improvementDelta == null) {
      teacherInsights.push("More graded assessment results are needed to estimate a reliable improvement trend.");
    } else if (improvementDelta >= 2) {
      teacherInsights.push(`Scores are trending upward by ${improvementDelta.toFixed(1)} percentage points between the earlier and recent halves of this period.`);
    } else if (improvementDelta <= -2) {
      teacherInsights.push(`Recent scores are lower by ${Math.abs(improvementDelta).toFixed(1)} percentage points compared with the earlier half. Review feedback and workload with the student.`);
    } else {
      teacherInsights.push("Scores are broadly steady across the selected period.");
    }
    if (selectedClassAverage != null && selectedStudentAverage != null) {
      const gap = Math.round((selectedStudentAverage - selectedClassAverage) * 10) / 10;
      if (gap <= -8) teacherInsights.push(`The student's average is ${Math.abs(gap).toFixed(1)} points below the class average. Consider a focused check-in on the topics covered by lower-scoring assessments.`);
      else if (gap >= 8) teacherInsights.push(`The student's average is ${gap.toFixed(1)} points above the class average; review whether additional challenge would be useful.`);
      else teacherInsights.push("Overall performance is close to the class average.");
    }
    if (analyticsData.assignmentCount > analyticsData.assignmentsSubmitted) {
      teacherInsights.push(`${analyticsData.assignmentCount - analyticsData.assignmentsSubmitted} published assignment(s) have no recorded submission yet.`);
    }
    if (analyticsData.lateSubmissions > 0) {
      teacherInsights.push(`${analyticsData.lateSubmissions} assignment(s) are marked late; check for recurring deadline or workload barriers.`);
    }
  }
  if (Number(report.data?.["attendance_total"] ?? 0) > 0 && attendancePct < 75) {
    teacherInsights.push(`Recorded attendance is ${attendancePct.toFixed(1)}%. Check the institution's attendance policy and the underlying records before intervening.`);
  }

  const exportProgressAnalytics = () => {
    if (!analyticsData) return;
    downloadCsv(
      `onyx-student-analytics-${target}.csv`,
      toCsv(
        ["Date", "Assessment", "Type", "Student score (%)", "Class average (%)"],
        visibleTrend.map((item) => [
          new Date(item.date).toLocaleDateString(),
          item.title,
          item.type,
          item.scorePct,
          item.classAveragePct ?? "",
        ]),
      ),
    );
  };

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
        <Select value={classId} onValueChange={value => { setClassId(value); setStudentId(""); weaknessInsights.reset(); }}>
          <SelectTrigger className="w-60"><SelectValue placeholder="Select class" /></SelectTrigger>
          <SelectContent>{(classes.data ?? []).map((item: any) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
        </Select>
        {isTeacher && <Select value={studentId || roster.data?.[0]?.student_id || ""} onValueChange={value => { setStudentId(value); weaknessInsights.reset(); }}>
          <SelectTrigger className="w-60"><SelectValue placeholder="Select student" /></SelectTrigger>
          <SelectContent>{(roster.data ?? []).map((item: any) => <SelectItem key={item.student_id} value={item.student_id}>{item.full_name || "Student"}</SelectItem>)}</SelectContent>
        </Select>}
      </div>

      {!target ? <div className="panel p-8 text-center text-sm text-muted-foreground">Select a class to generate a report.</div>
        : report.isLoading ? <div className="panel p-8">Generating report…</div>
        : report.isError ? <div className="panel flex flex-wrap items-center justify-between gap-3 p-5 text-sm"><p role="alert" className="text-destructive">Progress report couldn't be loaded. Please retry.</p><Button size="sm" variant="outline" onClick={() => void report.refetch()} disabled={report.isFetching}>{report.isFetching ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Retry report</Button></div>
        : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(report.data ?? {}).map(([key, value]) => <div className="panel p-5" key={key}>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{key.replaceAll("_", " ")}</p>
            <p className="mt-2 text-2xl font-semibold">{String(value)}</p>
          </div>)}
        </div>}

      {isTeacher && classId && target && <section className="panel space-y-5 p-5 print:hidden">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpenCheck className="size-5" /> Student improvement analytics</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Compare this student's graded assignment and best completed quiz results over time with the selected class. Retakes are not counted repeatedly in average scores.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={analyticsPeriod} onValueChange={setAnalyticsPeriod}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Time period" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportProgressAnalytics} disabled={!visibleTrend.length}>
              <Download className="mr-2 size-4" />Export analytics CSV
            </Button>
          </div>
        </header>

        {progressAnalytics.isLoading ? <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">Calculating assessment trends…</div>
          : progressAnalytics.isError ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4 text-sm">
            <p role="alert" className="text-destructive">Student analytics couldn't be loaded. Please retry.</p>
            <Button size="sm" variant="outline" onClick={() => void progressAnalytics.refetch()} disabled={progressAnalytics.isFetching}>
              {progressAnalytics.isFetching ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Retry analytics
            </Button>
          </div>
          : analyticsData && <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">Overall assessment average</p>
                <p className="mt-1 text-2xl font-semibold">{selectedStudentAverage == null ? "—" : `${selectedStudentAverage.toFixed(1)}%`}</p>
                <p className="mt-1 text-xs text-muted-foreground">{visibleTrend.length} scored assessment(s) in this period</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">Improvement in selected period</p>
                <p className="mt-1 text-2xl font-semibold">{improvementDelta == null ? "—" : `${improvementDelta > 0 ? "+" : ""}${improvementDelta.toFixed(1)} pp`}</p>
                <p className="mt-1 text-xs text-muted-foreground">{improvementDelta == null ? "Need at least 4 scored assessments" : "Recent half vs earlier half"}</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">Difference from class average</p>
                <p className="mt-1 text-2xl font-semibold">{selectedStudentAverage == null || selectedClassAverage == null ? "—" : `${selectedStudentAverage - selectedClassAverage > 0 ? "+" : ""}${(selectedStudentAverage - selectedClassAverage).toFixed(1)} pp`}</p>
                <p className="mt-1 text-xs text-muted-foreground">Student average minus class average</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">Assignment completion</p>
                <p className="mt-1 text-2xl font-semibold">{analyticsData.assignmentCompletionPct.toFixed(1)}%</p>
                <p className="mt-1 text-xs text-muted-foreground">{analyticsData.assignmentsSubmitted} of {analyticsData.assignmentCount} published assignments submitted</p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-border p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold">Performance trend</h3>
                  <p className="text-xs text-muted-foreground">Best scored result per assessment, in date order</p>
                </div>
                {visibleTrend.length < 2 ? <p className="rounded-md bg-muted/30 p-4 text-sm text-muted-foreground">At least two scored assessments in this period are needed to plot a trend.</p> : (
                  <ResponsiveContainer width="100%" height={285}>
                    <LineChart data={visibleTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" interval={0} angle={-28} textAnchor="end" height={74} tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} width={42} />
                      <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                      <Legend />
                      <Line type="monotone" dataKey="scorePct" name="Student score" stroke="#6d5efc" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="classAveragePct" name="Class average" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="min-w-0 rounded-lg border border-border p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold">Assessment comparison</h3>
                  <p className="text-xs text-muted-foreground">Student score compared with the class mean, for the latest 8 assessments</p>
                </div>
                {!assessmentBars.length ? <p className="rounded-md bg-muted/30 p-4 text-sm text-muted-foreground">No scored assessments fall within this period.</p> : (
                  <ResponsiveContainer width="100%" height={285}>
                    <BarChart data={assessmentBars} margin={{ top: 8, right: 8, bottom: 36, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" interval={0} angle={-32} textAnchor="end" height={76} tick={{ fontSize: 9 }} />
                      <YAxis domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} width={42} />
                      <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                      <Legend />
                      <Bar dataKey="scorePct" name="Student score" fill="#6d5efc" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="classAveragePct" name="Class average" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="min-w-0 rounded-lg border border-border p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold">Assignment completion breakdown</h3>
                  <p className="text-xs text-muted-foreground">Published assignment status for this class</p>
                </div>
                {!assignmentStatusData.length ? <p className="rounded-md bg-muted/30 p-4 text-sm text-muted-foreground">No published assignments are available for this class.</p> : (
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart>
                      <Pie data={assignmentStatusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={3}>
                        {assignmentStatusData.map((item) => <Cell key={item.name} fill={item.fill} />)}
                      </Pie>
                      <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="min-w-0 rounded-lg border border-border p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold">Teacher review signals</h3>
                  <p className="text-xs text-muted-foreground">Evidence-based prompts to guide a conversation, not automatic judgements</p>
                </div>
                {teacherInsights.length ? <ul className="space-y-2">
                  {teacherInsights.map((insight, index) => <li key={index} className="flex gap-2 rounded-md bg-muted/30 p-3 text-sm">
                    <span className="mt-0.5 text-muted-foreground">•</span><span>{insight}</span>
                  </li>)}
                </ul> : <p className="rounded-md bg-muted/30 p-4 text-sm text-muted-foreground">No additional review signals are available yet.</p>}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Assignment average</p>
                    <p className="mt-1 text-lg font-semibold">{analyticsData.assignmentAveragePct == null ? "—" : `${analyticsData.assignmentAveragePct.toFixed(1)}%`}</p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Quiz best-score average</p>
                    <p className="mt-1 text-lg font-semibold">{analyticsData.quizAveragePct == null ? "—" : `${analyticsData.quizAveragePct.toFixed(1)}%`}</p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Quizzes attempted</p>
                    <p className="mt-1 text-lg font-semibold">{analyticsData.quizzesAttempted} / {analyticsData.quizCount}</p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">Attendance</p>
                    <p className="mt-1 text-lg font-semibold">{report.data?.["attendance_total"] == null ? "—" : `${attendancePct.toFixed(1)}%`}</p>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Class averages use available graded results. A missing point means no score is recorded for that assessment. Attendance and review signals should be checked against the institution's policy and source records.</p>
          </>}
      </section>}

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
        {weaknessInsights.isError && <div className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p role="alert">{(weaknessInsights.error as Error).message || "Learning insights could not be generated."}</p><Button size="sm" variant="outline" onClick={() => weaknessInsights.mutate()} disabled={!target || weaknessInsights.isPending}>Retry analysis</Button></div>}
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
