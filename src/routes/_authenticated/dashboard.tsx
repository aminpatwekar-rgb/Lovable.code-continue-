import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Users,
  FileClock,
  ArrowRight,
  Sparkles,
  Inbox,
  Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useViewRole } from "@/lib/viewRole";
import { StatusBadge } from "@/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { daysLate, formatDue, type SubmissionStatus } from "@/lib/assignments";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Smart Assignment Hub" },
      {
        name: "description",
        content: "Your assignments, deadlines, submissions and completion progress at a glance.",
      },
      { property: "og:title", content: "Dashboard — Smart Assignment Hub" },
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
  tone = "text-primary bg-primary/10 border-primary/20",
}: {
  icon: typeof GraduationCap;
  label: string;
  value: number | string;
  tone?: string;
}) {
  return (
    <div className="panel p-5 relative overflow-hidden bg-card">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <div className={`p-2 rounded-lg border ${tone}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function Dashboard() {
  const { profile, role, user } = useAuth();
  const { effectiveRole } = useViewRole();

  const isTeacherView = effectiveRole === "teacher" || effectiveRole === "admin";

  const teacher = useQuery({
    enabled: isTeacherView,
    queryKey: ["teacher-dash", user?.id],
    queryFn: async () => {
      const { data: classes } = await supabase
        .from("classes")
        .select("id")
        .eq("teacher_id", user!.id);
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
          .eq("archived", false)
          .order("due_date", { ascending: true }),
      ]);
      const aIds = (assignments ?? []).map((a) => a.id);
      const { data: subs } = aIds.length
        ? await supabase
            .from("submissions")
            .select("id, status, assignment_id")
            .in("assignment_id", aIds)
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
    enabled: effectiveRole === "student",
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
            .eq("archived", false)
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

  const firstName = profile?.full_name?.trim().split(" ")[0] || "there";

  if (isTeacherView) {
    const d = teacher.data;
    return (
      <div className="space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-primary mb-1">
              <Sparkles className="size-3.5" />
              Teacher Workspace
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Welcome back, {firstName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Here is an overview of your active classes, assignments, and student submissions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link to="/classes">Manage Classes</Link>
            </Button>
            <Button asChild size="sm" className="h-9 gap-1.5">
              <Link to="/assignments">
                View Assignments <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </header>

        {teacher.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={GraduationCap}
              label="Active Classes"
              value={d?.classes ?? 0}
              tone="text-primary bg-primary/10 border-primary/20"
            />
            <Stat
              icon={Users}
              label="Enrolled Students"
              value={d?.students ?? 0}
              tone="text-info bg-info/10 border-info/20"
            />
            <Stat
              icon={BookOpen}
              label="Active Assignments"
              value={d?.assignments.length ?? 0}
              tone="text-success bg-success/10 border-success/20"
            />
            <Stat
              icon={FileClock}
              label="Pending Review"
              value={d?.pending ?? 0}
              tone="text-warning bg-warning/10 border-warning/20"
            />
          </div>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-foreground">
                Recent Assignments
              </h2>
              <p className="text-xs text-muted-foreground">
                Quick access to student progress and deadlines
              </p>
            </div>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <Link to="/assignments">
                All assignments <ArrowRight className="ml-1 size-3" />
              </Link>
            </Button>
          </div>

          {(d?.assignments ?? []).length === 0 ? (
            <div className="panel p-8 text-center border-dashed border-border/80">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="size-6" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">No assignments yet</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                {effectiveRole !== role
                  ? "Previewing as Teacher — no teacher data created for this account."
                  : "Create a class and post your first assignment to start collecting and grading student work."}
              </p>
              <div className="mt-4">
                <Button asChild size="sm">
                  <Link to="/classes">Get Started with Classes</Link>
                </Button>
              </div>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {(d?.assignments ?? []).slice(0, 6).map((a, i) => (
                  <motion.li
                    key={a.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{
                      delay: Math.min(i * 0.035, 0.3),
                      duration: 0.22,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <Link
                      to="/assignments/$assignmentId"
                      params={{ assignmentId: a.id }}
                      className="panel p-4 block transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 bg-card group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                          {a.title}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="size-3.5 text-muted-foreground/70" />
                        <span>Due {formatDue(a.due_date)}</span>
                      </div>
                    </Link>
                  </motion.li>
                ))}
              </AnimatePresence>
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
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-primary mb-1">
            <Sparkles className="size-3.5" />
            Student Dashboard
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track your tasks, upcoming deadlines, and study progress.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link to="/classes">Join Class</Link>
          </Button>
          <Button asChild size="sm" className="h-9 gap-1.5">
            <Link to="/assignments">
              Assignments <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      {student.isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={Clock}
              label="Pending Work"
              value={list.length - done}
              tone="text-warning bg-warning/10 border-warning/20"
            />
            <Stat
              icon={AlertTriangle}
              label="Overdue"
              value={overdue}
              tone="text-destructive bg-destructive/10 border-destructive/20"
            />
            <Stat
              icon={CheckCircle2}
              label="Completed"
              value={done}
              tone="text-success bg-success/10 border-success/20"
            />
            <Stat
              icon={GraduationCap}
              label="Enrolled Classes"
              value={student.data?.classes ?? 0}
              tone="text-info bg-info/10 border-info/20"
            />
          </div>

          <div className="panel p-5 bg-card">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Overall Completion</span>
                <span className="text-xs text-muted-foreground">
                  ({done} of {list.length} tasks completed)
                </span>
              </div>
              <span className="font-bold text-primary tabular-nums">{pct}%</span>
            </div>
            <Progress value={pct} className="mt-3.5 h-2.5 bg-secondary" />
          </div>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-foreground">
                  Your Assignments
                </h2>
                <p className="text-xs text-muted-foreground">
                  Stay ahead of due dates and submit work
                </p>
              </div>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <Link to="/assignments">
                  View all <ArrowRight className="ml-1 size-3" />
                </Link>
              </Button>
            </div>

            {list.length === 0 ? (
              <div className="panel p-8 text-center border-dashed border-border/80">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Inbox className="size-6" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">
                  No assignments active
                </h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                  {effectiveRole !== role
                    ? "Previewing as Student — no student data for this account."
                    : "You do not have any pending assignments. Join a class with your teacher's code to get started."}
                </p>
                {effectiveRole === role && (
                  <div className="mt-4">
                    <Button asChild size="sm">
                      <Link to="/classes">Join a Class</Link>
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <ul className="grid gap-3.5 sm:grid-cols-2">
                <AnimatePresence mode="popLayout">
                  {list.map((a, i) => {
                    const s = student.data?.byAssignment.get(a.id);
                    const late = a.due_date ? daysLate(a.due_date) : 0;
                    const status = (s?.status ?? "not_started") as SubmissionStatus;
                    const isOverdue =
                      late > 0 && ["not_started", "in_progress", "returned"].includes(status);
                    return (
                      <motion.li
                        key={a.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ delay: Math.min(i * 0.035, 0.3), duration: 0.22 }}
                      >
                        <Link
                          to="/assignments/$assignmentId"
                          params={{ assignmentId: a.id }}
                          className="panel p-4 block transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 bg-card group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                                {a.title}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                                {a.subject || "General"} ·{" "}
                                {(a.classes as { name: string } | null)?.name || "Class"}
                              </p>
                            </div>
                            <StatusBadge status={isOverdue ? "late" : status} />
                          </div>
                          <div className="mt-3.5 pt-3 border-t border-border/50 flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Clock className="size-3.5" /> Due {formatDue(a.due_date)}
                            </span>
                            {isOverdue && (
                              <span className="font-semibold text-destructive inline-flex items-center gap-1">
                                <AlertTriangle className="size-3" /> Late by {late}d
                              </span>
                            )}
                          </div>
                        </Link>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
