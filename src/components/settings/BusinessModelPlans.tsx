import { useState } from "react";
import { Check, Crown, Sparkles, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";

type FeatureDetail = { title: string; description: string };
type Plan = {
  code: string;
  name: string;
  price: number | null;
  description: string;
  classes: string;
  students: string;
  storage: string;
  ai: string;
  features: string[];
  details: FeatureDetail[];
  featured?: boolean;
};

const plans: Plan[] = [
  {
    code: "spark",
    name: "SPARK",
    price: 0,
    description: "Zero-Friction Sandbox & Pilot Cohort",
    classes: "1 class",
    students: "30 students/class",
    storage: "500 MB storage",
    ai: "10 AI quiz questions/month",
    features: [
      "Unlimited manual assignments",
      "Unlimited manual quizzes",
      "Core submissions, grading and feedback",
      "Resources, announcements and discussions",
    ],
    details: [
      { title: "1 class · 30 students", description: "Run one classroom with up to 30 students in that class." },
      { title: "500 MB cloud storage", description: "Store supported class materials and submissions within the plan's displayed storage allowance." },
      { title: "10 AI quiz questions/month", description: "Use AI-assisted quiz generation for up to 10 generated questions each month." },
      { title: "Unlimited manual assignments", description: "Create assignments manually without a plan-based count limit." },
      { title: "Unlimited manual quizzes", description: "Build quizzes yourself without a plan-based limit on the number of quizzes or manual questions." },
      { title: "Submissions, grading and feedback", description: "Collect student work, review submissions, award marks and provide feedback." },
      { title: "Resources", description: "Share learning materials and reference files with the class." },
      { title: "Announcements", description: "Post important class updates for students." },
      { title: "Discussions", description: "Give students and educators a place for class-related discussion." },
    ],
  },
  {
    code: "core",
    name: "CORE",
    price: 499,
    description: "Single-Faculty Classroom Utility",
    classes: "3 classes",
    students: "60 students/class",
    storage: "2 GB storage",
    ai: "50 AI quiz questions/month",
    features: [
      "Everything in SPARK",
      "Unlimited assignments and manual quizzes",
      "More classroom capacity and storage",
      "Expanded AI quiz generation",
    ],
    details: [
      { title: "3 classes · 60 students/class", description: "Manage up to three classes, each with capacity for up to 60 students." },
      { title: "2 GB cloud storage", description: "A larger storage allowance for class resources and submitted work." },
      { title: "50 AI quiz questions/month", description: "Generate up to 50 quiz questions with AI each month." },
      { title: "Everything in SPARK", description: "Includes core submissions, grading and feedback, resources, announcements and discussions." },
      { title: "Unlimited assignments and manual quizzes", description: "Assignment creation and manually authored quizzes remain unlimited; manual quiz questions are not capped by this plan." },
      { title: "Designed for one faculty", description: "More room for an educator managing multiple classes and regular course activities." },
    ],
  },
  {
    code: "orbit",
    name: "ORBIT",
    price: 2499,
    description: "Multi-Cohort Powerhouse & Proctoring",
    classes: "10 classes",
    students: "100 students/class",
    storage: "10 GB storage",
    ai: "200 AI quiz questions/month",
    features: [
      "Everything in CORE",
      "Advanced grading and rubric grading",
      "Attendance and classroom management tools",
      "Quiz controls and proctoring features",
    ],
    featured: true,
    details: [
      { title: "10 classes · 100 students/class", description: "Manage multiple cohorts with capacity for up to 100 students in each class." },
      { title: "10 GB cloud storage", description: "More space for course resources, assignment attachments and student submissions." },
      { title: "200 AI quiz questions/month", description: "Generate up to 200 quiz questions with AI each month." },
      { title: "Advanced grading and rubrics", description: "Use rubric-oriented grading workflows to assess work against defined criteria." },
      { title: "Attendance and classroom management", description: "Organise class attendance and day-to-day classroom activities." },
      { title: "Quiz controls", description: "Access expanded quiz settings and assessment controls where supported in ONYX." },
      { title: "Proctoring features", description: "Access the plan's proctoring-oriented quiz controls where supported in ONYX." },
      { title: "Everything in CORE", description: "Includes the CORE plan's resources, announcements, discussions, submissions, grading and unlimited manual assignments and quizzes." },
    ],
  },
  {
    code: "nexus",
    name: "NEXUS",
    price: 9999,
    description: "Departmental Federation & Oversight",
    classes: "30 classes",
    students: "100 students/class",
    storage: "30 GB storage",
    ai: "1,000 AI quiz questions/month",
    features: [
      "Everything in ORBIT",
      "Department-level oversight and analytics",
      "Expanded multi-cohort administration",
      "Priority support for larger deployments",
    ],
    details: [
      { title: "30 classes · 100 students/class", description: "Support a larger multi-class deployment with up to 100 students in each class." },
      { title: "30 GB cloud storage", description: "A larger storage allowance for materials and submitted work across classes." },
      { title: "1,000 AI quiz questions/month", description: "Generate up to 1,000 quiz questions with AI each month." },
      { title: "Department-level oversight and analytics", description: "Designed for wider oversight of teaching activity and performance across cohorts." },
      { title: "Expanded administration", description: "Coordinate a larger multi-cohort setup with broader administrative needs." },
      { title: "Priority support", description: "Includes priority support positioning for larger deployments." },
      { title: "Everything in ORBIT", description: "Includes ORBIT's advanced grading, rubrics, attendance and quiz controls, along with CORE and SPARK features." },
    ],
  },
];

const apexDetails: FeatureDetail[] = [
  { title: "Institution-wide deployment", description: "Plan an ONYX rollout for an entire institution or multiple departments, with a maximum of 100 students per class." },
  { title: "Custom branding and domain", description: "Discuss a branded experience and custom domain for your institution." },
  { title: "Institutional onboarding and oversight", description: "Coordinate setup and onboarding around the institution's workflows." },
  { title: "Tailored integrations and support", description: "Scope integrations and support to suit institutional requirements." },
  { title: "Custom proposal", description: "Pricing and scope are agreed based on institution size and requirements." },
];

export function BusinessModelPlans() {
  const { role } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<Plan | "apex" | null>(null);
  const activePlan = selectedPlan === "apex" ? null : selectedPlan;
  const activeName = selectedPlan === "apex" ? "APEX" : activePlan?.name;
  const activeDescription =
    selectedPlan === "apex"
      ? "Institutional White-Label & Custom Engine"
      : activePlan?.description;
  const activeDetails = selectedPlan === "apex" ? apexDetails : activePlan?.details ?? [];

  return (
    <div className="space-y-4">
      <Card className="lift">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            ONYX Plans & Pricing
          </CardTitle>
          <CardDescription>
            Simple plans for individual educators, growing teaching teams and institutions.
            Assignments and manual quizzes remain unlimited on every plan.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const highlighted = Boolean(plan.featured);
          return (
            <Card key={plan.code} className={highlighted ? "border-primary/50 shadow-md" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {highlighted && <Crown className="size-4 text-primary" />}
                </div>
                <CardDescription>{plan.description}</CardDescription>
                <div className="pt-1">
                  {plan.price === 0 ? (
                    <span className="text-2xl font-bold">Free</span>
                  ) : (
                    <span className="text-2xl font-bold">₹{plan.price?.toLocaleString("en-IN")}</span>
                  )}
                  <span className="text-sm text-muted-foreground"> / month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm">
                  {[plan.classes, plan.students, plan.storage, plan.ai, ...plan.features].map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button type="button" variant="outline" className="w-full" onClick={() => setSelectedPlan(plan)}>
                  View features
                </Button>
                {role === "admin" ? (
                  <Button variant="outline" className="w-full" disabled>
                    Admin — unlimited access
                  </Button>
                ) : (
                  <Button asChild variant={highlighted ? "default" : "outline"} className="w-full">
                    <Link to="/settings">Choose {plan.name}</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg">APEX</CardTitle>
            <CardDescription>Institutional White-Label & Custom Engine</CardDescription>
            <div className="pt-1">
              <span className="text-2xl font-bold">Custom</span>
              <span className="text-sm text-muted-foreground"> pricing</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-2">
              {["Institution-wide deployment", "Maximum 100 students per class", "Custom branding and domain", "Institutional onboarding and oversight", "Tailored integrations and support"].map((feature) => (
                <li key={feature} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" className="w-full" onClick={() => setSelectedPlan("apex")}>
              View features
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/settings">Contact us</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={selectedPlan !== null} onOpenChange={(open) => { if (!open) setSelectedPlan(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{activeName} — Features in detail</DialogTitle>
            <DialogDescription>{activeDescription}</DialogDescription>
          </DialogHeader>
          {activePlan && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm sm:grid-cols-4">
              <div><p className="text-muted-foreground">Price</p><p className="font-semibold">{activePlan.price === 0 ? "Free" : `₹${activePlan.price?.toLocaleString("en-IN")}/month`}</p></div>
              <div><p className="text-muted-foreground">Classes</p><p className="font-semibold">{activePlan.classes}</p></div>
              <div><p className="text-muted-foreground">Students</p><p className="font-semibold">{activePlan.students}</p></div>
              <div><p className="text-muted-foreground">Storage</p><p className="font-semibold">{activePlan.storage}</p></div>
            </div>
          )}
          <div className="space-y-4 py-1">
            {activePlan && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="font-medium">AI quiz generation</p>
                <p className="text-muted-foreground">{activePlan.ai}. Manual quizzes and assignments remain unlimited.</p>
              </div>
            )}
            {activeDetails.map((feature) => (
              <div key={feature.title} className="flex gap-3">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">{feature.title}</p>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setSelectedPlan(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        Pricing and plan descriptions on this screen are a UI presentation only. Existing
        subscription records, billing configuration, storage limits and feature enforcement
        have not been changed.
      </p>
    </div>
  );
}
