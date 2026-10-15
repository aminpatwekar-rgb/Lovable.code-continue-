import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Copy, Layers, Loader2, RefreshCw, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EnrollDepartmentStudents } from "@/components/institution/EnrollDepartmentStudents";
import { joinUrl } from "@/lib/institution-join";
import {
  assignDepartmentMembers, fetchDepartmentClasses, fetchDepartmentLink, fetchInstitutionPeople,
  regenerateDepartmentLink, removeDepartmentMember, updateDepartmentLink,
  type DepartmentSummary, type InstitutionPerson,
} from "@/lib/institution-departments";

function DepartmentLinkRow({ departmentId }: { departmentId: string }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const link = useQuery({ queryKey: ["department-link", departmentId], queryFn: () => fetchDepartmentLink(departmentId) });
  const refetch = () => qc.invalidateQueries({ queryKey: ["department-link", departmentId] });

  const toggle = useMutation({
    mutationFn: (isActive: boolean) =>
      updateDepartmentLink(departmentId, { isActive, expiresAt: link.data?.expiresAt ?? null, maxUses: link.data?.maxUses ?? null }),
    onSuccess: refetch,
    onError: (e: Error) => toast.error(e.message),
  });
  const regenerate = useMutation({
    mutationFn: () => regenerateDepartmentLink(departmentId),
    onSuccess: async () => { toast.success("New link created. The old one no longer works."); await refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (link.isLoading) return <Skeleton className="h-10 w-full rounded-lg" />;
  if (link.isError || !link.data) return <p className="text-sm text-destructive">Couldn't load the student link.</p>;
  const url = joinUrl(link.data.code);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Student link for this department</h4>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={link.data.isActive} disabled={toggle.isPending} onChange={(e) => toggle.mutate(e.target.checked)} />
          Active
        </label>
      </div>
      <div className="flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={link.data.isActive ? "" : "opacity-60"} />
        <Button type="button" variant="outline" aria-label="Copy department student link" onClick={async () => {
          try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
          catch { toast.error("Couldn't copy. Select the link and copy it manually."); }
        }}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</Button>
        <Button type="button" variant="outline" aria-label="Create a new department student link" disabled={regenerate.isPending}
          onClick={() => { if (window.confirm("Create a new link? The current one will stop working immediately.")) regenerate.mutate(); }}>
          {regenerate.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Students who join with this link land in this department automatically. Used {link.data.useCount} time{link.data.useCount === 1 ? "" : "s"}.</p>
    </div>
  );
}

function AddPeople({ department, people, departmentNames }: {
  department: DepartmentSummary;
  people: InstitutionPerson[];
  departmentNames: Record<string, string>;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return people.filter((p) => !p.departmentIds.includes(department.id))
      .filter((p) => !q || p.fullName.toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q));
  }, [people, department.id, filter]);
  const allSelected = candidates.length > 0 && candidates.every((p) => selected.has(p.id));

  const add = useMutation({
    mutationFn: (ids: string[]) => assignDepartmentMembers(department.id, ids),
    onSuccess: async (r) => {
      toast.success(`${r.assigned} added to ${department.name}.${r.skipped.length ? ` ${r.skipped.length} skipped: ${r.skipped[0]?.reason ?? ""}` : ""}`);
      setSelected(new Set());
      await qc.invalidateQueries({ queryKey: ["institution-people"] });
      await qc.invalidateQueries({ queryKey: ["department-students", department.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function setMany(ids: string[], on: boolean) {
    setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  }

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-medium"><UserPlus className="size-4 text-primary" />Add people</h4>
      {!candidates.length && !filter ? (
        <p className="text-sm text-muted-foreground">Everyone in the institution is already in this department. New people appear here after they join with the institution's links.</p>
      ) : (
        <>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search by name or email" aria-label="Search people" />
          <label className="flex items-center gap-2 text-xs font-medium">
            <Checkbox checked={allSelected} onCheckedChange={(v) => setMany(candidates.map((p) => p.id), v === true)} />
            Select all{filter ? " shown" : ""} ({candidates.length})
          </label>
          <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {candidates.map((p) => {
              const firstDepartment = p.role === "student" ? p.departmentIds[0] : undefined;
              const current = firstDepartment ? departmentNames[firstDepartment] : null;
              return (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                    <Checkbox checked={selected.has(p.id)} onCheckedChange={(v) => setMany([p.id], v === true)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.fullName || "Unnamed"} <span className="text-xs text-muted-foreground">· {p.role}</span></span>
                      <span className="block truncate text-xs text-muted-foreground">{p.email}{current ? ` · will move from ${current}` : ""}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <Button type="button" disabled={!selected.size || add.isPending} onClick={() => add.mutate([...selected])}>
            {add.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Add {selected.size || ""} to {department.name}
          </Button>
        </>
      )}
    </div>
  );
}

function Members({ department, people }: { department: DepartmentSummary; people: InstitutionPerson[] }) {
  const qc = useQueryClient();
  const members = people.filter((p) => p.departmentIds.includes(department.id));
  const remove = useMutation({
    mutationFn: (userId: string) => removeDepartmentMember(department.id, userId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["institution-people"] });
      await qc.invalidateQueries({ queryKey: ["department-students", department.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const teachers = members.filter((m) => m.role === "teacher");
  const students = members.filter((m) => m.role === "student");

  const renderGroup = (title: string, list: InstitutionPerson[]) => (
    <div>
      <h4 className="text-sm font-medium">{title} ({list.length})</h4>
      {list.length === 0 ? <p className="text-xs text-muted-foreground">None yet.</p> : (
        <ul className="mt-1 divide-y divide-border rounded-lg border border-border">
          {list.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className="min-w-0 truncate text-sm">{m.fullName || "Unnamed"} <span className="text-xs text-muted-foreground">{m.email}</span></span>
              <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${m.fullName} from ${department.name}`} disabled={remove.isPending} onClick={() => remove.mutate(m.id)}>
                <UserMinus className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return <div className="grid gap-3 md:grid-cols-2">{renderGroup("Teachers", teachers)}{renderGroup("Students", students)}</div>;
}

function EnrollIntoClass({ department }: { department: DepartmentSummary }) {
  const classes = useQuery({ queryKey: ["department-classes", department.id], queryFn: () => fetchDepartmentClasses(department.id) });
  const [classId, setClassId] = useState("");
  if (classes.isLoading) return <Skeleton className="h-10 w-full rounded-lg" />;
  if (classes.isError) return <p className="text-sm text-destructive">{(classes.error as Error).message}</p>;
  if (!classes.data?.length) return <p className="text-sm text-muted-foreground">No classes in this department yet. Teachers in the department create them from the Classes page.</p>;
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Enroll students into a class</h4>
      <select
        value={classId}
        onChange={(e) => setClassId(e.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        aria-label="Choose a class"
      >
        <option value="">Choose a class…</option>
        {classes.data.map((c) => (
          <option key={c.id} value={c.id}>{c.name}{c.section ? ` (${c.section})` : ""} · {c.teacherName ?? "Teacher"} · {c.studentCount} students</option>
        ))}
      </select>
      {classId && <EnrollDepartmentStudents key={classId} classId={classId} departmentId={department.id} departmentName={department.name} />}
    </div>
  );
}

/** Institution-admin screen: who is in each department, its student link, and class enrollment. */
export function DepartmentPeople({ institutionId, departments }: { institutionId: string; departments: DepartmentSummary[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const people = useQuery({ queryKey: ["institution-people", institutionId], queryFn: () => fetchInstitutionPeople(institutionId) });
  const names = useMemo(() => Object.fromEntries(departments.map((d) => [d.id, d.name])), [departments]);

  if (!departments.length) return null;
  const unplacedStudents = (people.data ?? []).filter((p) => p.role === "student" && p.departmentIds.length === 0).length;
  const unplacedTeachers = (people.data ?? []).filter((p) => p.role === "teacher" && p.departmentIds.length === 0).length;

  return (
    <section className="panel space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">Department people and classes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Put teachers and students into departments. Teachers can then create classes in their departments and add the department's students to them.
        </p>
        {people.data && (unplacedStudents > 0 || unplacedTeachers > 0) && (
          <p className="mt-2 text-sm">
            Not in any department yet: <span className="font-medium">{unplacedTeachers} teacher{unplacedTeachers === 1 ? "" : "s"}</span> and{" "}
            <span className="font-medium">{unplacedStudents} student{unplacedStudents === 1 ? "" : "s"}</span>.
          </p>
        )}
      </div>
      {people.isError && <p className="text-sm text-destructive">{(people.error as Error).message}. Make sure the latest database migration has been applied.</p>}
      <div className="space-y-2">
        {departments.map((d) => {
          const open = openId === d.id;
          const count = (people.data ?? []).filter((p) => p.departmentIds.includes(d.id)).length;
          return (
            <div key={d.id} className="rounded-lg border border-border/80">
              <button type="button" className="flex w-full items-center gap-2 p-3 text-left" onClick={() => setOpenId(open ? null : d.id)} aria-expanded={open}>
                {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                <Layers className="size-4 text-primary" />
                <span className="font-medium">{d.name}</span>
                {d.code && <span className="text-xs text-muted-foreground">{d.code}</span>}
                <span className="ml-auto text-xs text-muted-foreground">{count} {count === 1 ? "person" : "people"}</span>
              </button>
              {open && (
                <div className="space-y-5 border-t border-border/80 p-3">
                  {people.isLoading ? <Skeleton className="h-24 w-full rounded-lg" /> : (
                    <>
                      <Members department={d} people={people.data ?? []} />
                      <AddPeople department={d} people={people.data ?? []} departmentNames={names} />
                    </>
                  )}
                  <DepartmentLinkRow departmentId={d.id} />
                  <EnrollIntoClass department={d} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
