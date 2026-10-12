import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Crown, Minus, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlanSummary } from "@/lib/onyx.features.functions";
import { useAuth } from "@/lib/auth";

const TIER_ORDER = ["free", "core", "orbit", "nexus", "apex"];

const TIER_CATALOG = [
  { code: "free", name: "SPARK", monthly_price_inr: 0, annual_price_inr: 0, limits: { max_classes: 1, max_students_per_class: 30, ai_questions_per_month: 10, storage_bytes: 524288000, question_bank_total: 50 }, features: { question_bank: true, rubrics: true, attendance: false, calendar: false, advanced_analytics: false, csv_import: false, csv_export: true, quiz_randomization: false, time_attempt_controls: false, lockdown: false, progress_reports: false, remove_branding: false } },
  { code: "core", name: "CORE", monthly_price_inr: 499, annual_price_inr: 4990, limits: { max_classes: 3, max_students_per_class: 60, ai_questions_per_month: 75, storage_bytes: 1073741824, question_bank_total: 200 }, features: { question_bank: true, rubrics: true, attendance: true, calendar: true, advanced_analytics: false, csv_import: false, csv_export: true, quiz_randomization: false, time_attempt_controls: false, lockdown: false, progress_reports: false, remove_branding: false } },
  { code: "orbit", name: "ORBIT", monthly_price_inr: 2999, annual_price_inr: 29990, limits: { max_classes: 10, max_students_per_class: 100, ai_questions_per_month: 250, storage_bytes: 8589934592, question_bank_total: -1 }, features: { question_bank: true, rubrics: true, attendance: true, calendar: true, advanced_analytics: false, csv_import: false, csv_export: true, quiz_randomization: true, time_attempt_controls: true, lockdown: true, progress_reports: false, remove_branding: false } },
  { code: "nexus", name: "NEXUS", monthly_price_inr: 10000, annual_price_inr: 100000, limits: { max_classes: 30, max_students_per_class: 400, ai_questions_per_month: 1000, storage_bytes: 53687091200, question_bank_total: -1 }, features: { question_bank: true, rubrics: true, attendance: true, calendar: true, advanced_analytics: true, csv_import: true, csv_export: true, quiz_randomization: true, time_attempt_controls: true, lockdown: true, progress_reports: true, remove_branding: false } },
  { code: "apex", name: "APEX", monthly_price_inr: 0, annual_price_inr: 0, limits: { max_classes: -1, max_students_per_class: -1, ai_questions_per_month: 2000, storage_bytes: 107374182400, question_bank_total: -1 }, features: { question_bank: true, rubrics: true, attendance: true, calendar: true, advanced_analytics: true, csv_import: true, csv_export: true, quiz_randomization: true, time_attempt_controls: true, lockdown: true, progress_reports: true, remove_branding: true } },
];

const TIER_COPY: Record<string, { tagline: string; subtitle: string }> = {
  free: {
    tagline: "Zero-friction sandbox & pilot cohort",
    subtitle: "Start a class and run the complete academic workflow for free.",
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

const FEATURE_DETAILS: { key: string; label: string; description: string }[] = [
  { key: "assignments", label: "Unlimited assignments", description: "Create and publish as many assignments as needed, with deadlines and submission instructions." },
  { key: "manual_quizzes", label: "Unlimited manual quizzes", description: "Write your own quizzes and questions without using AI-generation credits. Saved question-bank limits never limit questions written directly inside a quiz." },
  { key: "submissions", label: "Handwritten and typed submissions", description: "Students can submit work in handwriting-first or typed formats, depending on the assignment settings." },
  { key: "attachments", label: "File attachments and reference links", description: "Attach supported files and provide links or reference materials to guide student work." },
  { key: "grading", label: "Grading and feedback", description: "Review submissions, award marks, leave feedback, and return graded work to students." },
  { key: "class_content", label: "Resources, announcements and discussions", description: "Share class materials and updates, and keep class conversations together in ONYX." },
  { key: "notifications", label: "Notifications and deadline reminders", description: "Keep students and teachers informed about relevant class activity and upcoming deadlines." },
  { key: "notebook", label: "Notebook, typed writing and math tools", description: "Use the built-in writing workflow and math-entry tools for academic work." },
  { key: "collaboration", label: "Co-teacher collaboration", description: "Collaborate with other teachers in a class, subject to class-owner permissions." },
  { key: "question_bank", label: "Saved question bank", description: "Save reusable questions for future quizzes. The plan's item cap applies only to saved reusable bank items." },
  { key: "rubrics", label: "Rubric-based grading", description: "Use grading rubrics to make marking criteria more consistent and transparent." },
  { key: "attendance", label: "Attendance tracking", description: "Record and review student attendance for your classes." },
  { key: "calendar", label: "Class calendar", description: "Organize class events and keep important academic dates visible." },
  { key: "advanced_analytics", label: "Advanced analytics", description: "Review broader class and quiz performance patterns to help identify where students may need support." },
  { key: "csv_import", label: "Student CSV import", description: "Import student roster data in bulk using a supported CSV file." },
  { key: "csv_export", label: "Grade CSV export", description: "Export grade data for reporting or further analysis." },
  { key: "quiz_randomization", label: "Quiz question and choice randomization", description: "Randomize question order and answer choices to create varied quiz attempts." },
  { key: "time_attempt_controls", label: "Timed quizzes and attempt controls", description: "Configure quiz time limits and control student attempts where supported." },
  { key: "lockdown", label: "Lockdown quiz controls", description: "Use additional quiz restrictions intended to reduce opportunities for leaving the quiz workflow." },
  { key: "progress_reports", label: "Detailed student progress reports", description: "Review individual student progress through more detailed reporting." },
  { key: "remove_branding", label: "White-label branding", description: "Customize the ONYX experience under institutional branding as agreed for the APEX plan." },
  { key: "search_achievements", label: "Global search, achievements and leaderboard", description: "Find relevant areas of the app and use class achievement and leaderboard features where available." },
];

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
  // Render the complete five-tier catalogue independently of database migration state.
  // The database still determines the user's current subscription; pricing cards must not
  // silently disappear when an older billing_plans table contains only the free plan.
  const catalog = TIER_CATALOG;

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
                <Dialog>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" className="w-full">View all features</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{p.name} — plan features</DialogTitle>
                      <DialogDescription>
                        {p.code === "apex" ? "Custom institutional agreement and default quotas." : `₹${Number(p.monthly_price_inr).toLocaleString("en-IN")} per month · ₹${Number(p.annual_price_inr).toLocaleString("en-IN")} per year`}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm sm:grid-cols-3">
                        <div><p className="text-muted-foreground">Classes</p><p className="font-semibold">{limitLabel(limits.max_classes)}</p></div>
                        <div><p className="text-muted-foreground">Students / class</p><p className="font-semibold">{limitLabel(limits.max_students_per_class)}</p></div>
                        <div><p className="text-muted-foreground">AI questions / month</p><p className="font-semibold">{limitLabel(limits.ai_questions_per_month)}</p></div>
                        <div><p className="text-muted-foreground">Cloud storage</p><p className="font-semibold">{storageLabel(limits.storage_bytes)}</p></div>
                        <div><p className="text-muted-foreground">Saved question bank</p><p className="font-semibold">{limitLabel(limits.question_bank_total)} items</p></div>
                      </div>
                      <div className="max-h-[45dvh] space-y-3 overflow-y-auto pr-1">
                        {FEATURE_DETAILS.map((feature) => {
                          const alwaysIncluded = ["assignments", "manual_quizzes", "submissions", "attachments", "grading", "class_content", "notifications", "notebook", "collaboration", "search_achievements"].includes(feature.key);
                          const included = alwaysIncluded || Boolean((p.features ?? {})[feature.key]);
                          return (
                            <div key={feature.key} className="flex items-start gap-3 border-b border-border/60 pb-3 last:border-0">
                              {included ? <Check className="mt-0.5 size-4 shrink-0 text-primary" /> : <Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{feature.label}</p>
                                <p className="text-xs text-muted-foreground">{feature.description}</p>
                                {!included && <p className="mt-1 text-xs text-muted-foreground">Not included in this plan.</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
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
