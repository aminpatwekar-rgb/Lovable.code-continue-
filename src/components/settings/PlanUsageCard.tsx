import { useQuery } from "@tanstack/react-query";
import { HardDrive, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getPlanSummary } from "@/lib/onyx.features.functions";

function bytes(n: number) {
  if (n < 0) return "Unlimited";
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

function limit(n: unknown) {
  const value = Number(n);
  if (!Number.isFinite(value)) return "—";
  return value < 0 ? "Unlimited" : value.toLocaleString("en-IN");
}

export function PlanUsageCard() {
  const get = useServerFn(getPlanSummary);
  const q = useQuery({ queryKey: ["plan-summary"], queryFn: () => get(), staleTime: 30_000 });

  if (q.isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading plan…</CardContent></Card>;
  if (q.isError) return <Card><CardContent className="p-6 text-sm text-destructive">Could not load plan information.</CardContent></Card>;

  const plan = q.data.plan;
  const limits = (plan?.limits ?? {}) as Record<string, number>;
  const features = (plan?.features ?? {}) as Record<string, boolean>;
  const storageLimit = Number(limits.storage_bytes ?? 0);
  const storageUsed = Number(q.data.storageUsed ?? 0);
  const storagePct = storageLimit > 0 ? Math.min(100, (storageUsed / storageLimit) * 100) : 0;

  const stats = [
    ["Classes", limit(limits.max_classes)],
    ["Students / class", limit(limits.max_students_per_class)],
    ["AI quiz questions / month", limit(limits.ai_questions_per_month)],
    ["Assignments / month", limit(limits.assignments_per_month)],
    ["Manual quizzes / month", limit(limits.quizzes_per_month)],
    ["Saved question bank", limit(limits.question_bank_total)],
  ];

  return (
    <Card className="lift">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="size-5 text-primary" />{plan?.name ?? "SPARK"} plan</CardTitle>
        <CardDescription>
          Assignments and manually authored quizzes are unlimited. AI-generated quiz questions, classes, student capacity and storage follow your plan limits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2"><HardDrive className="size-4" />Cloud storage</span>
            <span className="text-right text-muted-foreground">{bytes(storageUsed)} / {storageLimit < 0 ? "Unlimited" : bytes(storageLimit)}</span>
          </div>
          <Progress value={storagePct} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border p-3">
              <span className="text-muted-foreground">{label}</span>
              <p className="mt-1 font-semibold">{value}</p>
            </div>
          ))}
          <div className="col-span-2 rounded-lg border border-border p-3 sm:col-span-3">
            <span className="text-muted-foreground">Included plan features</span>
            <p className="mt-1 font-semibold">{Object.values(features).filter(Boolean).length} enabled</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
