import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Clock, GraduationCap, Layers, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchMyInstitution,
  MY_INSTITUTION_KEY,
  type PersonName,
} from "@/lib/my-institution";

export const Route = createFileRoute("/_authenticated/my-institution")({
  head: () => ({
    meta: [
      { title: "My Institution — ONYX" },
      {
        name: "description",
        content: "Your institution, departments, classes, classmates and teachers.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyInstitutionPage,
});

function Names({ people, empty }: { people: PersonName[]; empty: string }) {
  if (people.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {people.map((p, i) => (
        <li
          key={`${p.fullName}-${i}`}
          className="rounded-full border border-border/70 bg-secondary/60 px-2.5 py-1 text-xs text-foreground"
        >
          {p.fullName}
        </li>
      ))}
    </ul>
  );
}

function MyInstitutionPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const isMember = role === "student" || role === "teacher";

  useEffect(() => {
    if (!loading && !isMember) void navigate({ to: "/dashboard", replace: true });
  }, [loading, isMember, navigate]);

  const q = useQuery({
    queryKey: [MY_INSTITUTION_KEY, user?.id],
    enabled: Boolean(user) && isMember,
    queryFn: fetchMyInstitution,
    staleTime: 60_000,
  });

  if (loading || !isMember || q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <p className="text-sm text-destructive">
        Could not load your institution. Please refresh and try again.
      </p>
    );
  }

  const { institution, pending, departments, classes } = q.data;

  if (!institution) {
    const p = pending[0];
    return (
      <div className="mx-auto max-w-xl space-y-3 py-10 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {p ? <Clock className="size-6" /> : <Building2 className="size-6" />}
        </span>
        <h1 className="text-xl font-semibold">
          {p ? `Waiting for approval from ${p.institutionName}` : "You are not part of an institution"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {p
            ? "You will be notified as soon as your request is approved."
            : "Institutions add you through the join link they share, or an institution admin adds you directly."}
        </p>
      </div>
    );
  }

  const label = role === "teacher" ? "Teacher" : "Student";

  return (
    <div className="space-y-6 sm:space-y-8">
      <header className="flex items-start gap-4 border-b border-border/60 pb-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Building2 className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {institution.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{label}</Badge>
            {institution.city && <span>{institution.city}</span>}
          </p>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Layers className="size-4 text-primary" /> My departments
        </h2>
        {departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You have not been placed in a department yet. You will be notified when your institution does.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {departments.map((d) => (
              <Card key={d.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="truncate">{d.name}</span>
                    {d.code && <Badge variant="outline">{d.code}</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {d.studentCount} student{d.studentCount === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Teachers</p>
                    <Names people={d.teachers} empty="No other teachers yet." />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {d.myRole === "teacher" ? "Students" : "Classmates"}
                    </p>
                    <Names people={d.students} empty="No other students yet." />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <GraduationCap className="size-4 text-primary" /> My classes here
        </h2>
        {classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You are not in any class at {institution.name} yet.{" "}
            <Link to="/classes" className="font-medium text-primary hover:underline">
              Go to classes
            </Link>
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {classes.map((c) => (
              <Card key={c.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    <Link
                      to="/classes/$classId"
                      params={{ classId: c.id }}
                      className="hover:text-primary hover:underline"
                    >
                      {c.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {[c.subject, c.section, c.departmentName].filter(Boolean).join(" · ") || "Class"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Users className="size-3.5" /> {c.myRole === "teacher" ? "Co-teachers" : "Teachers"}
                    </p>
                    <Names people={c.teachers} empty={c.myRole === "teacher" ? "You teach this class." : "No teacher listed."} />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {c.myRole === "teacher" ? "Students" : "Classmates"}
                    </p>
                    <Names people={c.classmates} empty="No other students yet." />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
