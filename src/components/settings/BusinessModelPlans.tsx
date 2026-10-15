import { Check, Crown, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

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
  },
  {
    code: "orbit",
    name: "ORBIT",
    price: 2499,
    description: "Multi-Cohort Powerhouse & Proctoring",
    classes: "10 classes",
    students: "150 students/class",
    storage: "10 GB storage",
    ai: "200 AI quiz questions/month",
    features: [
      "Everything in CORE",
      "Advanced grading and rubric grading",
      "Attendance and classroom management tools",
      "Quiz controls and proctoring features",
    ],
    featured: true,
  },
  {
    code: "nexus",
    name: "NEXUS",
    price: 9999,
    description: "Departmental Federation & Oversight",
    classes: "30 classes",
    students: "400 students/class",
    storage: "30 GB storage",
    ai: "1,000 AI quiz questions/month",
    features: [
      "Everything in ORBIT",
      "Department-level oversight and analytics",
      "Expanded multi-cohort administration",
      "Priority support for larger deployments",
    ],
  },
];

export function BusinessModelPlans() {
  const { role } = useAuth();

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
            <Card
              key={plan.code}
              className={highlighted ? "border-primary/50 shadow-md" : ""}
            >
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
                    <span className="text-2xl font-bold">
                      ₹{plan.price.toLocaleString("en-IN")}
                    </span>
                  )}
                  <span className="text-sm text-muted-foreground"> / month</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm">
                  {[plan.classes, plan.students, plan.storage, plan.ai, ...plan.features].map(
                    (feature) => (
                      <li key={feature} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ),
                  )}
                </ul>
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
            <CardDescription>
              Institutional White-Label & Custom Engine
            </CardDescription>
            <div className="pt-1">
              <span className="text-2xl font-bold">Custom</span>
              <span className="text-sm text-muted-foreground"> pricing</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-2">
              {[
                "Institution-wide deployment",
                "Custom branding and domain",
                "Institutional onboarding and oversight",
                "Tailored integrations and support",
              ].map((feature) => (
                <li key={feature} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="w-full">
              <Link to="/settings">Contact us</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">
        Pricing and plan descriptions on this screen are a UI presentation only. Existing
        subscription records, billing configuration, storage limits and feature enforcement
        have not been changed.
      </p>
    </div>
  );
}
