import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown, Medal, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — ONYX" },
      { name: "description", content: "Class and platform rankings in ONYX." },
      { property: "og:title", content: "Leaderboard — ONYX" },
      { property: "og:description", content: "Class and platform rankings in ONYX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type Row = { studentId: string; name: string; points: number; badges: number };

function Page() {
  const { user } = useAuth();
  const [classId, setClassId] = useState("all");

  const data = useQuery({
    queryKey: ["leaderboard", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const [{ data: points, error }, { data: badges }, { data: classes }] = await Promise.all([
        supabase.from("student_points").select("student_id, class_id, points"),
        supabase.from("student_badges").select("student_id, class_id"),
        supabase.from("classes").select("id, name"),
      ]);
      if (error) throw error;

      const ids = [...new Set((points ?? []).map((p) => p.student_id))];
      const profiles = ids.length
        ? (await supabase.from("profiles").select("id, full_name").in("id", ids)).data
        : [];

      return {
        points: points ?? [],
        badges: badges ?? [],
        classes: classes ?? [],
        names: Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name])),
      };
    },
  });

  const rows: Row[] = useMemo(() => {
    if (!data.data) return [];
    const tally = new Map<string, Row>();
    for (const p of data.data.points) {
      if (classId !== "all" && p.class_id !== classId) continue;
      const row = tally.get(p.student_id) ?? {
        studentId: p.student_id,
        name: data.data.names[p.student_id] ?? "Student",
        points: 0,
        badges: 0,
      };
      row.points += Number(p.points) || 0;
      tally.set(p.student_id, row);
    }
    for (const b of data.data.badges) {
      if (classId !== "all" && b.class_id !== classId) continue;
      const row = tally.get(b.student_id);
      if (row) row.badges += 1;
    }
    return [...tally.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [data.data, classId]);

  const myRank = rows.findIndex((r) => r.studentId === user?.id);

  if (data.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
          <p className="text-sm text-muted-foreground">
            Points earned from graded quizzes and assignments.
          </p>
        </div>
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="w-56" aria-label="Filter by class">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {(data.data?.classes ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      {myRank >= 0 && (
        <div className="panel flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <Trophy className="size-5 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-sm font-medium">Your position</p>
              <p className="text-xs text-muted-foreground">
                {rows[myRank]!.badges} badge{rows[myRank]!.badges === 1 ? "" : "s"} earned
              </p>
            </div>
          </div>
          <p className="text-xl font-semibold tabular-nums">
            #{myRank + 1} · {rows[myRank]!.points} pts
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="panel p-10 text-center">
          <Trophy className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 font-medium">Nothing ranked yet</p>
          <p className="text-sm text-muted-foreground">
            Points appear here as soon as quizzes and assignments are graded.
          </p>
        </div>
      ) : (
        <ol className="panel divide-y divide-border">
          {rows.map((row, i) => (
            <li
              key={row.studentId}
              className={`flex items-center justify-between gap-3 p-4 ${
                row.studentId === user?.id ? "bg-primary/5" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-8 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                  {i === 0 ? (
                    <Crown className="mx-auto size-4 text-primary" aria-label="First place" />
                  ) : i < 3 ? (
                    <Medal className="mx-auto size-4 text-muted-foreground" aria-hidden />
                  ) : (
                    i + 1
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.badges} badge{row.badges === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="tabular-nums">
                {row.points} pts
              </Badge>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
