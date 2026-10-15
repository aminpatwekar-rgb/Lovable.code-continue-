import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { Building2, Download, FileUp, Layers, Loader2, Plus, RefreshCw, Tag, Users, GraduationCap, BookOpenCheck, ClipboardList, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { createInstitutionDepartment, getInstitutionAdminOverview, listInstitutionDepartments, type InstitutionAdminOverview } from "@/lib/institution-admin.functions";
import { bulkCreateInstitutionStudents, type StudentOnboardingResult } from "@/lib/admin.functions";
import { csvObjects, downloadCsv, toCsv } from "@/lib/csv";
import { InstitutionJoinLinks } from "@/components/institution/InstitutionJoinLinks";
import { DepartmentPeople } from "@/components/institution/DepartmentPeople";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/institution-admin")({
  head: () => ({
    meta: [
      { title: "Institution console — ONYX" },
      { name: "description", content: "Institution-scoped roster and activity management." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InstitutionAdminConsole,
});

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return <div className="panel p-4">
    <Icon className="size-4 text-primary" />
    <p className="mt-3 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
    <p className="mt-1 text-sm text-muted-foreground">{label}</p>
  </div>;
}

function InstitutionAdminConsole() {
  const { role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [result, setResult] = useState<StudentOnboardingResult | null>(null);
  const [departmentName, setDepartmentName] = useState("");
  const [departmentCode, setDepartmentCode] = useState("");
  const [departmentDescription, setDepartmentDescription] = useState("");

  useEffect(() => {
    if (!authLoading && role === "admin") {
      void navigate({ to: "/admin", replace: true });
    } else if (!authLoading && role !== "institution_admin") {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [authLoading, role, navigate]);

  const getOverview = useServerFn(getInstitutionAdminOverview);
  const overview = useQuery({
    queryKey: ["institution-admin-overview", role],
    enabled: role === "institution_admin",
    queryFn: () => getOverview(),
  });

  const getDepartments = useServerFn(listInstitutionDepartments);
  const departments = useQuery({
    queryKey: ["institution-admin-departments", role],
    enabled: role === "institution_admin",
    queryFn: () => getDepartments(),
  });

  const createDepartmentAction = useServerFn(createInstitutionDepartment);
  const createDepartment = useMutation({
    mutationFn: () => createDepartmentAction({
      data: { name: departmentName, code: departmentCode, description: departmentDescription },
    }),
    onSuccess: async (department) => {
      setDepartmentName("");
      setDepartmentCode("");
      setDepartmentDescription("");
      toast.success("Department created: " + department.name);
      await queryClient.invalidateQueries({ queryKey: ["institution-admin-departments"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not create the department."),
  });

  const onboard = useServerFn(bulkCreateInstitutionStudents);
  const importRoster = useMutation({
    mutationFn: () => {
      const data = overview.data;
      if (!data) throw new Error("Load your institution first.");
      return onboard({
        data: {
          institutionId: data.institution.id,
          csv,
          redirectTo: `${window.location.origin}/reset-password`,
        },
      });
    },
    onSuccess: async (next) => {
      setResult(next);
      const summary = [
        next.invited ? `${next.invited} invitations sent` : "",
        next.assignedExisting ? `${next.assignedExisting} existing accounts added` : "",
        next.alreadyAssigned ? `${next.alreadyAssigned} already assigned` : "",
        next.inviteFailed ? `${next.inviteFailed} invitations failed` : "",
        next.setupFailed ? `${next.setupFailed} setup issues` : "",
        next.skipped ? `${next.skipped} skipped` : "",
      ].filter(Boolean).join(" · ");
      if (next.inviteFailed || next.setupFailed || next.skipped) toast.info("Import finished with items to review. " + summary);
      else toast.success("Institution roster import completed. " + summary);
      await queryClient.invalidateQueries({ queryKey: ["institution-admin-overview"] });
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't import the institution roster."),
  });

  if (authLoading || (role === null && !overview.isError)) {
    return <div className="space-y-4"><Skeleton className="h-24 w-full rounded-xl" /><Skeleton className="h-56 w-full rounded-xl" /></div>;
  }
  if (role !== "institution_admin") {
    return <div className="panel p-8 text-center">
      <Building2 className="mx-auto size-7 text-muted-foreground" />
      <h1 className="mt-3 font-semibold">Institution administrators only</h1>
      <p className="mt-1 text-sm text-muted-foreground">This area is restricted to approved institution administrators.</p>
    </div>;
  }

  const data: InstitutionAdminOverview | undefined = overview.data;
  const csvCount = csvObjects(csv).length;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">Institution console</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your institution's roster and monitor academic activity. Other institutions and platform-wide controls are not available here.</p>
      </div>
      <Button variant="outline" onClick={() => void overview.refetch()} disabled={overview.isFetching}>
        {overview.isFetching ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}Refresh
      </Button>
    </header>

    {overview.isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
    </div> : overview.isError ? <div className="panel space-y-3 p-5">
      <p role="alert" className="text-sm text-destructive">{(overview.error as Error).message || "Institution details couldn't be loaded."}</p>
      <Button size="sm" variant="outline" onClick={() => void overview.refetch()}>Retry</Button>
    </div> : data && <>
      <section className="panel flex flex-wrap items-start gap-4 p-5">
        <div className="rounded-lg bg-primary/10 p-3"><Building2 className="size-6 text-primary" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{data.institution.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{[data.institution.code, data.institution.city].filter(Boolean).join(" · ") || "Institution profile"}</p>
          <p className="mt-2 text-xs text-muted-foreground">Tenant-scoped access · Only this institution's members and related class activity are included.</p>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric icon={Users} label="Students" value={data.students} />
        <Metric icon={GraduationCap} label="Teachers" value={data.teachers} />
        <Metric icon={Building2} label="Institution admins" value={data.institutionAdmins} />
        <Metric icon={BookOpenCheck} label="Classes" value={data.classes} />
        <Metric icon={ClipboardList} label="Assignments" value={data.assignments} />
        <Metric icon={Users} label="Recorded submissions" value={data.submissions} />
      </div>

      <InstitutionJoinLinks institutionId={data.institution.id} />

      <section className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Departments</h2>
            <p className="mt-1 text-sm text-muted-foreground">Create and organize departments within {data.institution.name}. Department names and codes are unique within this institution.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            <Layers className="size-3.5" /> {departments.data?.length ?? 0} department(s)
          </div>
        </div>

        <form
          className="space-y-3 rounded-lg border border-border/80 bg-muted/10 p-4"
          onSubmit={(event) => { event.preventDefault(); createDepartment.mutate(); }}
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="space-y-1.5">
              <label htmlFor="department-name" className="text-sm font-medium">Department name <span className="text-destructive">*</span></label>
              <Input
                id="department-name"
                value={departmentName}
                onChange={(event) => setDepartmentName(event.target.value)}
                placeholder="e.g. Robotics & AI"
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="department-code" className="text-sm font-medium">Department code</label>
              <Input
                id="department-code"
                value={departmentCode}
                onChange={(event) => setDepartmentCode(event.target.value)}
                placeholder="e.g. RAI"
                maxLength={40}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="department-description" className="text-sm font-medium">Description <span className="text-muted-foreground">(optional)</span></label>
            <Textarea
              id="department-description"
              value={departmentDescription}
              onChange={(event) => setDepartmentDescription(event.target.value)}
              placeholder="What this department covers"
              rows={2}
              maxLength={500}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Departments are visible only within the institution's own scope.</p>
            <Button type="submit" disabled={!departmentName.trim() || createDepartment.isPending || !data}>
              {createDepartment.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
              {createDepartment.isPending ? "Creating…" : "Create department"}
            </Button>
          </div>
        </form>

        {departments.isLoading ? <div className="space-y-2"><Skeleton className="h-16 rounded-lg" /><Skeleton className="h-16 rounded-lg" /></div>
          : departments.isError ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{(departments.error as Error).message || "Departments could not be loaded."}</p>
          : !departments.data?.length ? <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No departments yet. Create the first department above.</p>
          : <div className="grid gap-3 md:grid-cols-2">
            {departments.data.map((department) => <article key={department.id} className="flex items-start gap-3 rounded-lg border border-border/80 p-4">
              <div className="rounded-md bg-primary/10 p-2"><Layers className="size-4 text-primary" /></div>
              <div className="min-w-0 flex-1">
                <h3 className="font-medium">{department.name}</h3>
                {department.code && <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground"><Tag className="size-3" />{department.code}</p>}
                {department.description && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{department.description}</p>}
              </div>
            </article>)}
          </div>}
      </section>

      <DepartmentPeople institutionId={data.institution.id} departments={(departments.data ?? []).map((d) => ({ id: d.id, name: d.name, code: d.code ?? null }))} />

      <section className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Mass roster onboarding</h2>
            <p className="mt-1 text-sm text-muted-foreground">Import student and teacher accounts for this institution only.</p>
          </div>
          <Button variant="outline" onClick={() => downloadCsv(
            "onyx-institution-roster-template.csv",
            toCsv(["full_name", "email", "role"], [
              ["Aarav Sharma", "aarav@example.edu", "student"],
              ["Dr. Asha Mehta", "asha@college.edu", "teacher"],
            ]),
          )}><Download className="mr-2 size-4" />CSV template</Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Use <code>full_name,email,role</code>. Allowed roles are <code>student</code> and <code>teacher</code>. Institution admins are appointed only by the platform administrator, and existing accounts are never silently promoted or demoted. New users get an invitation and choose their own password.
        </p>
        <p className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          For college-sized batches, configure custom SMTP in Supabase Auth and allow your ONYX <code>/reset-password</code> URL in Auth URL Configuration before sending invitations.
          <a className="ml-1 underline underline-offset-2" href="https://supabase.com/docs/guides/auth/auth-smtp" target="_blank" rel="noreferrer">SMTP setup guide</a>.
        </p>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <FileUp className="size-4" />Upload roster CSV
          <input type="file" accept=".csv,text/csv" className="block max-w-full text-xs" onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
              toast.error("CSV files must be 2 MB or smaller.");
              event.currentTarget.value = "";
              return;
            }
            try { setCsvFileName(file.name); setCsv(await file.text()); setResult(null); }
            catch { toast.error("Couldn't read that CSV file."); }
            finally { event.currentTarget.value = ""; }
          }} />
        </label>
        {csvFileName && <p className="text-xs text-muted-foreground">Loaded: {csvFileName}</p>}
        <Textarea
          value={csv}
          onChange={(event) => { setCsv(event.target.value); setCsvFileName(""); setResult(null); }}
          rows={5}
          placeholder={"full_name,email,role\nAarav Sharma,aarav@college.edu,student\nDr. Asha Mehta,asha@college.edu,teacher"}
          aria-label="Institution roster CSV"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{csvCount} row(s) detected · Up to 500 per batch</p>
          <Button disabled={!csvCount || importRoster.isPending || !data} onClick={() => importRoster.mutate()}>
            <UserPlus className="mr-2 size-4" />{importRoster.isPending ? "Importing…" : "Create accounts & send invites"}
          </Button>
        </div>
        {result && <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <h3 className="font-semibold">Import results</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {result.invited} invited · {result.assignedExisting} existing accounts added · {result.alreadyAssigned} already assigned · {result.inviteFailed} invite failures · {result.setupFailed} setup issues · {result.skipped} skipped
            </p>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[35rem] text-left text-xs">
              <thead className="sticky top-0 border-b border-border bg-muted text-muted-foreground">
                <tr><th className="p-2.5 font-medium">CSV row</th><th className="p-2.5 font-medium">Email</th><th className="p-2.5 font-medium">Status</th><th className="p-2.5 font-medium">Details</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.rows.map((row) => <tr key={row.line + "-" + row.email}>
                  <td className="p-2.5 tabular-nums">{row.line}</td><td className="p-2.5">{row.email}</td>
                  <td className="p-2.5 capitalize">{row.status.replaceAll("_", " ")}</td><td className="p-2.5 text-muted-foreground">{row.message}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>}
      </section>

      <section className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Institution roster ({data.roster.length})</h2>
            <p className="mt-1 text-sm text-muted-foreground">Active status, account role, and registration date for your institution's users.</p>
          </div>
          <Button variant="outline" onClick={() => downloadCsv(
            "onyx-institution-roster.csv",
            toCsv(["Full name", "Email", "Role", "Status", "Registered"], data.roster.map((member) => [
              member.fullName, member.email, member.role, member.isActive ? "Active" : "Suspended", member.createdAt ? new Date(member.createdAt).toLocaleDateString() : "",
            ])),
          )}><Download className="mr-2 size-4" />Export roster</Button>
        </div>
        {!data.roster.length ? <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No students or staff are assigned to this institution yet.</p> : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="p-3 font-medium">Full name</th><th className="p-3 font-medium">Email</th><th className="p-3 font-medium">Role</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Registered</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.roster.map((member) => <tr key={member.id}>
                  <td className="p-3 font-medium">{member.fullName || "—"}</td>
                  <td className="p-3 text-muted-foreground">{member.email || "—"}</td>
                  <td className="p-3 capitalize">{member.role.replace("_", " ")}</td>
                  <td className="p-3">{member.isActive ? "Active" : "Suspended"}</td>
                  <td className="p-3 text-muted-foreground">{member.createdAt ? new Date(member.createdAt).toLocaleDateString() : "—"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>}
  </div>;
}
