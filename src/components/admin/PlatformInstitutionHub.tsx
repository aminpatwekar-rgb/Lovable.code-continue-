import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, GraduationCap, Layers, BookOpen, Search, Users, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const db = supabase as any;
type InstitutionRow = { id: string; name: string; code: string | null; city: string | null };
type DepartmentRow = { id: string; institution_id: string; name: string; code: string | null; description: string | null };
type ProfileRow = { id: string; full_name: string | null; institution_id: string | null; is_active: boolean | null };
type ClassRow = { id: string; name: string; subject: string | null; section: string | null; department_id: string | null; teacher_id: string; archived: boolean; created_at: string; class_members: { count: number }[]; assignments: { count: number }[] };

function Metric({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: number }) {
  return <div className="panel p-4"><Icon className="size-4 text-primary" /><p className="mt-3 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p><p className="mt-1 text-sm text-muted-foreground">{label}</p></div>;
}

export function PlatformInstitutionHub() {
  const [filter, setFilter] = useState("");
  const overview = useQuery({
    queryKey: ["platform-institution-hub"],
    queryFn: async () => {
      const [institutions, departments, classes, profiles] = await Promise.all([
        db.from("institutions").select("id, name, code, city").order("name", { ascending: true }),
        db.from("departments").select("id, institution_id, name, code, description").order("name", { ascending: true }),
        db.from("classes").select("id, name, subject, section, department_id, teacher_id, archived, created_at, class_members(count), assignments(count)").order("created_at", { ascending: false }),
        db.from("profiles").select("id, full_name, institution_id, is_active"),
      ]);
      const failed = [institutions, departments, classes, profiles].find((result) => result.error);
      if (failed?.error) throw failed.error;
      return {
        institutions: (institutions.data ?? []) as InstitutionRow[],
        departments: (departments.data ?? []) as DepartmentRow[],
        classes: (classes.data ?? []) as ClassRow[],
        profiles: (profiles.data ?? []) as ProfileRow[],
      };
    },
  });
  const data = overview.data;
  const maps = useMemo(() => ({
    institutions: new Map((data?.institutions ?? []).map((row) => [row.id, row])),
    departments: new Map((data?.departments ?? []).map((row) => [row.id, row])),
    profiles: new Map((data?.profiles ?? []).map((row) => [row.id, row])),
  }), [data]);
  const term = filter.trim().toLowerCase();
  const visibleInstitutions = (data?.institutions ?? []).filter((row) => [row.name, row.code, row.city].some((value) => value?.toLowerCase().includes(term)));
  const visibleDepartments = (data?.departments ?? []).filter((row) => [row.name, row.code, row.description, maps.institutions.get(row.institution_id)?.name].some((value) => value?.toLowerCase().includes(term)));
  const visibleClasses = (data?.classes ?? []).filter((row) => {
    const department = row.department_id ? maps.departments.get(row.department_id) : null;
    const institution = department ? maps.institutions.get(department.institution_id) : maps.institutions.get(maps.profiles.get(row.teacher_id)?.institution_id ?? "");
    return [row.name, row.subject, row.section, department?.name, institution?.name, maps.profiles.get(row.teacher_id)?.full_name].some((value) => value?.toLowerCase().includes(term));
  });
  const institutionMembers = (data?.profiles ?? []).filter((row) => row.institution_id && row.is_active !== false).length;

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-semibold">Institution overview</h2><p className="mt-1 text-sm text-muted-foreground">Platform-wide view of institutions, departments, classes, owners and enrolment activity.</p></div>
      <Button asChild><Link to="/classes">Create or manage classes <ExternalLink className="ml-2 size-4" /></Link></Button>
    </header>
    {overview.isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      : overview.isError ? <section className="panel space-y-3 p-5"><p role="alert" className="text-sm text-destructive">Could not load the institution directory. Confirm the latest Institution permissions migration is applied.</p><p className="text-xs text-muted-foreground">{(overview.error as Error).message}</p><Button variant="outline" size="sm" onClick={() => void overview.refetch()}>Retry</Button></section>
      : data ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Building2} label="Institutions" value={data.institutions.length} /><Metric icon={Layers} label="Departments" value={data.departments.length} /><Metric icon={GraduationCap} label="Classes" value={data.classes.length} /><Metric icon={Users} label="Active institution members" value={institutionMembers} />
        </div>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={filter} onChange={(event) => setFilter(event.target.value)} className="pl-9" placeholder="Search institution, department, class or teacher" aria-label="Filter institution overview" /></div>
        <section className="panel space-y-3 p-4 sm:p-5">
          <h3 className="font-semibold">Institutions ({visibleInstitutions.length})</h3>
          {visibleInstitutions.length === 0 ? <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">No matching institutions.</p> : <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-[42rem] text-sm"><thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-3 font-medium">Institution</th><th className="p-3 font-medium">Code</th><th className="p-3 font-medium">City</th><th className="p-3 font-medium">Departments</th><th className="p-3 font-medium">Classes</th><th className="p-3 font-medium">Members</th></tr></thead><tbody className="divide-y divide-border">{visibleInstitutions.map((institution) => {
            const departmentIds = new Set(data.departments.filter((item) => item.institution_id === institution.id).map((item) => item.id));
            const classRows = data.classes.filter((item) => item.department_id && departmentIds.has(item.department_id));
            const members = data.profiles.filter((item) => item.institution_id === institution.id && item.is_active !== false).length;
            return <tr key={institution.id}><td className="p-3 font-medium">{institution.name}</td><td className="p-3 text-muted-foreground">{institution.code || "—"}</td><td className="p-3 text-muted-foreground">{institution.city || "—"}</td><td className="p-3 tabular-nums">{departmentIds.size}</td><td className="p-3 tabular-nums">{classRows.length}</td><td className="p-3 tabular-nums">{members}</td></tr>;
          })}</tbody></table></div>}
        </section>
        <section className="panel space-y-3 p-4 sm:p-5">
          <h3 className="font-semibold">Departments ({visibleDepartments.length})</h3>
          {visibleDepartments.length === 0 ? <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">No matching departments. Manage institutions in the Institutions directory tab.</p> : <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-[38rem] text-sm"><thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-3 font-medium">Department</th><th className="p-3 font-medium">Code</th><th className="p-3 font-medium">Institution</th><th className="p-3 font-medium">Classes</th><th className="p-3 font-medium">Description</th></tr></thead><tbody className="divide-y divide-border">{visibleDepartments.map((department) => <tr key={department.id}><td className="p-3 font-medium">{department.name}</td><td className="p-3 text-muted-foreground">{department.code || "—"}</td><td className="p-3">{maps.institutions.get(department.institution_id)?.name ?? "—"}</td><td className="p-3 tabular-nums">{data.classes.filter((row) => row.department_id === department.id).length}</td><td className="p-3 text-muted-foreground">{department.description || "—"}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="panel space-y-3 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Classes ({visibleClasses.length})</h3><BookOpen className="size-4 text-muted-foreground" /></div>
          {visibleClasses.length === 0 ? <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">No matching classes.</p> : <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-[48rem] text-sm"><thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="p-3 font-medium">Class</th><th className="p-3 font-medium">Teacher / owner</th><th className="p-3 font-medium">Department</th><th className="p-3 font-medium">Institution</th><th className="p-3 font-medium">Members</th><th className="p-3 font-medium">Assignments</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Open</th></tr></thead><tbody className="divide-y divide-border">{visibleClasses.map((row) => {
            const department = row.department_id ? maps.departments.get(row.department_id) : null;
            const institution = department ? maps.institutions.get(department.institution_id) : maps.institutions.get(maps.profiles.get(row.teacher_id)?.institution_id ?? "");
            return <tr key={row.id}><td className="p-3 font-medium">{row.name}{row.subject ? <span className="block text-xs font-normal text-muted-foreground">{row.subject}{row.section ? " · " + row.section : ""}</span> : null}</td><td className="p-3">{maps.profiles.get(row.teacher_id)?.full_name || "—"}</td><td className="p-3">{department?.name ?? "—"}</td><td className="p-3">{institution?.name ?? "—"}</td><td className="p-3 tabular-nums">{row.class_members?.[0]?.count ?? 0}</td><td className="p-3 tabular-nums">{row.assignments?.[0]?.count ?? 0}</td><td className="p-3">{row.archived ? "Archived" : "Active"}</td><td className="p-3"><Button asChild variant="outline" size="sm"><Link to="/classes/$classId" params={{ classId: row.id }}>View</Link></Button></td></tr>;
          })}</tbody></table></div>}
        </section>
      </> : null}
  </div>;
}
