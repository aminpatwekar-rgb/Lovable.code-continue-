import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import {
  PenLine,
  ShieldCheck,
  Camera,
  BarChart3,
  ArrowRight,
  Moon,
  Sun,
  CheckCircle2,
  FileText,
  Bell,
  Sparkles,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { SPRING_SMOOTH } from "@/lib/motionPresets";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ONYX — Handwriting-First Assignment Submission & Tracking" },
      {
        name: "description",
        content:
          "A handwriting-first assignment platform for schools and colleges. Create classes, set assignments, submit scanned or locked typed work, and review with marks and feedback.",
      },
      { property: "og:title", content: "ONYX — Handwriting-First Assignment Platform" },
      {
        property: "og:description",
        content:
          "Classes, assignments, handwritten uploads, a paste-locked typed editor, and teacher review with marks and annotations.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Camera,
    title: "Handwritten first",
    body: "Capture pages with the camera, drag in scans, or upload multi-page PDFs. Pages stay ordered and private.",
  },
  {
    icon: ShieldCheck,
    title: "Locked typed editor",
    body: "Copy, paste, right-click and text drag are blocked. Every attempt raises a warning and is flagged to the teacher.",
  },
  {
    icon: PenLine,
    title: "Review with intent",
    body: "Zoom and rotate pages, leave comments, award marks, then return or approve in one pass.",
  },
  {
    icon: BarChart3,
    title: "Progress that reads clearly",
    body: "Upcoming, overdue, submitted and completion percentage — colour-coded across every dashboard.",
  },
];


const WORKFLOW = [
  { label: "Create", icon: FileText },
  { label: "Assign", icon: Sparkles },
  { label: "Submit", icon: PenLine },
  { label: "Review", icon: Check },
  { label: "Track", icon: BarChart3 },
];

function LandingProductPreview({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 26, scale: 0.97, rotate: 1.2 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1, rotate: 0 }}
      transition={{ ...SPRING_SMOOTH, duration: 0.85 }}
      className="relative mx-auto w-full max-w-[540px]"
    >
      <motion.div
        aria-hidden="true"
        className="absolute -inset-8 rounded-[2rem] bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklab,var(--color-primary)_20%,transparent),transparent_42%),radial-gradient(circle_at_75%_70%,color-mix(in_oklab,var(--color-primary)_14%,transparent),transparent_38%)] blur-2xl"
        animate={reduceMotion ? undefined : { opacity: [0.45, 0.75, 0.45], scale: [0.98, 1.04, 0.98] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="relative overflow-visible rounded-[1.5rem] border border-border/80 bg-card/85 p-3 shadow-[0_30px_80px_-28px_color-mix(in_oklab,var(--color-primary)_28%,transparent)] backdrop-blur-xl"
        animate={reduceMotion ? undefined : { y: [0, -7, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="rounded-[1.15rem] border border-border bg-background/80 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="brand-gradient flex size-8 items-center justify-center rounded-lg text-xs font-bold text-primary-foreground">
                O
              </span>
              <div>
                <p className="text-xs font-semibold tracking-tight">ONYX Workspace</p>
                <p className="text-[11px] text-muted-foreground">Industrial &amp; Mobile Robotics</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-[10px] font-medium text-success">
              <span className="size-1.5 rounded-full bg-current" /> Live
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1.55fr_0.9fr]">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold">Kinematics Assignment</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Due tomorrow · 11:59 PM</p>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">Submitted</span>
              </div>

              <div className="relative mt-4 overflow-hidden rounded-lg border border-border bg-background p-3">
                <div className="absolute right-3 top-3 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[9px] font-medium text-primary">
                  Handwritten
                </div>
                <div className="h-2 w-24 rounded-full bg-muted" />
                <div className="mt-3 h-2 w-40 rounded-full bg-muted/80" />
                <div className="mt-5 space-y-2">
                  {[0, 1, 2].map((line) => (
                    <motion.div
                      key={line}
                      className="h-px bg-border"
                      initial={reduceMotion ? false : { scaleX: 0, transformOrigin: "left" }}
                      animate={reduceMotion ? undefined : { scaleX: [0.3, 1, 0.3] }}
                      transition={{ duration: 3.2, delay: line * 0.2, repeat: Infinity, ease: "easeInOut" }}
                    />
                  ))}
                </div>
                <svg aria-hidden="true" viewBox="0 0 260 70" className="mt-4 h-16 w-full opacity-80">
                  <motion.path
                    d="M10 42 C35 18, 48 58, 72 34 S111 18, 130 40 S165 58, 184 30 S220 20, 250 39"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    className="text-primary/55"
                    initial={reduceMotion ? false : { pathLength: 0, opacity: 0.3 }}
                    animate={reduceMotion ? undefined : { pathLength: [0, 1, 1], opacity: [0.2, 0.75, 0.2] }}
                    transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
                  />
                </svg>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-rows-2">
              <motion.div
                className="rounded-xl border border-border bg-card p-4"
                initial={reduceMotion ? false : { opacity: 0, x: 12 }}
                animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                transition={{ delay: 0.35, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-muted-foreground">Teacher review</p>
                  <PenLine className="size-3.5 text-primary" />
                </div>
                <p className="mt-3 text-2xl font-semibold tracking-tight">18<span className="text-sm text-muted-foreground">/20</span></p>
                <div className="mt-3 h-2 rounded-full bg-muted">
                  <motion.div
                    className="h-2 rounded-full bg-primary"
                    initial={reduceMotion ? { width: "90%" } : { width: "0%" }}
                    animate={reduceMotion ? undefined : { width: "90%" }}
                    transition={{ delay: 0.8, duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </motion.div>

              <motion.div
                className="rounded-xl border border-border bg-card p-4"
                animate={reduceMotion ? undefined : { boxShadow: ["0 0 0 0 color-mix(in oklab,var(--color-primary)_0%,transparent)", "0 0 0 5px color-mix(in oklab,var(--color-primary)_8%,transparent)", "0 0 0 0 color-mix(in oklab,var(--color-primary)_0%,transparent)"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium text-muted-foreground">Latest activity</p>
                  <Bell className="size-3.5 text-warning" />
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-warning/10 p-2.5">
                  <span className="flex size-6 items-center justify-center rounded-md bg-warning/15 text-warning">
                    <Bell className="size-3" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-medium">Assignment reviewed</p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">A moment ago</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-success/10 text-success">
                <CheckCircle2 className="size-3.5" />
              </span>
              <span className="text-[10px] font-medium">Submission saved</span>
            </div>
            <span className="text-[9px] text-muted-foreground">Just now</span>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="absolute -left-4 bottom-8 hidden rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur sm:flex sm:items-center sm:gap-2"
        animate={reduceMotion ? undefined : { y: [0, -6, 0], x: [0, 2, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PenLine className="size-3.5" />
        </span>
        <div>
          <p className="text-[10px] font-semibold">Handwritten workflow</p>
          <p className="text-[9px] text-muted-foreground">Built into every submission</p>
        </div>
      </motion.div>

      <motion.div
        className="absolute -right-3 top-10 hidden rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur sm:flex sm:items-center sm:gap-2"
        animate={reduceMotion ? undefined : { y: [0, 6, 0], x: [0, -2, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-success/10 text-success">
          <Check className="size-3.5" />
        </span>
        <div>
          <p className="text-[10px] font-semibold">18/20 awarded</p>
          <p className="text-[9px] text-muted-foreground">Review completed</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Landing() {
  const { theme, toggle } = useTheme();
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="glass sticky top-0 z-40 mx-auto flex max-w-6xl items-center justify-between rounded-b-2xl px-5 py-3">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: -10 }}
          animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-2"
        >
          <motion.span
            className="brand-gradient flex size-8 items-center justify-center rounded-lg text-sm font-bold text-primary-foreground"
            whileHover={reduceMotion ? undefined : { rotate: 8, scale: 1.06 }}
            transition={SPRING_SMOOTH}
          >
            O
          </motion.span>
          <span className="font-semibold tracking-tight">ONYX</span>
        </motion.div>
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: 10 }}
          animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-2"
        >
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button asChild size="sm">
            <Link to="/auth">Get started</Link>
          </Button>
        </motion.div>
      </header>

      <main className="relative mx-auto max-w-6xl px-5">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] overflow-hidden">
          <motion.div
            className="absolute left-[5%] top-16 size-64 rounded-full bg-primary/10 blur-3xl"
            animate={reduceMotion ? undefined : { x: [0, 35, 0], y: [0, -20, 0], opacity: [0.35, 0.6, 0.35] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute right-[4%] top-28 size-72 rounded-full bg-primary/8 blur-3xl"
            animate={reduceMotion ? undefined : { x: [0, -30, 0], y: [0, 28, 0], opacity: [0.3, 0.52, 0.3] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          />
          <motion.div
            className="absolute left-1/2 top-10 h-px w-[78%] -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/20 to-transparent"
            animate={reduceMotion ? undefined : { scaleX: [0.85, 1, 0.85], opacity: [0.45, 0.9, 0.45] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <section className="grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14 lg:py-28">
          <div className="max-w-3xl">
            <motion.span
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur"
            >
              <CheckCircle2 className="size-3.5 text-success" /> Built for schools and colleges
            </motion.span>

            <motion.h1
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 text-5xl leading-[1.02] sm:text-6xl"
            >
              <motion.span
                className="text-display inline-block"
                animate={reduceMotion ? undefined : { y: [0, -2, 0] }}
                transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
              >
                Handwriting
              </motion.span>{" "}
              deserves a
              <br />
              <motion.span
                className="text-display inline-block"
                animate={reduceMotion ? undefined : { y: [0, 2, 0] }}
                transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              >
                modern
              </motion.span>{" "}
              submission flow.
            </motion.h1>

            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 max-w-xl text-lg text-muted-foreground"
            >
              ONYX gives teachers classes, assignments and review tools — and gives students a calm
              place to submit scanned pages or typed work that can't be pasted in.
            </motion.p>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="mt-8 flex flex-wrap gap-3"
            >
              <Button asChild size="lg">
                <Link to="/auth">
                  Create your account <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth" search={{ mode: "signin" }}>
                  I already have one
                </Link>
              </Button>
            </motion.div>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={reduceMotion ? undefined : { opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Sparkles className="size-3.5 text-primary" />
              Built around the real classroom workflow.
            </motion.div>
          </div>

          <div className="relative lg:pt-2">
            <LandingProductPreview reduceMotion={reduceMotion} />
          </div>
        </section>

        <section className="pb-20 sm:pb-24">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 22 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.18 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="mb-7 max-w-2xl"
          >
            <p className="text-sm font-medium text-primary">Everything in one flow</p>
            <h2 className="mt-2 text-3xl sm:text-4xl">Made for how teachers and students actually work.</h2>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f, index) => (
              <motion.article
                key={f.title}
                initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.55, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="panel lift group relative overflow-hidden p-6 hover:lift-hover"
              >
                <motion.div
                  aria-hidden="true"
                  className="absolute -right-12 -top-12 size-28 rounded-full bg-primary/10 blur-2xl"
                  animate={reduceMotion ? undefined : { scale: [0.85, 1.15, 0.85], opacity: [0.25, 0.45, 0.25] }}
                  transition={{ duration: 5 + index, repeat: Infinity, ease: "easeInOut", delay: index * 0.25 }}
                />
                <motion.div
                  whileHover={reduceMotion ? undefined : { rotate: 7, scale: 1.08 }}
                  transition={SPRING_SMOOTH}
                  className="relative flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
                >
                  <f.icon className="size-5" />
                </motion.div>
                <h3 className="relative mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="pb-24 sm:pb-28">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 22 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="panel relative overflow-hidden p-6 sm:p-8"
          >
            <motion.div
              aria-hidden="true"
              className="absolute inset-x-10 top-1/2 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent"
              animate={reduceMotion ? undefined : { scaleX: [0.85, 1, 0.85], opacity: [0.35, 0.7, 0.35] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="relative">
              <div className="max-w-xl">
                <p className="text-sm font-medium text-primary">A smoother workflow</p>
                <h2 className="mt-2 text-3xl sm:text-4xl">From assignment to feedback, without the friction.</h2>
              </div>

              <div className="relative mt-8 grid gap-5 sm:grid-cols-5 sm:gap-2">
                {WORKFLOW.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <motion.div
                      key={step.label}
                      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.3 }}
                      transition={{ duration: 0.45, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                      className="relative flex items-center gap-3 sm:flex-col sm:items-center sm:justify-center sm:gap-2"
                    >
                      <motion.div
                        className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-sm"
                        whileHover={reduceMotion ? undefined : { y: -3, scale: 1.04 }}
                        transition={SPRING_SMOOTH}
                      >
                        <Icon className="size-4" />
                      </motion.div>
                      <span className="text-sm font-medium">{step.label}</span>
                      {index < WORKFLOW.length - 1 && (
                        <motion.span
                          aria-hidden="true"
                          className="hidden h-px w-full max-w-16 bg-border sm:block"
                          initial={reduceMotion ? false : { scaleX: 0, transformOrigin: "left" }}
                          whileInView={reduceMotion ? undefined : { scaleX: 1 }}
                          viewport={{ once: true, amount: 0.5 }}
                          transition={{ duration: 0.45, delay: index * 0.1 + 0.15 }}
                        />
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        ONYX — Online Network for Yielding Xcellence. Assignment submission &amp; tracking.
      </footer>
    </div>
  );
}
