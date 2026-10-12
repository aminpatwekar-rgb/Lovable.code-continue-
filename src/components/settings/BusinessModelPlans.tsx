import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Crown, Minus, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlanSummary } from "@/lib/onyx.features.functions";
import { useAuth } from "@/lib/auth";

const TIER_ORDER = ["free", "core", "orbit", "nexus", "apex"];

const TIER_COPY: Record<string, { tagline: string; subtitle: string }> = {
  free: {
    tagline: "Try ONYX with a small class",
    subtitle: "Core assignments and manual quizzes stay unlimited; class size, AI, storage and saved questions are tightly capped.",
  },
  core: {
    tagline: "Single-faculty classroom utility",
    subtitle: "More room for one teacher or a small teaching team.",
  },
  orbit: {
    tagline: "Multi-cohort powerhouse",
    subtitle: "More cohorts, saved questions, analytics and quiz controls.",
  },
  nexus: {
    tagline: "Departmental federation & oversight",
    subtitle: "Department-sized rollout with lockdown controls and reporting.",
  },
  apex: {
    tagline: "Institutional white-label & custom agreement",
    subtitle: "Institution-wide rollout with negotiated limits and branding.",
  },
};

const FEATURE_ROWS: { key: string; label: string }[] = [
  { key: "question_bank", label: "Saved question bank" },
  { key: "rubrics", label: "Rubric-based grading" },
  { key: "attendance", label: "Attendance tracking" },
  { key: "calendar", label: "Class calendar" },
  { key: "advanced_analytics", label: "Advanced analytics" },
  { key: "csv_import", label: "Student CSV import" },
  { key: "csv_export", label: "Grade CSV export" },
  { key: "quiz_randomization", label: "Quiz question / choice randomization" },
  { key: "time_attempt_controls", label: "Timed quizzes and attempt controls" },
  { key: "lockdown", label: "Lockdown quiz controls" },
  { key: "progress_reports", label: "Detailed student progress reports" },
  { key: "remove_branding", label: "White-label branding" },
];

function limitLabel(value: unknown, suffix = "") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n < 0) return "Unlimited";
  return `${n.toLocaleString("en-IN")}${suffix}`;
}

function storageLabel(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n < 0) return "Unlimited";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toLocaleString("en-IN", { maximumFractionDigits: 1 })} GB`;
  return `${Math.round(n / 1024 ** 2).toLocaleString("en-IN")} MB`;
}

function Price({ plan }: { plan: any }) {
  if (plan.code === "apex") return <span className="text-2xl font-bold">Bespoke</span>;
  return <span className="text-2xl font-bold">₹{Number(plan.monthly_price_inr).toLocaleString("en-IN")}</span>;
}

export function BusinessModelPlans() {
  const { role } = useAuth();
  const getPlan = useServerFn(getPlanSummary);
  const q = useQuery({
    queryKey: ["business-model-plans"],
    queryFn: () => getPlan(),
    staleTime: 60_000,
  });

  if (q.isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading plans…</CardContent></Card>;
  if (q.isError) return <Card><CardContent className="p-6 text-sm text-destructive">Could not load plan information.</CardContent></Card>;

  const current = q.data.plan;
  const plans = (q.data as any).plans ?? [];
  const catalog = plans
    .filter((p: any) => TIER_ORDER.includes(p.code))
    .sort((a: any, b: any) => TIER_ORDER.indexOf(a.code) - TIER_ORDER.indexOf(b.code));

  return (
    <div className="space-y-5">
      <Card className="lift">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-5 text-primary" />ONYX Plans & Pricing</CardTitle>
          <CardDescription>
            The core academic workflow stays open on every plan: unlimited assignments, unlimited manually authored quizzes,
            submissions, grading, feedback, class resources, announcements, discussions and notifications. Upgrade for more capacity and advanced tools.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {catalog.map((p: any) => {
          const isCurrent = current?.code === p.code;
          const limits = p.limits ?? {};
          const highlighted = p.code === "nexus";
          const copy = TIER_COPY[p.code] ?? { tagline: "", subtitle: "" };
          return (
            <Card key={p.code} className={highlighted ? "border-primary/50 shadow-md" : p.code === "apex" ? "border-dashed" : ""}>
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg tracking-wide">{p.name}</CardTitle>
                  {highlighted && <Crown aria-label="Featured plan" className="size-4 text-primary" />}
                </div>
                <p className="min-h-10 text-xs font-medium text-primary">{copy.tagline}</p>
                <div className="pt-1">
                  <Price plan={p} />
                  {p.code !== "apex" && <span className="text-sm text-muted-foreground"> / month</span>}
                </div>
                <CardDescription className="min-h-10 text-xs">
                  {p.code === "apex"
                    ? "Custom annual agreement"
                    : `₹${Number(p.annual_price_inr).toLocaleString("en-IN")} / year`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{copy.subtitle}</p>
                <div className="space-y-2 rounded-lg border border-border/70 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">Classes</span>
                    <span className="text-right font-semibold">{limitLabel(limits.max_classes)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">Students / class</span>
                    <span className="text-right font-semibold">{limitLabel(limits.max_students_per_class)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">AI quiz questions / month</span>
                    <span className="text-right font-semibold">{limitLabel(limits.ai_questions_per_month)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">Cloud storage</span>
                    <span className="text-right font-semibold">{storageLabel(limits.storage_bytes)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground">Saved question bank</span>
                    <span className="text-right font-semibold">{limitLabel(limits.question_bank_total)}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Assignments: unlimited · Manual quizzes: unlimited</p>
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>Current plan</Button>
                ) : role === "admin" ? (
                  <Button variant="outline" className="w-full" disabled>Admin — unlimited access</Button>
                ) : p.code === "apex" ? (
                  <Button className="w-full" variant="outline" disabled>Custom agreement required</Button>
                ) : (
                  <Button className="w-full" variant="outline" disabled title="Plan-aware checkout is not enabled yet">
                    Checkout not enabled yet
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Feature comparison</CardTitle>
          <CardDescription>Features marked as included are available to the plan owner. Class, storage, question-bank and AI quotas are shown above. The saved question-bank cap applies only to reusable bank items, never to questions written directly inside a manual quiz.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-3 text-left font-semibold">Workflow / feature</th>
                  {catalog.map((p: any) => (
                    <th key={p.code} scope="col" className="px-3 py-3 text-center font-semibold">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  "Unlimited assignment creation",
                  "Unlimited manual quiz creation",
                  "Handwritten and typed submissions",
                  "File attachments and reference links",
                  "Grading, feedback and returned work",
                  "Class resources, announcements and discussions",
                  "Notifications and deadline reminders",
                  "Notebook, typed writing and math tools",
                  "Global search, achievements and leaderboard",
                  "Co-teacher collaboration with owner approval",
                ].map((label) => (
                  <tr key={label} className="border-b border-border/60">
                    <th scope="row" className="px-3 py-3 text-left font-medium">{label}</th>
                    {catalog.map((p: any) => (
                      <td key={p.code} className="px-3 py-3 text-center"><Check aria-label="Included" className="mx-auto size-4 text-primary" /></td>
                    ))}
                  </tr>
                ))}
                {FEATURE_ROWS.map((feature) => (
                  <tr key={feature.key} className="border-b border-border/60 last:border-0">
                    <th scope="row" className="px-3 py-3 text-left font-medium">{feature.label}</th>
                    {catalog.map((p: any) => {
                      const included = Boolean((p.features ?? {})[feature.key]);
                      return (
                        <td key={p.code} className="px-3 py-3 text-center">
                          {included
                            ? <Check aria-label="Included" className="mx-auto size-4 text-primary" />
                            : <Minus aria-label="Not included" className="mx-auto size-4 text-muted-foreground/60" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            APEX uses custom institutional terms. Its displayed quotas are defaults and can be adjusted against the signed agreement.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
