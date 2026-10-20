import { useEffect, useState, type ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  GraduationCap,
  Layers,
  Users,
} from "lucide-react";
import { getInstitutionHubData, type InstitutionHubResponse } from "@/lib/institution-hub.functions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

type InstitutionChoice = InstitutionHubResponse["institutions"][number];
type InstitutionDetail = NonNullable<InstitutionHubResponse["detail"]>;

function Metric({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="panel p-4">
      <Icon className="size-4 text-primary" />
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function displayDate(value: string | null | undefined) {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No due date" : date.toLocaleDateString();
}

export function PlatformInstitutionHub() {
  const { user, role } = useAuth();
  const cacheScope = user?.id ?? "anonymous";
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | null>(null);
  const getHubData = useServerFn(getInstitutionHubData);

  // The initial response is either the platform-admin directory or the
  // institution-admin's own institution. It never returns other tenant detail.
  const directory = useQuery({
    queryKey: ["institution-hub-directory", cacheScope, role],
    queryFn: () => getHubData({ data: { institutionId: null } }),
  });

  useEffect(() => {
    const ownInstitutionId = directory.data?.selectedInstitutionId;
    if (!directory.data?.canSelectInstitution && ownInstitutionId && !selectedInstitutionId) {
      setSelectedInstitutionId(ownInstitutionId);
    }
  }, [directory.data?.canSelectInstitution, directory.data?.selectedInstitutionId, selectedInstitutionId]);

  const institutionDetail = useQuery({
    queryKey: ["institution-hub-detail", cacheScope, role, selectedInstitutionId],
    enabled: Boolean(directory.data?.canSelectInstitution && selectedInstitutionId),
    queryFn: () => getHubData({ data: { institutionId: selectedInstitutionId } }),
  });

  const canSelectInstitution = directory.data?.canSelectInstitution === true;
  const institutions: InstitutionChoice[] = directory.data?.institutions ?? [];
  const detail: InstitutionDetail | null = canSelectInstitution
    ? institutionDetail.data?.detail ?? null
    : directory.data?.detail ?? null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Institution</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose an institution to view only its departments, classes, enrolment and assignments.
          </p>
        </div>
        {!canSelectInstitution && detail ? (
          <Button asChild variant="outline">
            <Link to="/institution-admin">Manage departments and roster <ExternalLink className="ml-2 size-4" /></Link>
          </Button>
        ) : null}
      </header>

      <section className="panel space-y-3 p-4 sm:p-5">
        <label className="block text-sm font-medium" htmlFor="institution-hub-picker">
          {canSelectInstitution ? "Select institution" : "Your institution"}
        </label>
        {directory.isLoading ? (
          <Skeleton className="h-10 w-full max-w-xl rounded-lg" />
        ) : directory.isError ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {(directory.error as Error).message || "Could not load the institution directory."}
            </p>
            <Button variant="outline" size="sm" onClick={() => void directory.refetch()}>Retry</Button>
          </div>
        ) : canSelectInstitution ? (
          institutions.length ? (
            <Select
              value={selectedInstitutionId ?? ""}
              onValueChange={(value) => setSelectedInstitutionId(value)}
            >
              <SelectTrigger id="institution-hub-picker" className="max-w-xl">
                <SelectValue placeholder="Choose an institution to continue" />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((institution) => (
                  <SelectItem key={institution.id} value={institution.id}>
                    {institution.name}{institution.code ? " · " + institution.code : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No institutions have been created yet.
            </p>
          )
        ) : detail ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5"><Building2 className="size-5 text-primary" /></div>
            <div>
              <p className="font-semibold">{detail.institution.name}</p>
              <p className="text-sm text-muted-foreground">
                {[detail.institution.code, detail.institution.city].filter(Boolean).join(" · ") || "Institution profile"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Access is limited to your assigned institution.</p>
            </div>
          </div>
        ) : (
          <Skeleton className="h-10 w-full max-w-xl rounded-lg" />
        )}
      </section>

      {canSelectInstitution && !selectedInstitutionId ? (
        <div className="panel flex flex-col items-center gap-2 p-10 text-center">
          <Building2 className="size-8 text-muted-foreground" />
          <h3 className="font-semibold">Select an institution first</h3>
          <p className="max-w-lg text-sm text-muted-foreground">
            Class and assignment information will appear after you select a university. Classes belonging to other institutions will not be included.
          </p>
        </div>
      ) : null}

      {canSelectInstitution && selectedInstitutionId && institutionDetail.isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : null}

      {canSelectInstitution && selectedInstitutionId && institutionDetail.isError ? (
        <section className="panel space-y-3 p-5">
          <p role="alert" className="text-sm text-destructive">
            {(institutionDetail.error as Error).message || "Could not load this institution."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void institutionDetail.refetch()}>Retry</Button>
        </section>
      ) : null}

      {detail ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Layers} label="Departments" value={detail.departments} />
            <Metric icon={Users} label="Students" value={detail.students} />
            <Metric icon={GraduationCap} label="Teachers" value={detail.teachers} />
            <Metric icon={BookOpen} label="Classes" value={detail.classes.length} />
          </div>

          <section className="panel space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">Department directory ({detail.departmentList.length})</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Departments registered under {detail.institution.name}.
                </p>
              </div>
              <Layers className="size-4 text-muted-foreground" />
            </div>
            {detail.departmentList.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
                No departments have been created for this institution yet.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {detail.departmentList.map((department) => (
                  <article key={department.id} className="flex items-start gap-3 rounded-lg border border-border/80 p-4">
                    <div className="rounded-md bg-primary/10 p-2">
                      <Layers className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-medium">{department.name}</h4>
                      {department.code ? (
                        <p className="mt-1 text-xs text-muted-foreground">Code: {department.code}</p>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">No department code</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">Classes ({detail.classes.length})</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Only classes assigned to this institution or created by its teachers without a department.
                </p>
              </div>
              <GraduationCap className="size-4 text-muted-foreground" />
            </div>
            {detail.classes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
                No classes belong to this institution yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[46rem] text-sm">
                  <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">Class</th>
                      <th className="p-3 font-medium">Teacher / owner</th>
                      <th className="p-3 font-medium">Department</th>
                      <th className="p-3 font-medium">Students</th>
                      <th className="p-3 font-medium">Assignments</th>
                      <th className="p-3 font-medium">Status</th>
                      {canSelectInstitution ? <th className="p-3 font-medium">Open</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {detail.classes.map((row) => (
                      <tr key={row.id}>
                        <td className="p-3 font-medium">
                          {row.name}
                          {(row.subject || row.section) ? (
                            <span className="block text-xs font-normal text-muted-foreground">
                              {[row.subject, row.section].filter(Boolean).join(" · ")}
                            </span>
                          ) : null}
                        </td>
                        <td className="p-3">{row.teacherName}</td>
                        <td className="p-3 text-muted-foreground">{row.departmentName || "—"}</td>
                        <td className="p-3 tabular-nums">{row.studentCount}</td>
                        <td className="p-3 tabular-nums">{row.assignmentCount}</td>
                        <td className="p-3">{row.archived ? "Archived" : "Active"}</td>
                        {canSelectInstitution ? (
                          <td className="p-3">
                            <Button asChild variant="outline" size="sm">
                              <Link to="/classes/$classId" params={{ classId: row.id }}>View</Link>
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">Assignments ({detail.assignments.length})</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Assignment details are limited to the classes shown above.
                </p>
              </div>
              <ClipboardList className="size-4 text-muted-foreground" />
            </div>
            {detail.assignments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
                No assignments have been created in this institution yet.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {detail.assignments.map((assignment) => (
                  <li key={assignment.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="rounded-lg bg-primary/10 p-2"><ClipboardList className="size-4 text-primary" /></div>
                    <div className="min-w-0 flex-1">
                      {canSelectInstitution ? (
                        <Link
                          to="/assignments/$assignmentId"
                          params={{ assignmentId: assignment.id }}
                          className="font-medium hover:underline"
                        >
                          {assignment.title}
                        </Link>
                      ) : (
                        <p className="font-medium">{assignment.title}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {assignment.className} · {assignment.teacherName} · <CalendarDays className="mr-1 inline size-3" />{displayDate(assignment.dueDate)}
                      </p>
                    </div>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {assignment.archived ? "Archived" : assignment.published ? "Published" : "Draft"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
