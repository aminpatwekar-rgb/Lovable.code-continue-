import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Building2, CheckCircle2, Download, FileUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { bulkOnboardUsers } from "@/lib/admin.functions";
import { csvObjects, downloadCsv, toCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const db = supabase as any;

type InstitutionRollup = {
  name: string;
  students: number;
  teachers: number;
  admins: number;
  classes: number;
  assignments: number;
  recentSubmissions: number;
  recentToReview: number;
};

type DepartmentRollup = {
  name: string;
  classes: number;
  students: number;
  assignments: number;
  archived: number;
};

export function InstitutionReadiness() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const onboardFn = useServerFn(bulkOnboardUsers);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [activityFilter, setActivityFilter] = useState("");
  const isAdmin = role === "admin";

  const profiles = useQuery({
    enabled: isAdmin,
    queryKey: ["institution-readiness", "profiles"],
    queryFn: async () => {
      const [{ data: people, error: peopleError }, { data: roles, error: rolesError }] =
        await Promise.all([
          db.from("profiles").select("id, full_name, institution, created_at").order("created_at", { ascending: false }),
          db.from("user_roles").select("user_id, role"),
        ]);
      if (peopleError) throw peopleError;
      if (rolesError) throw rolesError;
      const byId = new Map<string, string[]>();
      for (const item of roles ?? []) {
        const list = byId.get(item.user_id) ?? [];
        list.push(item.role);
        byId.set(item.user_id, list);
      }
      return (people ?? []).map((person: any) => {
        const userRoles = byId.get(person.id) ?? [];
        return {
          ...person,
          institution: typeof person.institution === "string" ? person.institution.trim() : "",
          role: userRoles.includes("admin")
            ? "admin"
            : userRoles.includes("teacher")
              ? "teacher"
              : userRoles.includes("student")
                ? "student"
                : "unknown",
        };
      });
    },
  });

  const classes = useQuery({
    enabled: isAdmin,
    queryKey: ["institution-readiness", "classes"],
    queryFn: async () => {
      const { data, error } = await db
        .from("classes")
        .select("id, name, subject, archived, teacher_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const assignments = useQuery({
    enabled: isAdmin,
    queryKey: ["institution-readiness", "assignments"],
    queryFn: async () => {
      const { data, error } = await db
        .from("assignments")
        .select("id, class_id, teacher_id, title, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const memberships = useQuery({
    enabled: isAdmin,
    queryKey: ["institution-readiness", "memberships"],
    queryFn: async () => {
      const { data, error } = await db.from("class_members").select("class_id, student_id, member_role");
      if (error) throw error;
      return data ?? [];
    },
  });

  const submissions = useQuery({
    enabled: isAdmin,
    queryKey: ["institution-readiness", "submissions"],
    queryFn: async () => {
      const { data, error } = await db
        .from("submissions")
        .select("id, assignment_id, status, submitted_at, reviewed_at, student_id")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const onboardingRows = useMemo(() => {
    const seen = new Set<string>();
    return csvObjects(csv).map((row, index) => {
      const email = String(row.email ?? "").trim().toLowerCase();
      const accountRole = String(row.role ?? "").trim().toLowerCase();
      const institution = String(row.institution ?? "").trim();
      let issue = "";
      if (!/^\\S+@\\S+\\.\\S+$/.test(email)) issue = "Valid email required";
      else if (accountRole !== "student" && accountRole !== "teacher") issue = "Role must be student or teacher";
      else if (!institution) issue = "Institution / department required";
      else if (seen.has(email)) issue = "Duplicate email in CSV";
      if (email) seen.add(email);
      return { line: index + 2, email, role: accountRole, institution, issue };
    });
  }, [csv]);

  const onboard = useMutation({
    mutationFn: async () => onboardFn({ data: { csv } }),
    onSuccess: async (result) => {
      toast.success(`Updated ${result.updated} account${result.updated === 1 ? "" : "s"}; ${result.skipped} row${result.skipped === 1 ? "" : "s"} skipped.`);
      await qc.invalidateQueries({ queryKey: ["institution-readiness", "profiles"] });
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { institutionRows, departmentRows, recentActivity, institutionCount } = useMemo(() => {
    const people = profiles.data ?? [];
    const classRows = classes.data ?? [];
    const assignmentRows = assignments.data ?? [];
    const membershipRows = memberships.data ?? [];
    const submissionRows = submissions.data ?? [];
    const institutionForUser = new Map<string, string>(
      people.map((person: any) => [person.id, person.institution || "Unassigned institution"]),
    );
    const institutionMap = new Map<string, InstitutionRollup>();
    const getInstitution = (rawName: string) => {
      const name = rawName.trim() || "Unassigned institution";
      let group = institutionMap.get(name);
      if (!group) {
        group = { name, students: 0, teachers: 0, admins: 0, classes: 0, assignments: 0, recentSubmissions: 0, recentToReview: 0 };
        institutionMap.set(name, group);
      }
      return group;
    };
    for (const person of people as any[]) {
      const group = getInstitution(person.institution || "Unassigned institution");
      if (person.role === "student") group.students += 1;
      if (person.role === "teacher") group.teachers += 1;
      if (person.role === "admin") group.admins += 1;
    }
    for (const klass of classRows as any[]) {
      getInstitution(institutionForUser.get(klass.teacher_id) ?? "Unassigned institution").classes += 1;
    }
    for (const assignment of assignmentRows as any[]) {
      getInstitution(institutionForUser.get(assignment.teacher_id) ?? "Unassigned institution").assignments += 1;
    }
    const teacherByAssignment = new Map<string, string>(
      (assignmentRows as any[]).map((assignment) => [assignment.id, assignment.teacher_id]),
    );
    for (const submission of submissionRows as any[]) {
      const teacher = teacherByAssignment.get(submission.assignment_id);
      const group = getInstitution(institutionForUser.get(teacher ?? "") ?? "Unassigned institution");
      group.recentSubmissions += 1;
      if (submission.status === "submitted" || submission.status === "late") group.recentToReview += 1;
    }

    const studentsByClass = new Map<string, number>();
    for (const membership of membershipRows as any[]) {
      if (membership.member_role === "student") {
        studentsByClass.set(membership.class_id, (studentsByClass.get(membership.class_id) ?? 0) + 1);
      }
    }
    const departmentMap = new Map<string, DepartmentRollup>();
    const getDepartment = (rawName: string) => {
      const name = rawName.trim() || "Unassigned subject / department";
      let group = departmentMap.get(name);
      if (!group) {
        group = { name, classes: 0, students: 0, assignments: 0, archived: 0 };
        departmentMap.set(name, group);
      }
      return group;
    };
    for (const klass of classRows as any[]) {
      const group = getDepartment(String(klass.subject ?? ""));
      group.classes += 1;
      group.students += studentsByClass.get(klass.id) ?? 0;
      if (klass.archived) group.archived += 1;
      group.assignments += (assignmentRows as any[]).filter((assignment) => assignment.class_id === klass.id).length;
    }

    const teacherNames = new Map<string, string>(
      (people as any[]).map((person) => [person.id, person.full_name || "Account"]),
    );
    const events: { at: string; text: string }[] = [
      ...(people as any[]).map((person) => ({
        at: person.created_at,
        text: `${person.full_name || "Account"} registered (${person.role})`,
      })),
      ...(classRows as any[]).map((klass) => ({
        at: klass.created_at,
        text: `${teacherNames.get(klass.teacher_id) ?? "A teacher"} created class "${klass.name}"`,
      })),
      ...(assignmentRows as any[]).map((assignment) => ({
        at: assignment.created_at,
        text: `${teacherNames.get(assignment.teacher_id) ?? "A teacher"} created assignment "${assignment.title}"`,
      })),
      ...(submissionRows as any[]).filter((submission) => submission.submitted_at).map((submission) => ({
        at: submission.submitted_at,
        text: `A student submitted work (assignment ${submission.assignment_id})`,
      })),
      ...(submissionRows as any[]).filter((submission) => submission.reviewed_at).map((submission) => ({
        at: submission.reviewed_at,
        text: `A submission was reviewed (assignment ${submission.assignment_id})`,
      })),
    ].filter((event) => Boolean(event.at));
    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return {
      institutionRows: [...institutionMap.values()].sort((a, b) => b.students + b.teachers - a.students - a.teachers || a.name.localeCompare(b.name)),
      departmentRows: [...departmentMap.values()].sort((a, b) => b.classes - a.classes || a.name.localeCompare(b.name)),
      recentActivity: events.slice(0, 100),
      institutionCount: new Set((people as any[]).map((person) => person.institution?.trim()).filter(Boolean)).size,
    };
  }, [profiles.data, classes.data, assignments.data, memberships.data, submissions.data]);

  const filteredActivity = useMemo(() => {
    const query = activityFilter.trim().toLowerCase();
    return recentActivity.filter((item) => !query || item.text.toLowerCase().includes(query));
  }, [recentActivity, activityFilter]);

  const loading = profiles.isLoading || classes.isLoading || assignments.isLoading || memberships.isLoading || submissions.isLoading;

  if (!isAdmin) {
    return (
      <div className="panel p-5 text-sm text-muted-foreground">
        Institution analytics and bulk onboarding are available only to platform administrators.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-xl font-semibold">Institution readiness</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Organize existing ONYX accounts, review institution groupings, and monitor operational activity using real records.
        </p>
      </header>

      <section className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h3 className="flex items-center gap-2 font-semibold"><Building2 className="size-4" /> Bulk onboarding</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              CSV updates existing ONYX accounts only. It can assign student or teacher role and institution/department label, but does not create accounts, send invitations, or grant platform-admin access. Limit: 500 rows per import.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(
              "onyx-bulk-onboarding-template.csv",
              toCsv(["email", "role", "institution"], [
                ["student@example.com", "student", "Example College / SOES"],
                ["teacher@example.com", "teacher", "Example College / SOES"],
              ]),
            )}
          >
            <Download className="mr-2 size-4" /> CSV template
          </Button>
        </div>

        <label className="flex flex-wrap items-center gap-2 text-sm">
          <FileUp className="size-4 text-muted-foreground" />
          <span>Choose a CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="block max-w-full text-xs"
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              if (file.size > 2 * 1024 * 1024) {
                toast.error("CSV files must be 2 MB or smaller.");
                event.currentTarget.value = "";
                return;
              }
              try {
                setFileName(file.name);
                setCsv(await file.text());
              } catch {
                toast.error("Couldn't read that file. Try exporting it as UTF-8 CSV.");
              } finally {
                event.currentTarget.value = "";
              }
            }}
          />
        </label>
        {fileName && <p className="text-xs text-muted-foreground">Loaded: {fileName}</p>}
        <Textarea
          value={csv}
          onChange={(event) => { setCsv(event.target.value); setFileName(""); }}
          className="min-h-40 font-mono text-xs"
          placeholder={"email,role,institution\nstudent@example.com,student,Example College / SOES\nteacher@example.com,teacher,Example College / SOES"}
          aria-label="Bulk onboarding CSV"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {onboardingRows.length} row{onboardingRows.length === 1 ? "" : "s"} · {onboardingRows.filter((row) => !row.issue).length} valid preview · {onboardingRows.filter((row) => row.issue).length} flagged
          </p>
          <Button
            type="button"
            disabled={!csv.trim() || !onboardingRows.length || onboard.isPending}
            onClick={() => onboard.mutate()}
          >
            {onboard.isPending ? "Updating accounts…" : <><Upload className="mr-2 size-4" />Validate &amp; onboard</>}
          </Button>
        </div>
        {onboardingRows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-2.5 font-medium">Row</th><th className="p-2.5 font-medium">Email</th>
                  <th className="p-2.5 font-medium">Role</th><th className="p-2.5 font-medium">Institution</th>
                  <th className="p-2.5 font-medium">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {onboardingRows.slice(0, 8).map((row) => (
                  <tr key={row.line}>
                    <td className="p-2.5 tabular-nums">{row.line}</td><td className="p-2.5">{row.email || "—"}</td>
                    <td className="p-2.5 capitalize">{row.role || "—"}</td><td className="p-2.5">{row.institution || "—"}</td>
                    <td className={row.issue ? "p-2.5 text-destructive" : "p-2.5 text-success"}>{row.issue || "Looks valid"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {onboardingRows.length > 8 && <p className="border-t border-border p-2.5 text-xs text-muted-foreground">Showing first 8 of {onboardingRows.length} rows; the server validates every row again.</p>}
          </div>
        )}
        {onboard.data && (
          <div className="rounded-lg border border-border p-4">
            <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4 text-success" /> Onboarding results</p>
            <p className="mt-1 text-sm text-muted-foreground">{onboard.data.updated} updated · {onboard.data.skipped} skipped · {onboard.data.total} total rows</p>
            {onboard.data.skippedRows.length > 0 && (
              <div className="mt-3 space-y-1 text-xs">
                {onboard.data.skippedRows.map((item) => <p key={item.line}>Row {item.line}: {item.reason}</p>)}
              </div>
            )}
          </div>
        )}
        {onboard.isError && <p className="text-sm text-destructive">{(onboard.error as Error).message}</p>}
      </section>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /></div>
      ) : (
        <>
          <section className="panel space-y-4 p-5">
            <div>
              <h3 className="flex items-center gap-2 font-semibold"><Building2 className="size-4" /> Institution overview ({institutionCount})</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Counts are grouped by the existing profile institution value. Class and assignment totals are attributed to their recorded class owner. Recent submission metrics cover up to the 200 latest records loaded.
              </p>
            </div>
            {institutionRows.length === 0 ? <p className="text-sm text-muted-foreground">No institution data yet.</p> : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[58rem] text-sm">
                  <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">Institution</th><th className="p-3 text-right font-medium">Students</th>
                      <th className="p-3 text-right font-medium">Teachers</th><th className="p-3 text-right font-medium">Classes</th>
                      <th className="p-3 text-right font-medium">Assignments</th><th className="p-3 text-right font-medium">Recent submissions</th>
                      <th className="p-3 text-right font-medium">To review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {institutionRows.map((item) => (
                      <tr key={item.name}><td className="p-3 font-medium">{item.name}</td><td className="p-3 text-right tabular-nums">{item.students}</td>
                        <td className="p-3 text-right tabular-nums">{item.teachers}</td><td className="p-3 text-right tabular-nums">{item.classes}</td>
                        <td className="p-3 text-right tabular-nums">{item.assignments}</td><td className="p-3 text-right tabular-nums">{item.recentSubmissions}</td>
                        <td className="p-3 text-right tabular-nums">{item.recentToReview}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel space-y-4 p-5">
            <div>
              <h3 className="flex items-center gap-2 font-semibold"><BarChart3 className="size-4" /> Department / subject analytics</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Existing classes do not have a dedicated department relation, so the current subject field is used as a clearly labelled grouping proxy.
              </p>
            </div>
            {departmentRows.length === 0 ? <p className="text-sm text-muted-foreground">No class subject labels yet.</p> : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="p-3 font-medium">Subject / department</th><th className="p-3 text-right font-medium">Classes</th><th className="p-3 text-right font-medium">Students</th><th className="p-3 text-right font-medium">Assignments</th><th className="p-3 text-right font-medium">Archived</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {departmentRows.map((item) => (
                      <tr key={item.name}><td className="p-3 font-medium">{item.name}</td><td className="p-3 text-right tabular-nums">{item.classes}</td><td className="p-3 text-right tabular-nums">{item.students}</td><td className="p-3 text-right tabular-nums">{item.assignments}</td><td className="p-3 text-right tabular-nums">{item.archived}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <section className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Activity and audit readiness</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This is an exported activity timeline reconstructed from current rows, not an immutable audit log of role changes, deletions or every edit. A durable audit table and triggers need a database migration.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadCsv("onyx-activity.csv", toCsv(["Timestamp", "Event"], filteredActivity.map((item) => [item.at, item.text])))}
            disabled={!filteredActivity.length}
          >
            <Download className="mr-2 size-4" /> Export activity
          </Button>
        </div>
        <Input value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)} placeholder="Filter activity by class, account or action" aria-label="Filter activity" />
        {filteredActivity.length === 0 ? <p className="text-sm text-muted-foreground">No matching activity.</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {filteredActivity.slice(0, 20).map((item, index) => (
              <li key={`${item.at}-${index}`} className="flex flex-wrap items-start justify-between gap-3 p-3">
                <span className="min-w-0 flex-1 text-sm">{item.text}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{new Date(item.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
