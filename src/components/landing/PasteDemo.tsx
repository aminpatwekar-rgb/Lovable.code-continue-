import { useRef, useState, type ClipboardEvent, type DragEvent, type MouseEvent } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Attempt = { id: number; label: string };

const MAX_SHOWN = 4;

/**
 * Landing-page demo of the locked typed editor. It behaves like the real thing (paste, copy, cut,
 * drop and right-click are blocked, every attempt is logged) but is purely local: nothing is sent.
 */
export function PasteDemo() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [total, setTotal] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const flag = (label: string) => {
    setTotal((n) => n + 1);
    // Shake via the Web Animations API so the textarea keeps its text and focus (no remount).
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cardRef.current?.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-6px)" },
          { transform: "translateX(5px)" },
          { transform: "translateX(-3px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 360, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" },
      );
    }
    setAttempts((list) => [{ id: nextId.current++, label }, ...list].slice(0, MAX_SHOWN));
  };

  const block =
    (label: string) =>
    (e: ClipboardEvent<HTMLTextAreaElement> | DragEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      flag(label);
    };
  const onContext = (e: MouseEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    flag("Right-click blocked");
  };

  const flagged = total > 0;

  return (
    <div className="panel mx-auto max-w-3xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 text-sm">
        <span className="inline-flex items-center gap-2 font-medium">
          {flagged ? (
            <ShieldAlert className="size-4 text-warning" />
          ) : (
            <ShieldCheck className="size-4 text-success" />
          )}
          Locked typed editor
        </span>
        <span className="text-xs text-muted-foreground">Live demo — nothing is sent</span>
      </div>

      <div ref={cardRef} className="p-5">
        <label htmlFor="paste-demo" className="sr-only">
          Try pasting into this editor
        </label>
        <textarea
          id="paste-demo"
          rows={4}
          spellCheck={false}
          placeholder="Type your answer here… then try to paste something in."
          onPaste={block("Paste blocked")}
          onCopy={block("Copy blocked")}
          onCut={block("Cut blocked")}
          onDrop={block("Text drop blocked")}
          onContextMenu={onContext}
          className={cn(
            "w-full resize-none rounded-xl border bg-background/60 p-4 text-sm leading-relaxed outline-none transition-colors",
            "placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
            flagged ? "border-warning/60" : "border-input",
          )}
        />

        <div className="mt-4 min-h-[5.5rem]" aria-live="polite">
          {flagged ? (
            <>
              <p className="lp-pop text-sm font-semibold">
                Flagged to your teacher
                <span className="ml-2 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-foreground">
                  {total} {total === 1 ? "attempt" : "attempts"}
                </span>
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {attempts.map((a) => (
                  <li key={a.id} className="lp-pop flex items-center gap-2">
                    <ShieldAlert className="size-3.5 shrink-0 text-warning" /> {a.label}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Typing works as normal. Copy, paste, text drag and right-click are blocked, and every
              attempt raises a warning that is flagged to the teacher.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
