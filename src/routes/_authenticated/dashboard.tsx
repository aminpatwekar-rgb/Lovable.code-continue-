import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Users,
  FileClock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { daysLate, formatDue, type SubmissionStatus } from "@/lib/assignments";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — ONYX" },
      {
        name: "description",
        content: "Your assignments, deadlines, submissions and completion progress at a glance.",
      },
      { property: "og:title", content: "Dashboard — ONYX" },
      { property: "og:description", content: "Track upcoming, overdue and completed work." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Stat({
  icon: Icon,
  label,
  value,
  tone = "text-primary",
}: {
  icon: typeof BookOpen;
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="panel lift p-5 hover:lift-hover">
      <Icon className={`size-4 ${tone}`} />
      <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function Dashboard() {
  const { profile, role, user } = useAuth();

  const teacher = useQuery({
    enabled: role === "teacher" || role === "admin",
    queryKey: ["teacher-dash", user?.id],
    queryFn: async () => {
      const { data: classes } = await supabase.from("classes").select("id").eq("teacher_id", user!.id);
      const ids = (classes ?? []).map((c) => c.id);
      const [{ count: students }, { data: assignments }] = await Promise.all([
        ids.length
          ? supabase
              .from("class_members")
              .select("id", { count: "exact", head: true })
              .in("class_id", ids)
          : Promise.resolve({ count: 0 } as { count: number }),
        supabase
          .from("assignments")
          .select("id, title, due_date, class_id")
          .eq("teacher_id", user!.id)
          .order("due_date", { ascending: true }),
      ]);
      const aIds = (assignments ?? []).map((a) => a.id);
      const { data: subs } = aIds.length
        ? await supabase.from("submissions").select("id, status, assignment_id").in("assignment_id", aIds)
        : { data: [] as { id: string; status: string; assignment_id: string }[] };
      return {
        classes: ids.length,
        students: students ?? 0,
        assignments: assignments ?? [],
        pending: (subs ?? []).filter((s) => ["submitted", "late"].includes(s.status)).length,
      };
    },
  });

  const student = useQuery({
    enabled: role === "student",
    queryKey: ["student-dash", user?.id],
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from("class_members")
        .select("class_id")
        .eq("student_id", user!.id);
      const classIds = (memberships ?? []).map((m) => m.class_id);
      const { data: assignments } = classIds.length
        ? await supabase
            .from("assignments")
            .select("id, title, subject, due_date, priority, max_marks, class_id, classes(name)")
            .in("class_id", classIds)
            .eq("published", true)
            .order("due_date", { ascending: true })
        : { data: [] };
      const { data: subs } = await supabase
        .from("submissions")
        .select("id, assignment_id, status, marks_awarded")
        .eq("student_id", user!.id);
      const byAssignment = new Map((subs ?? []).map((s) => [s.assignment_id, s]));
      return { classes: classIds.length, assignments: assignments ?? [], byAssignment };
    },
  });

  const greeting = `Hello, ${profile?.full_name?.split(" ")[0] || "there"}`;

  if (role === "teacher" || role === "admin") {
    const d = teacher.data;
    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-semibold">{greeting}</h1>
          <p className="mt-1 text-muted-foreground">Here's what's happening across your classes.</p>
        </header>
        {teacher.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={GraduationCap} label="Classes" value={d?.classes ?? 0} />
            <Stat icon={Users} label="Students" value={d?.students ?? 0} />
            <Stat icon={BookOpen} label="Active assignments" value={d?.assignments.length ?? 0} />
            <Stat
              icon={FileClock}
              label="Pending review"
              value={d?.pending ?? 0}
              tone="text-warning"
            />
          </div>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent assignments</h2>
            <Button asChild variant="outline" size="sm">
              <Link to="/classes">Manage classes</Link>
            </Button>
          </div>
          {(d?.assignments ?? []).length === 0 ? (
            <p className="panel p-6 text-sm text-muted-foreground">
              No assignments yet. Create a class, then post your first assignment.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {(d?.assignments ?? []).slice(0, 6).map((a) => (
                <li key={a.id}>
                  <Link
                    to="/assignments/$assignmentId"
                    params={{ assignmentId: a.id }}
                    className="panel lift block p-4 hover:lift-hover"
                  >
                    <p className="font-medium">{a.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Due {formatDue(a.due_date)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const list = student.data?.assignments ?? [];
  const done = list.filter((a) => {
    const s = student.data?.byAssignment.get(a.id);
    return s && ["submitted", "reviewed", "completed", "late"].includes(s.status);
  }).length;
  const overdue = list.filter((a) => {
    const s = student.data?.byAssignment.get(a.id);
    return (
      a.due_date &&
      new Date(a.due_date) < new Date() &&
      (!s || ["not_started", "in_progress", "returned"].includes(s.status))
    );
  }).length;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">{greeting}</h1>
        <p className="mt-1 text-muted-foreground">Your work, deadlines and progress.</p>
      </header>

      {student.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Clock} label="Upcoming" value={list.length - done} tone="text-warning" />
            <Stat
              icon={AlertTriangle}
              label="Overdue"
              value={overdue}
              tone="text-destructive"
            />
            <Stat icon={CheckCircle2} label="Submitted" value={done} tone="text-success" />
            <Stat icon={GraduationCap} label="Classes" value={student.data?.classes ?? 0} />
          </div>

          <div className="panel p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Completion</span>
              <span className="tabular-nums text-muted-foreground">{pct}%</span>
            </div>
            <Progress value={pct} className="mt-3" />
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your assignments</h2>
              <Button asChild variant="outline" size="sm">
                <Link to="/classes">Join a class</Link>
              </Button>
            </div>
            {list.length === 0 ? (
              <p className="panel p-6 text-sm text-muted-foreground">
                Nothing here yet — join a class with the code your teacher shared.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {list.map((a, i) => {
                  const s = student.data?.byAssignment.get(a.id);
                  const late = a.due_date ? daysLate(a.due_date) : 0;
                  const status = (s?.status ?? "not_started") as SubmissionStatus;
                  const isOverdue =
                    late > 0 && ["not_started", "in_progress", "returned"].includes(status);
                  return (
                    <motion.li
                      key={a.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.3 }}
                    >
                      <Link
                        to="/assignments/$assignmentId"
                        params={{ assignmentId: a.id }}
                        className="panel lift block p-4 hover:lift-hover"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{a.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {a.subject || "General"} ·{" "}
                              {(a.classes as { name: string } | null)?.name}
                            </p>
                          </div>
                          <StatusBadge status={isOverdue ? "late" : status} />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Due {formatDue(a.due_date)}</span>
                          {isOverdue && (
                            <span className="font-medium text-destructive">
                              Late by {late} day{late === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </Link>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
