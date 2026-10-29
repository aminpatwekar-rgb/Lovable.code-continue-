import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDue } from "@/lib/assignments";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/progress")({
  head: () => ({
    meta: [
      { title: "My Progress — ONYX" },
      { name: "description", content: "Your completion, missing work and grades for every class." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const DONE = ["submitted", "late", "reviewed", "completed"];
const GRADED = ["reviewed", "completed"];

type Row = {
  id: string;
  title: string;
  due_date: string | null;
  max_marks: number | null;
  class_id: string;
  classes: { name: string } | null;
};

function Page() {
  const { user } = useAuth();

  const q = useQuery({
    enabled: Boolean(user),
    queryKey: ["student-progress", user?.id],
    queryFn: async () => {
      const { data: memberships, error: mErr } = await supabase
        .from("class_members")
        .select("class_id")
        .eq("student_id", user!.id);
      if (mErr) throw mErr;
      const classIds = (memberships ?? []).map((m) => m.class_id);
      if (!classIds.length) return { rows: [] as Row[], subs: new Map<string, { status: string; marks_awarded: number | null }>() };

      const { data: rows, error: aErr } = await supabase
        .from("assignments")
        .select("id, title, due_date, max_marks, class_id, classes(name)")
        .in("class_id", classIds)
        .eq("published", true)
        .eq("archived", false)
        .order("due_date", { ascending: true });
      if (aErr) throw aErr;

      const { data: subs, error: sErr } = await supabase
        .from("submissions")
        .select("assignment_id, status, marks_awarded")
        .eq("student_id", user!.id);
      if (sErr) throw sErr;

      return {
        rows: (rows ?? []) as unknown as Row[],
        subs: new Map((subs ?? []).map((s) => [s.assignment_id, s])),
      };
    },
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }
  if (q.isError) {
    return <p className="panel p-6 text-sm text-muted-foreground">Couldn't load your progress. Please refresh.</p>;
  }

  const rows = q.data?.rows ?? [];
  const subs = q.data?.subs ?? new Map();
  const now = Date.now();

  const isDone = (id: string) => DONE.includes(subs.get(id)?.status ?? "");
  const isMissing = (r: Row) => !isDone(r.id) && r.due_date !== null && new Date(r.due_date).getTime() < now;

  const byClass = new Map<string, { name: string; items: Row[] }>();
  for (const r of rows) {
    const entry = byClass.get(r.class_id) ?? { name: r.classes?.name ?? "Class", items: [] };
    entry.items.push(r);
    byClass.set(r.class_id, entry);
  }

  const missing = rows.filter(isMissing);
  const upcoming = rows.filter((r) => !isDone(r.id) && !isMissing(r)).slice(0, 5);

  function avgFor(items: Row[]) {
    let got = 0;
    let max = 0;
    for (const r of items) {
      const s = subs.get(r.id);
      if (s && GRADED.includes(s.status) && s.marks_awarded != null && r.max_marks) {
        got += Number(s.marks_awarded);
        max += Number(r.max_marks);
      }
    }
    return max > 0 ? Math.round((got / max) * 100) : null;
  }

  const overallDone = rows.filter((r) => isDone(r.id)).length;
  const overallPct = rows.length ? Math.round((overallDone / rows.length) * 100) : 0;
  const overallAvg = avgFor(rows);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-semibold">My Progress</h1>
        <p className="mt-1 text-muted-foreground">Where you stand in every class.</p>
      </header>

      {rows.length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">
          Nothing to track yet. Once your classes post assignments, your progress shows up here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="panel p-4">
              <CheckCircle2 className="size-4 text-primary" />
              <p className="mt-2 text-2xl font-semibold">{overallPct}%</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
            <div className="panel p-4">
              <AlertTriangle className="size-4 text-destructive" />
              <p className="mt-2 text-2xl font-semibold">{missing.length}</p>
              <p className="text-xs text-muted-foreground">Missing</p>
            </div>
            <div className="panel p-4">
              <TrendingUp className="size-4 text-primary" />
              <p className="mt-2 text-2xl font-semibold">{overallAvg === null ? "—" : `${overallAvg}%`}</p>
              <p className="text-xs text-muted-foreground">Avg. grade</p>
            </div>
          </div>

          {missing.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Missing work</h2>
              <ul className="space-y-2">
                {missing.map((r) => (
                  <li key={r.id}>
                    <Link
                      to="/assignments/$assignmentId"
                      params={{ assignmentId: r.id }}
                      className="panel flex items-center justify-between gap-3 p-3 hover:lift-hover"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{r.title}</span>
                        <span className="block text-xs text-muted-foreground">{r.classes?.name}</span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-destructive">
                        Was due {formatDue(r.due_date)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {upcoming.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Coming up</h2>
              <ul className="space-y-2">
                {upcoming.map((r) => (
                  <li key={r.id}>
                    <Link
                      to="/assignments/$assignmentId"
                      params={{ assignmentId: r.id }}
                      className="panel flex items-center justify-between gap-3 p-3 hover:lift-hover"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{r.title}</span>
                        <span className="block text-xs text-muted-foreground">{r.classes?.name}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" /> {formatDue(r.due_date)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-base font-semibold">By class</h2>
            <ul className="space-y-3">
              {[...byClass.entries()].map(([id, c]) => {
                const done = c.items.filter((r) => isDone(r.id)).length;
                const pct = Math.round((done / c.items.length) * 100);
                const avg = avgFor(c.items);
                const miss = c.items.filter(isMissing).length;
                return (
                  <li key={id} className="panel space-y-2 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <Link to="/classes/$classId" params={{ classId: id }} className="truncate font-medium hover:underline">
                        {c.name}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {done}/{c.items.length} done
                        {avg !== null && ` · ${avg}% avg`}
                        {miss > 0 && ` · ${miss} missing`}
                      </span>
                    </div>
                    <Progress value={pct} />
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
