import type { CSSProperties } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  PenLine,
  ShieldCheck,
  Camera,
  BarChart3,
  ArrowRight,
  Moon,
  Sun,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { OnyxIntro, ONYX_INTRO_HEAD_SCRIPT } from "@/components/landing/OnyxIntro";
import { AuroraBackdrop, HeroPreview, Reveal, SpotlightCard } from "@/components/landing/LandingFx";

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
    // Marks the intro as "seen" before first paint on repeat visits (see OnyxIntro).
    scripts: [{ children: ONYX_INTRO_HEAD_SCRIPT }],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Camera,
    hue: "oklch(0.62 0.19 250)",
    title: "Handwritten first",
    body: "Capture pages with the camera, drag in scans, or upload multi-page PDFs. Pages stay ordered and private.",
  },
  {
    icon: ShieldCheck,
    hue: "oklch(0.62 0.21 300)",
    title: "Locked typed editor",
    body: "Copy, paste, right-click and text drag are blocked. Every attempt raises a warning and is flagged to the teacher.",
  },
  {
    icon: PenLine,
    hue: "oklch(0.66 0.17 215)",
    title: "Review with intent",
    body: "Zoom and rotate pages, leave comments, award marks, then return or approve in one pass.",
  },
  {
    icon: BarChart3,
    hue: "oklch(0.64 0.21 345)",
    title: "Progress that reads clearly",
    body: "Upcoming, overdue, submitted and completion percentage — colour-coded across every dashboard.",
  },
];

const PILLS = ["Scans & PDFs", "Paste-locked typing", "Marks & feedback"];

function Landing() {
  const { theme, toggle } = useTheme();

  return (
    <div className="landing relative isolate min-h-screen overflow-x-clip">
      <OnyxIntro />
      <AuroraBackdrop />

      <header className="glass lp-drop sticky top-0 z-40 mx-auto flex max-w-6xl items-center justify-between rounded-b-2xl px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="brand-gradient lp-logo flex size-8 items-center justify-center rounded-lg text-sm font-bold text-primary-foreground">
            O
          </span>
          <span className="font-semibold tracking-tight">ONYX</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button asChild size="sm">
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5">
        <section className="grid items-center gap-14 py-20 sm:py-28 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="max-w-3xl">
            <div className="lp-rise" style={{ "--rd": 0 } as CSSProperties}>
              <span className="lp-chip inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-success" /> Built for schools and colleges
              </span>
            </div>

            <h1
              className="lp-rise mt-6 text-5xl leading-[1.05] sm:text-6xl"
              style={{ "--rd": 1 } as CSSProperties}
            >
              <span className="relative inline-block">
                <span className="text-display lp-aurora-text">Handwriting</span>
                <svg className="lp-scribble" viewBox="0 0 200 14" aria-hidden="true">
                  <defs>
                    <linearGradient id="lp-scribble-grad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" style={{ stopColor: "var(--lp-g1)" }} />
                      <stop offset="0.5" style={{ stopColor: "var(--lp-g2)" }} />
                      <stop offset="1" style={{ stopColor: "var(--lp-g4)" }} />
                    </linearGradient>
                  </defs>
                  <path d="M3 9 C 28 3, 52 13, 82 7 S 140 2, 197 8" pathLength={1} />
                </svg>
              </span>{" "}
              deserves a
              <br />
              <span className="text-display lp-aurora-text">modern</span> submission flow.
            </h1>

            <p
              className="lp-rise mt-6 max-w-xl text-lg text-muted-foreground"
              style={{ "--rd": 2 } as CSSProperties}
            >
              ONYX gives teachers classes, assignments and review tools — and gives students a calm
              place to submit scanned pages or typed work that can't be pasted in.
            </p>

            <div
              className="lp-rise mt-8 flex flex-wrap items-center gap-3"
              style={{ "--rd": 3 } as CSSProperties}
            >
              <span className="lp-beam">
                <Button asChild size="lg" className="rounded-[calc(var(--radius)-2px)]">
                  <Link to="/auth">
                    Create your account <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
              </span>
              <Button asChild size="lg" variant="outline" className="bg-card/60 backdrop-blur">
                <Link to="/auth" search={{ mode: "signin" }}>
                  I already have one
                </Link>
              </Button>
            </div>

            <ul
              className="lp-rise mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"
              style={{ "--rd": 4 } as CSSProperties}
            >
              {PILLS.map((p) => (
                <li key={p} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-success" /> {p}
                </li>
              ))}
            </ul>
          </div>

          <HeroPreview />
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i % 2}>
              <SpotlightCard hue={f.hue} className="h-full p-6">
                <span className="lp-icon">
                  <f.icon className="size-5" />
                </span>
                <h2 className="mt-4 text-lg font-semibold">{f.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </section>

        <Reveal className="pb-24">
          <section className="lp-band px-6 py-12 text-center sm:px-12 sm:py-16">
            <h2 className="mx-auto max-w-2xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
              A calmer way to collect handwritten work.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-white/80">
              Set up a class, post an assignment, and let students submit — scanned or typed.
            </p>
            <Button asChild size="lg" className="mt-7 bg-white text-neutral-900 hover:bg-white/90">
              <Link to="/auth">
                Get started <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </section>
        </Reveal>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        ONYX — Online Network for Yielding Xcellence. Assignment submission &amp; tracking.
      </footer>
    </div>
  );
}
