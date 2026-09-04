import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { bucketOf, daysLate, formatDue, type SubmissionStatus } from "@/lib/assignments";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AssignmentTab = "all" | "upcoming" | "overdue" | "done" | "review";

export const Route = createFileRoute("/_authenticated/assignments/")({
  // The tab lives in the URL so dashboard cards can deep-link into a filter.
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search['tab'] === "string" ? (search['tab'] as AssignmentTab) : ("upcoming" as const),
  }),
  head: () => ({
    meta: [
      { title: "Assignments — ONYX" },
      {
        name: "description",
        content: "Every assignment across your classes, grouped by upcoming, overdue and done.",
      },
      { property: "og:title", content: "Assignments — ONYX" },
      { property: "og:description", content: "All your assignments in one list." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Assignments,
});

const VALID: AssignmentTab[] = ["all", "upcoming", "overdue", "done", "review"];

function Assignments() {
  const { user, role } = useAuth();
  const navigate = useNavigate({ from: "/assignments/" });
  const { tab } = Route.useSearch();
  const isTeacher = role === "teacher" || role === "admin";

  const q = useQuery({
    queryKey: ["all-assignments", user?.id, role],
    enabled: Boolean(user && role),
    queryFn: async () => {
      if (isTeacher) {
        const { data, error } = await supabase
          .from("assignments")
          .select("id, title, subject, due_date, published, archived, class_id, classes(name)")
          .eq("teacher_id", user!.id)
          .order("due_date", { ascending: true });
        if (error) throw error;
        return { list: data ?? [], byAssignment: new Map<string, { status: string }>() };
      }
      const { data: m } = await supabase
        .from("class_members")
        .select("class_id")
        .eq("student_id", user!.id);
      const ids = (m ?? []).map((x) => x.class_id);
      const { data } = ids.length
        ? await supabase
            .from("assignments")
            .select("id, title, subject, due_date, published, archived, class_id, classes(name)")
            .in("class_id", ids)
            .eq("published", true)
            .eq("archived", false)
            .order("due_date", { ascending: true })
        : { data: [] };
      const { data: subs } = await supabase
        .from("submissions")
        .select("assignment_id, status, is_late")
        .eq("student_id", user!.id);
      return {
        list: data ?? [],
        byAssignment: new Map((subs ?? []).map((s) => [s.assignment_id, s])),
      };
    },
  });

  // Submissions waiting for the teacher — the same rows the dashboard counts.
  const review = useQuery({
    enabled: isTeacher && Boolean(user),
    queryKey: ["teacher-review-queue", user?.id],
    queryFn: async () => {
      const { data: mine } = await supabase
        .from("assignments")
        .select("id, title, classes(name)")
        .eq("teacher_id", user!.id);
      const ids = (mine ?? []).map((a) => a.id);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("submissions")
        .select("id, assignment_id, status, submitted_at, student_id")
        .in("assignment_id", ids)
        .in("status", ["submitted", "late"])
        .order("submitted_at", { ascending: true });
      const titles = new Map((mine ?? []).map((a) => [a.id, a]));
      return (data ?? []).map((s) => ({ ...s, assignment: titles.get(s.assignment_id) }));
    },
  });

  const list = q.data?.list ?? [];
  const statusOf = (id: string) =>
    (q.data?.byAssignment.get(id)?.status ?? "not_started") as SubmissionStatus;

  const live = list.filter((a) => !a.archived);
  const groups = {
    all: live,
    upcoming: live.filter((a) => bucketOf(a.due_date, statusOf(a.id)) === "upcoming"),
    overdue: live.filter((a) => bucketOf(a.due_date, statusOf(a.id)) === "overdue"),
    done: isTeacher
      ? list.filter((a) => a.archived)
      : live.filter((a) => bucketOf(a.due_date, statusOf(a.id)) === "done"),
  };

  const current: AssignmentTab = VALID.includes(tab) ? tab : "upcoming";

  function Grid({ items }: { items: typeof list }) {
    if (!items.length)
      return <p className="panel p-6 text-sm text-muted-foreground">Nothing here.</p>;
    return (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((a, i) => (
          <motion.li
            key={a.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.28 }}
          >
            <Link
              to="/assignments/$assignmentId"
              params={{ assignmentId: a.id }}
              className="panel lift block h-full p-4 hover:lift-hover"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="truncate font-medium">{a.title}</p>
                {!isTeacher && <StatusBadge status={statusOf(a.id)} />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {(a.classes as { name: string } | null)?.name} · {a.subject || "General"}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">Due {formatDue(a.due_date)}</p>
              {daysLate(a.due_date) > 0 && !isTeacher && statusOf(a.id) === "not_started" && (
                <p className="mt-1 text-sm font-medium text-destructive">Overdue</p>
              )}
            </Link>
          </motion.li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Assignments</h1>
        <p className="mt-1 text-muted-foreground">
          {isTeacher ? "Everything you've posted." : "Everything assigned to you."}
        </p>
      </header>

      {q.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <Tabs
          value={current}
          onValueChange={(v) =>
            void navigate({ to: ".", search: { tab: v as AssignmentTab }, replace: true })
          }
        >
          <TabsList className="flex-wrap">
            {isTeacher && <TabsTrigger value="all">All ({groups.all.length})</TabsTrigger>}
            <TabsTrigger value="upcoming">Upcoming ({groups.upcoming.length})</TabsTrigger>
            <TabsTrigger value="overdue">Overdue ({groups.overdue.length})</TabsTrigger>
            {isTeacher && (
              <TabsTrigger value="review">
                To review ({review.data?.length ?? 0})
              </TabsTrigger>
            )}
            <TabsTrigger value="done">
              {isTeacher ? "Archive" : "Submitted"} ({groups.done.length})
            </TabsTrigger>
          </TabsList>
          {isTeacher && (
            <TabsContent value="all" className="mt-5">
              <Grid items={groups.all} />
            </TabsContent>
          )}
          <TabsContent value="upcoming" className="mt-5">
            <Grid items={groups.upcoming} />
          </TabsContent>
          <TabsContent value="overdue" className="mt-5">
            <Grid items={groups.overdue} />
          </TabsContent>
          {isTeacher && (
            <TabsContent value="review" className="mt-5">
              {review.isLoading ? (
                <Skeleton className="h-24 w-full rounded-xl" />
              ) : (review.data ?? []).length === 0 ? (
                <p className="panel p-6 text-sm text-muted-foreground">
                  Nothing waiting for review.
                </p>
              ) : (
                <ul className="panel divide-y divide-border">
                  {(review.data ?? []).map((s) => (
                    <li key={s.id}>
                      <Link
                        to="/submissions/$submissionId"
                        params={{ submissionId: s.id }}
                        className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {s.assignment?.title ?? "Assignment"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(s.assignment?.classes as { name: string } | null)?.name} ·{" "}
                            {s.submitted_at
                              ? new Date(s.submitted_at).toLocaleString()
                              : "Not submitted"}
                          </p>
                        </div>
                        <StatusBadge status={s.status as SubmissionStatus} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          )}
          <TabsContent value="done" className="mt-5">
            <Grid items={groups.done} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
