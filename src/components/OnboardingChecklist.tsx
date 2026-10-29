import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, X } from "lucide-react";

type Step = { label: string; hint: string; done: boolean; to: string };

const KEY = "onyx:onboarding-dismissed";

/** Short "get started" list for teachers. Hides itself once everything is done or dismissed. */
export function OnboardingChecklist({
  userId,
  classes,
  students,
  assignments,
}: {
  userId?: string | undefined;
  classes: number;
  students: number;
  assignments: number;
}) {
  const storageKey = `${KEY}:${userId ?? "anon"}`;
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid a flash

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(storageKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  const steps: Step[] = [
    { label: "Create your first class", hint: "Add a name and subject.", done: classes > 0, to: "/classes" },
    {
      label: "Invite your students",
      hint: "Share the class join link or code.",
      done: students > 0,
      to: "/classes",
    },
    {
      label: "Post an assignment",
      hint: "Set a due date and instructions.",
      done: assignments > 0,
      to: "/assignments",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (dismissed || doneCount === steps.length) return null;

  return (
    <section className="panel space-y-3 p-4" aria-label="Getting started">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Get started with ONYX</h2>
          <p className="text-xs text-muted-foreground">
            {doneCount} of {steps.length} done
          </p>
        </div>
        <button
          type="button"
          aria-label="Dismiss getting started"
          onClick={() => {
            try {
              window.localStorage.setItem(storageKey, "1");
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <ul className="space-y-1.5">
        {steps.map((s) => (
          <li key={s.label}>
            <Link
              to={s.to}
              className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
            >
              {s.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-primary" />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0">
                <span
                  className={
                    s.done
                      ? "block text-sm text-muted-foreground line-through"
                      : "block text-sm font-medium text-foreground"
                  }
                >
                  {s.label}
                </span>
                {!s.done && <span className="block text-xs text-muted-foreground">{s.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
