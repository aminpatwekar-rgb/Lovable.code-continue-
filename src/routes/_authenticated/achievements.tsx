import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, Lock, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/achievements")({
  head: () => ({
    meta: [
      { title: "Achievements — ONYX" },
      { name: "description", content: "Badges you have earned in ONYX." },
      { property: "og:title", content: "Achievements — ONYX" },
      { property: "og:description", content: "Badges you have earned in ONYX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const { user } = useAuth();

  const data = useQuery({
    queryKey: ["achievements", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const [{ data: badges, error }, { data: mine }, { data: points }] = await Promise.all([
        supabase.from("badges").select("id, code, name, description, icon, tone, points"),
        supabase
          .from("student_badges")
          .select("badge_id, awarded_at, reason")
          .eq("student_id", user!.id),
        supabase.from("student_points").select("points").eq("student_id", user!.id),
      ]);
      if (error) throw error;
      return {
        badges: badges ?? [],
        earned: new Map((mine ?? []).map((b) => [b.badge_id, b])),
        total: (points ?? []).reduce((s, p) => s + (Number(p.points) || 0), 0),
      };
    },
  });

  if (data.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (data.isError) {
    return (
      <div className="panel p-6 text-sm text-destructive">
        Couldn't load achievements. {(data.error as Error).message}
      </div>
    );
  }

  const { badges, earned, total } = data.data!;
  const unlocked = badges.filter((b) => earned.has(b.id));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Achievements</h1>
        <p className="text-sm text-muted-foreground">
          {unlocked.length} of {badges.length} badges unlocked · {total} points earned
        </p>
      </header>

      {badges.length === 0 ? (
        <div className="panel p-10 text-center">
          <Award className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 font-medium">No badges configured yet</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((b) => {
            const award = earned.get(b.id);
            return (
              <article
                key={b.id}
                className={`panel space-y-2 p-5 ${award ? "" : "opacity-60"}`}
                aria-label={`${b.name}${award ? " (unlocked)" : " (locked)"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-2xl" aria-hidden>
                    {b.icon}
                  </span>
                  {award ? (
                    <Badge variant="secondary" className="gap-1">
                      <Sparkles className="size-3" /> Unlocked
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <Lock className="size-3" /> Locked
                    </Badge>
                  )}
                </div>
                <h2 className="font-medium">{b.name}</h2>
                <p className="text-sm text-muted-foreground">{b.description ?? ""}</p>
                <p className="text-xs text-muted-foreground">
                  {award
                    ? `Earned ${new Date(award.awarded_at).toLocaleDateString(undefined, { dateStyle: "medium" })}`
                    : `Worth ${b.points} points`}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
