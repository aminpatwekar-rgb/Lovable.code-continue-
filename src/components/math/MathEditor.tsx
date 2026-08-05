import { useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MathPreview } from "@/components/math/MathPreview";
import { SYMBOL_GROUPS, emptyMatrix, fractionLatex, matrixLatex } from "@/lib/math/symbols";
import { FORMULA_LIBRARY } from "@/lib/science/formulas";

/**
 * Equation builder: raw LaTeX field with live KaTeX preview, a symbol toolbar,
 * fraction and matrix editors, and the science formula library.
 */
export function MathEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [num, setNum] = useState("");
  const [den, setDen] = useState("");
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [cells, setCells] = useState<string[][]>(() => emptyMatrix(2, 2));
  const [delim, setDelim] = useState<"p" | "b" | "v" | "B">("b");

  function insert(snippet: string) {
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

  function resize(nextRows: number, nextCols: number) {
    const r = Math.min(6, Math.max(1, nextRows));
    const c = Math.min(6, Math.max(1, nextCols));
    setRows(r);
    setCols(c);
    setCells((prev) =>
      Array.from({ length: r }, (_, i) =>
        Array.from({ length: c }, (_, j) => prev[i]?.[j] ?? ""),
      ),
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card/60 p-4">
        <MathPreview latex={value} />
      </div>

      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder="\frac{-b \pm \sqrt{b^2-4ac}}{2a}"
        className="min-h-20 font-mono text-sm"
      />

      <Tabs defaultValue="symbols">
        <TabsList className="flex-wrap">
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
              <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => resize(rows - 1, cols)}>
                <Minus className="size-3.5" />
              </Button>
              <span className="w-5 text-center text-sm">{rows}</span>
              <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => resize(rows + 1, cols)}>
                <Plus className="size-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">Columns</span>
              <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => resize(rows, cols - 1)}>
                <Minus className="size-3.5" />
              </Button>
              <span className="w-5 text-center text-sm">{cols}</span>
              <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => resize(rows, cols + 1)}>
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
