import { useRef, useState } from "react";
import { Keyboard, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MathPreview } from "@/components/math/MathPreview";
import { MathField, type MathFieldHandle } from "@/components/math/MathField";
import { SYMBOL_GROUPS, emptyMatrix, fractionLatex, matrixLatex } from "@/lib/math/symbols";
import { FORMULA_LIBRARY } from "@/lib/science/formulas";

/**
 * Equation builder: raw LaTeX field with live KaTeX preview, a symbol toolbar,
 * fraction and matrix editors, and the science formula library.
 */
export function MathEditor({
  value,
  onChange,
  display = true,
  onDisplayChange,
  onClipboardBlocked,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Preview as a centered block equation (true) or inline with text (false). */
  display?: boolean | undefined;
  /** When provided, shows an Inline / Block switch above the preview. */
  onDisplayChange?: ((display: boolean) => void) | undefined;
  /** Block copy/paste inside the editor (paste-protected assignments). */
  onClipboardBlocked?: ((kind: string, label: string) => void) | undefined;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fieldRef = useRef<MathFieldHandle>(null);
  const [visualReady, setVisualReady] = useState(false);
  const [visualFailed, setVisualFailed] = useState(false);
  const [num, setNum] = useState("");
  const [den, setDen] = useState("");
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [cells, setCells] = useState<string[][]>(() => emptyMatrix(2, 2));
  const [delim, setDelim] = useState<"p" | "b" | "v" | "B">("b");
  const [keyboardVisible, setKeyboardVisible] = useState(true);

  function insert(snippet: string) {
    if (visualReady && fieldRef.current?.insert(snippet)) return;
    const el = ref.current;
    if (!el) {
      onChange(value + snippet);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + snippet.length;
      el.setSelectionRange(caret, caret);
    });
  }

  function backspace() {
    if (visualReady && fieldRef.current?.backspace()) return;
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const from = start === end ? Math.max(0, start - 1) : start;
    const next = value.slice(0, from) + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(from, from);
    });
  }

  const keyboardKeys: Array<{ label: string; latex?: string; kind?: "function" | "operator" | "action" }> = [
    { label: "sin", latex: "\\sin ", kind: "function" },
    { label: "cos", latex: "\\cos ", kind: "function" },
    { label: "tan", latex: "\\tan ", kind: "function" },
    { label: "√", latex: "\\sqrt{x}", kind: "function" },
    { label: "x²", latex: "x^{2}", kind: "function" },
    { label: "xʸ", latex: "^", kind: "function" },
    { label: "a/b", latex: "\\frac{a}{b}", kind: "function" },
    { label: "π", latex: "\\pi ", kind: "function" },
    { label: "e", latex: "e", kind: "function" },
    { label: "(", latex: "\\left(", kind: "operator" },
    { label: ")", latex: "\\right)", kind: "operator" },
    { label: "7", latex: "7" },
    { label: "8", latex: "8" },
    { label: "9", latex: "9" },
    { label: "÷", latex: "\\div ", kind: "operator" },
    { label: "4", latex: "4" },
    { label: "5", latex: "5" },
    { label: "6", latex: "6" },
    { label: "×", latex: "\\times ", kind: "operator" },
    { label: "−", latex: "-", kind: "operator" },
    { label: "1", latex: "1" },
    { label: "2", latex: "2" },
    { label: "3", latex: "3" },
    { label: "+", latex: "+", kind: "operator" },
    { label: "=", latex: "=", kind: "operator" },
    { label: "0", latex: "0" },
    { label: ".", latex: "." },
    { label: "x", latex: "x" },
    { label: "y", latex: "y" },
    { label: "z", latex: "z" },
    { label: "ln", latex: "\\ln ", kind: "function" },
    { label: "log", latex: "\\log ", kind: "function" },
    { label: "α", latex: "\\alpha ", kind: "function" },
    { label: "β", latex: "\\beta ", kind: "function" },
    { label: "θ", latex: "\\theta ", kind: "function" },
    { label: "∫", latex: "\\int ", kind: "function" },
    { label: "Σ", latex: "\\sum ", kind: "function" },
    { label: "lim", latex: "\\lim ", kind: "function" },
    { label: "∞", latex: "\\infty ", kind: "function" },
    { label: "≤", latex: "\\le ", kind: "operator" },
    { label: "≥", latex: "\\ge ", kind: "operator" },
    { label: "≠", latex: "\\neq ", kind: "operator" },
    { label: "±", latex: "\\pm ", kind: "operator" },
    { label: "⌫", kind: "action" },
  ];

  function resize(nextRows: number, nextCols: number) {
    const r = Math.min(6, Math.max(1, nextRows));
    const c = Math.min(6, Math.max(1, nextCols));
    setRows(r);
    setCols(c);
    setCells((prev) =>
      Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => prev[i]?.[j] ?? "")),
    );
  }

  return (
    <div className="space-y-4">
      {onDisplayChange && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Insert as</span>
          <div className="flex gap-1.5" role="group" aria-label="Equation style">
            <Button
              type="button"
              size="sm"
              variant={display ? "outline" : "default"}
              aria-pressed={!display}
              onClick={() => onDisplayChange(false)}
            >
              Inline
            </Button>
            <Button
              type="button"
              size="sm"
              variant={display ? "default" : "outline"}
              aria-pressed={display}
              onClick={() => onDisplayChange(true)}
            >
              Block
            </Button>
          </div>
        </div>
      )}
      {!visualFailed && (
        <div className="space-y-1.5">
          <MathField
            ref={fieldRef}
            value={value}
            onChange={onChange}
            autoFocus
            placeholder="Type your equation, e.g. x^2 + 3x - 5"
            onClipboardBlocked={onClipboardBlocked}
            onStatus={(ok) => (ok ? setVisualReady(true) : setVisualFailed(true))}
          />
          <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Keyboard className="size-4 text-primary" />
                Math keyboard
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                aria-expanded={keyboardVisible}
                onClick={() => setKeyboardVisible((visible) => !visible)}
              >
                {keyboardVisible ? "Hide" : "Show"}
              </Button>
            </div>
            {keyboardVisible && (
              <div className="grid grid-cols-5 gap-1.5 p-2 sm:grid-cols-6 sm:gap-2">
                {keyboardKeys.map((key, index) => (
                  <Button
                    key={key.label + "-" + index}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={key.kind === "action" ? "Backspace" : "Insert " + key.label}
                    title={key.kind === "action" ? "Delete previous character" : key.latex}
                    className={[
                      "h-10 min-w-0 rounded-lg px-1 font-medium shadow-sm active:scale-[0.98] sm:h-11",
                      key.kind === "function" ? "border-violet-500/20 bg-violet-500/5 text-violet-700 hover:bg-violet-500/10 dark:text-violet-300" : "",
                      key.kind === "operator" ? "border-primary/20 bg-primary/5 text-primary hover:bg-primary/10" : "",
                      key.kind === "action" ? "bg-muted font-semibold" : "",
                    ].join(" ")}
                    onClick={() => key.kind === "action" ? backspace() : key.latex && insert(key.latex)}
                  >
                    {key.label}
                  </Button>
                ))}
              </div>
            )}
            <p className="px-3 pb-3 text-[11px] text-muted-foreground">
              Tap a key to insert it into your equation. This keyboard only enters math symbols; it does not evaluate expressions.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Type it the way you would write it: <code>x^2</code> for powers, <code>/</code> for
            fractions, <code>sqrt</code> for roots. Press the right arrow key to step out of a
            fraction, power or root.
          </p>
        </div>
      )}

      {visualFailed && (
        <div className="rounded-lg border border-border bg-card/60 p-4" aria-live="polite">
          {value.trim() ? (
            <MathPreview latex={value} display={display} />
          ) : (
            <p className="text-sm text-muted-foreground">Your equation will appear here.</p>
          )}
        </div>
      )}

      <details open={visualFailed} className="group rounded-md border border-border/70 px-3 py-2">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Edit as LaTeX code (advanced)
        </summary>
        <Textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            if (!onClipboardBlocked) return;
            e.preventDefault();
            onClipboardBlocked("paste", "Pasting");
          }}
          onDrop={(e) => {
            if (!onClipboardBlocked) return;
            e.preventDefault();
            onClipboardBlocked("drop", "Dropping text");
          }}
          spellCheck={false}
          placeholder="\frac{-b \pm \sqrt{b^2-4ac}}{2a}"
          className="mt-2 min-h-20 font-mono text-sm"
        />
        {visualFailed && display && value.trim() && (
          <p className="mt-2 text-xs text-muted-foreground">Preview shown above.</p>
        )}
      </details>

      <Tabs defaultValue="symbols">
        <TabsList>
          <TabsTrigger value="symbols">Symbols</TabsTrigger>
          <TabsTrigger value="fraction">Fraction</TabsTrigger>
          <TabsTrigger value="matrix">Matrix</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
        </TabsList>

        <TabsContent value="symbols" className="mt-4 space-y-4">
          {SYMBOL_GROUPS.map((g) => (
            <div key={g.id} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {g.name}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {g.symbols.map((s) => (
                  <Button
                    key={g.id + s.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    title={s.hint ?? s.latex}
                    className="h-8 min-w-9 px-2 font-serif"
                    onClick={() => insert(s.latex)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="fraction" className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="frac-n">Numerator</Label>
              <Input id="frac-n" value={num} onChange={(e) => setNum(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="frac-d">Denominator</Label>
              <Input id="frac-d" value={den} onChange={(e) => setDen(e.target.value)} />
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <MathPreview latex={fractionLatex(num, den)} />
          </div>
          <Button type="button" onClick={() => insert(fractionLatex(num, den))}>
            Insert fraction
          </Button>
        </TabsContent>

        <TabsContent value="matrix" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">Rows</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => resize(rows - 1, cols)}
              >
                <Minus className="size-3.5" />
              </Button>
              <span className="w-5 text-center text-sm">{rows}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => resize(rows + 1, cols)}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">Columns</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => resize(rows, cols - 1)}
              >
                <Minus className="size-3.5" />
              </Button>
              <span className="w-5 text-center text-sm">{cols}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => resize(rows, cols + 1)}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            <div className="flex gap-1.5">
              {(["b", "p", "v", "B"] as const).map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={delim === d ? "default" : "outline"}
                  onClick={() => setDelim(d)}
                >
                  {d === "b" ? "[ ]" : d === "p" ? "( )" : d === "v" ? "| |" : "‖ ‖"}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            {cells.map((row, i) => (
              <div key={i} className="flex gap-1.5">
                {row.map((cell, j) => (
                  <Input
                    key={j}
                    aria-label={`Row ${i + 1} column ${j + 1}`}
                    value={cell}
                    className="h-9 w-16 text-center font-mono text-sm"
                    onChange={(e) =>
                      setCells((prev) =>
                        prev.map((r, ri) =>
                          ri === i ? r.map((c, ci) => (ci === j ? e.target.value : c)) : r,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border p-3">
            <MathPreview latex={matrixLatex(cells, delim)} />
          </div>
          <Button type="button" onClick={() => insert(matrixLatex(cells, delim))}>
            Insert matrix
          </Button>
        </TabsContent>

        <TabsContent value="library" className="mt-4 space-y-5">
          {FORMULA_LIBRARY.map((section) => (
            <div key={section.id} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {section.title}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {section.formulas.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    onClick={() => insert(f.latex)}
                    className="lift rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50"
                  >
                    <span className="text-xs text-muted-foreground">{f.name}</span>
                    <MathPreview latex={f.latex} display={false} className="mt-1 text-sm" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
