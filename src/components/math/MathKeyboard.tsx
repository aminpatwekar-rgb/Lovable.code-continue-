import { memo, useMemo, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { ArrowLeft, ArrowRight, Delete, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";
import { KEYBOARD_TABS, type Key } from "@/lib/math/keyboard";
import { FORMULA_LIBRARY } from "@/lib/science/formulas";

function render(latex: string) {
  try {
    return katex.renderToString(latex, { throwOnError: false, strict: false, trust: false });
  } catch {
    return latex;
  }
}

const KeyButton = memo(function KeyButton({
  keyDef,
  onPress,
  className,
}: {
  keyDef: Key;
  onPress: (latex: string) => void;
  className?: string;
}) {
  const html = useMemo(() => render(keyDef.show), [keyDef.show]);
  return (
    <button
      type="button"
      title={keyDef.hint}
      aria-label={keyDef.hint ?? keyDef.latex}
      // Keep focus (and the caret) inside the equation box when a key is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPress(keyDef.latex)}
      className={cn(
        "flex h-11 min-w-11 items-center justify-center overflow-hidden rounded-lg border border-border bg-card px-2 text-base transition-colors hover:border-primary/60 hover:bg-primary/10 active:scale-95 sm:h-10",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

type Props = {
  onInsert: (latex: string) => void;
  onBackspace: () => void;
  onMove: (dir: "left" | "right") => void;
  onClear: () => void;
};

/**
 * On-screen math keyboard: tabbed key pages plus caret / delete controls and a
 * ready-made formula library. Keys never take focus, so the equation box stays active.
 */
export function MathKeyboard({ onInsert, onBackspace, onMove, onClear }: Props) {
  const [tab, setTab] = useState<string>("basic");
  const active = KEYBOARD_TABS.find((t) => t.id === tab);

  const tabClass = (on: boolean) =>
    cn(
      "shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors",
      on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-2" role="group" aria-label="Math keyboard">
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {KEYBOARD_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTab(t.id)}
            className={tabClass(tab === t.id)}
          >
            {t.name}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={tab === "formulas"}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setTab("formulas")}
          className={tabClass(tab === "formulas")}
        >
          Formulas
        </button>
      </div>

      <div className="max-h-56 overflow-y-auto pr-0.5">
        {active && (
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
            {active.keys.map((key, i) => (
              <KeyButton key={`${active.id}-${i}`} keyDef={key} onPress={onInsert} />
            ))}
          </div>
        )}
        {tab === "formulas" && (
          <div className="space-y-3">
            {FORMULA_LIBRARY.map((section) => (
              <div key={section.id} className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {section.formulas.map((f) => (
                    <button
                      key={f.name}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onInsert(f.latex)}
                      className="rounded-lg border border-border bg-card p-2 text-left transition-colors hover:border-primary/60"
                    >
                      <span className="block text-xs text-muted-foreground">{f.name}</span>
                      <span
                        className="text-sm"
                        dangerouslySetInnerHTML={{ __html: render(f.latex) }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-1.5">
        {(
          [
            { label: "Move left", icon: ArrowLeft, run: () => onMove("left") },
            { label: "Move right", icon: ArrowRight, run: () => onMove("right") },
            { label: "Delete", icon: Delete, run: onBackspace },
            { label: "Clear equation", icon: Eraser, run: onClear },
          ] as const
        ).map(({ label, icon: Icon, run }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={run}
            className="flex h-11 flex-1 items-center justify-center rounded-lg border border-border bg-card transition-colors hover:border-primary/60 active:scale-95 sm:h-10"
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
