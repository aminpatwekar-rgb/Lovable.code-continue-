import { useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathField, type MathFieldHandle } from "@/components/math/MathField";
import { MathKeyboard } from "@/components/math/MathKeyboard";
import { cn } from "@/lib/utils";

type Props = {
  /** Add the finished equation to the answer. */
  onAdd: (latex: string, kind: "inline" | "block") => void;
  onClose: () => void;
  onClipboardBlocked?: ((kind: string, label: string) => void) | undefined;
  className?: string | undefined;
};

/**
 * Math keyboard docked under the answer box. Students build an equation on one line
 * with the on-screen keys, then add it to the answer with one tap (or Enter). The field
 * clears and stays focused so the next equation can be started straight away.
 */
export function DockedMathBar({ onAdd, onClose, onClipboardBlocked, className }: Props) {
  const fieldRef = useRef<MathFieldHandle>(null);
  const [latex, setLatex] = useState("");
  const [block, setBlock] = useState(false);
  const [fieldFailed, setFieldFailed] = useState(false);
  const [fieldReady, setFieldReady] = useState(false);

  const canAdd = latex.trim().length > 0;

  function add() {
    const text = latex.trim();
    if (!text) return;
    onAdd(text, block ? "block" : "inline");
    setLatex("");
    requestAnimationFrame(() => fieldRef.current?.focus());
  }

  function insert(snippet: string) {
    if (fieldReady && fieldRef.current?.insert(snippet)) return;
    // Plain-text fallback when the visual field could not load.
    setLatex((v) => v + snippet.replace(/#\?/g, ""));
  }

  function backspace() {
    if (fieldReady && fieldRef.current?.backspace()) return;
    setLatex((v) => v.slice(0, -1));
  }

  return (
    <div
      className={cn("space-y-2 rounded-xl border border-border bg-card p-2 shadow-lg", className)}
      role="group"
      aria-label="Math keyboard"
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          add();
        }
      }}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {!fieldFailed ? (
            <MathField
              ref={fieldRef}
              value={latex}
              onChange={setLatex}
              placeholder="Build your equation with the keys below"
              onClipboardBlocked={onClipboardBlocked}
              onStatus={(ok) => (ok ? setFieldReady(true) : setFieldFailed(true))}
            />
          ) : (
            <input
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              placeholder="Equation (LaTeX)"
              aria-label="Equation"
              className="h-11 w-full rounded-md border border-input bg-transparent px-3 font-mono text-sm"
            />
          )}
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Close math keyboard"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      <MathKeyboard
        onInsert={insert}
        onBackspace={backspace}
        onMove={(dir) => {
          if (fieldReady) fieldRef.current?.move(dir);
        }}
        onClear={() => setLatex("")}
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5" role="group" aria-label="Equation style">
          <Button
            type="button"
            size="sm"
            variant={block ? "outline" : "default"}
            aria-pressed={!block}
            onClick={() => setBlock(false)}
          >
            In line
          </Button>
          <Button
            type="button"
            size="sm"
            variant={block ? "default" : "outline"}
            aria-pressed={block}
            onClick={() => setBlock(true)}
          >
            On its own line
          </Button>
        </div>
        <Button type="button" size="sm" disabled={!canAdd} onClick={add}>
          <Check className="mr-1.5 size-4" /> Add to answer
        </Button>
      </div>
    </div>
  );
}
