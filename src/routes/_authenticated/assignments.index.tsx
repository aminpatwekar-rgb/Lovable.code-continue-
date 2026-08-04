import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { daysLate, formatDue, type SubmissionStatus } from "@/lib/assignments";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/assignments/")({
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

const DONE = ["submitted", "reviewed", "completed", "late"];

function Assignments() {
  const { user, role } = useAuth();
  const isTeacher = role === "teacher" || role === "admin";

  const q = useQuery({
    queryKey: ["all-assignments", user?.id, role],
    enabled: Boolean(user && role),
    queryFn: async () => {
      if (isTeacher) {
        const { data } = await supabase
          .from("assignments")
          .select("id, title, subject, due_date, published, class_id, classes(name)")
          .eq("teacher_id", user!.id)
          .order("due_date", { ascending: true });
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
            .select("id, title, subject, due_date, published, class_id, classes(name)")
            .in("class_id", ids)
            .eq("published", true)
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

  const list = q.data?.list ?? [];
  const statusOf = (id: string) =>
    (q.data?.byAssignment.get(id)?.status ?? "not_started") as SubmissionStatus;

  const groups = {
    upcoming: list.filter(
      (a) => !DONE.includes(statusOf(a.id)) && daysLate(a.due_date) === 0,
    ),
    overdue: list.filter((a) => !DONE.includes(statusOf(a.id)) && daysLate(a.due_date) > 0),
    done: list.filter((a) => DONE.includes(statusOf(a.id))),
  };

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
        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming ({groups.upcoming.length})</TabsTrigger>
            <TabsTrigger value="overdue">Overdue ({groups.overdue.length})</TabsTrigger>
            <TabsTrigger value="done">
              {isTeacher ? "Archive" : "Done"} ({groups.done.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming" className="mt-5">
            <Grid items={groups.upcoming} />
          </TabsContent>
          <TabsContent value="overdue" className="mt-5">
            <Grid items={groups.overdue} />
          </TabsContent>
          <TabsContent value="done" className="mt-5">
            <Grid items={groups.done} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
