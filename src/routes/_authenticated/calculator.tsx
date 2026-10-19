import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Calculator, ChartLine, Check, Copy, RotateCcw, Sigma, Trash2 } from "lucide-react";
import { MathField, type MathFieldHandle } from "@/components/math/MathField";
import { MathPreview } from "@/components/math/MathPreview";

export const Route = createFileRoute("/_authenticated/calculator")({
  head: () => ({
    meta: [
      { title: "Math Workspace — ONYX" },
      {
        name: "description",
        content: "Evaluate expressions, differentiate functions, integrate and plot graphs.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MathWorkspace,
});

type Expr =
  | { kind: "number"; value: number }
  | { kind: "x" }
  | { kind: "unary"; op: "+" | "-"; child: Expr }
  | { kind: "binary"; op: "+" | "-" | "*" | "/" | "^"; left: Expr; right: Expr }
  | { kind: "function"; name: string; arg: Expr };

type Token = { type: "number" | "identifier" | "operator" | "eof"; value: string };

const FUNCTIONS = new Set([
  "sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "abs", "ln", "log", "exp",
]);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i++;
      continue;
    }
    const rest = source.slice(i);
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) {
      tokens.push({ type: "number", value: number[0] });
      i += number[0].length;
      continue;
    }
    const identifier = rest.match(/^[a-z_][a-z_0-9]*/i);
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0].toLowerCase() });
      i += identifier[0].length;
      continue;
    }
    if ("()+-*/^".includes(source[i])) {
      tokens.push({ type: "operator", value: source[i] });
      i++;
      continue;
    }
    throw new Error("Unsupported symbol: " + source[i]);
  }
  tokens.push({ type: "eof", value: "" });
  return tokens;
}

/** Converts the common LaTeX emitted by MathLive into a safe, small math grammar. */
function latexToExpression(latex: string): string {
  let s = latex
    .replace(/\\left|\\right/g, "")
    .replace(/\\(?:,|!|;|quad|qquad)/g, " ")
    .replace(/−/g, "-")
    .replace(/π/g, "pi")
    .replace(/×/g, "*")
    .replace(/÷/g, "/");

  for (let i = 0; i < 12; i++) {
    const next = s
      .replace(/\\frac\s*{([^{}]*)}\s*{([^{}]*)}/g, "(($1)/($2))")
      .replace(/\\sqrt\s*{([^{}]*)}/g, "sqrt($1)");
    if (next === s) break;
    s = next;
  }

  return s
    .replace(/\\(asin|acos|atan|sin|cos|tan|ln|log|exp)\b/g, "$1")
    .replace(/\\cdot\b|\\times\b/g, "*")
    .replace(/\\div\b/g, "/")
    .replace(/\\pi\b/g, "pi")
    .replace(/\\infty\b/g, "1e300")
    .replace(/[{}]/g, (brace) => (brace === "{" ? "(" : ")"))
    .replace(/\s+/g, " ")
    .trim();
}

function parseExpression(source: string): Expr {
  const tokens = tokenize(source);
  let position = 0;
  const current = () => tokens[position];
  const take = () => tokens[position++];
  const expect = (value: string) => {
    if (current().value !== value) throw new Error('Expected "' + value + '".');
    take();
  };
  const startsPrimary = (token: Token) =>
    token.type === "number" ||
    token.type === "identifier" ||
    (token.type === "operator" && token.value === "(");

  function primary(): Expr {
    const token = take();
    if (token.type === "number") {
      const value = Number(token.value);
      if (!Number.isFinite(value)) throw new Error("Please enter a valid number.");
      return { kind: "number", value };
    }
    if (token.type === "identifier") {
      if (token.value === "x") return { kind: "x" };
      if (token.value === "pi") return { kind: "number", value: Math.PI };
      if (token.value === "e") return { kind: "number", value: Math.E };
      if (FUNCTIONS.has(token.value)) {
        expect("(");
        const arg = expression();
        expect(")");
        return { kind: "function", name: token.value, arg };
      }
      throw new Error('Unknown name "' + token.value + '". Use x, pi, e, or a supported function.');
    }
    if (token.value === "(") {
      const inside = expression();
      expect(")");
      return inside;
    }
    throw new Error("Enter a mathematical expression first.");
  }

  function power(): Expr {
    const left = primary();
    if (current().value === "^") {
      take();
      return { kind: "binary", op: "^", left, right: unary() };
    }
    return left;
  }

  function unary(): Expr {
    if (current().value === "+" || current().value === "-") {
      const op = take().value as "+" | "-";
      return { kind: "unary", op, child: unary() };
    }
    return power();
  }

  function term(): Expr {
    let node = unary();
    while (true) {
      const op = current().value;
      if (op === "*" || op === "/") {
        take();
        node = { kind: "binary", op, left: node, right: unary() };
      } else if (startsPrimary(current())) {
        // Implicit multiplication: 2x, 3(x+1), and 2sin(x).
        node = { kind: "binary", op: "*", left: node, right: unary() };
      } else {
        break;
      }
    }
    return node;
  }

  function expression(): Expr {
    let node = term();
    while (current().value === "+" || current().value === "-") {
      const op = take().value as "+" | "-";
      node = { kind: "binary", op, left: node, right: term() };
    }
    return node;
  }

  const result = expression();
  if (current().type !== "eof") {
    throw new Error('Unexpected "' + current().value + '". Check the expression format.');
  }
  return result;
}

function evaluate(node: Expr, x: number): number {
  switch (node.kind) {
    case "number":
      return node.value;
    case "x":
      return x;
    case "unary":
      return node.op === "-" ? -evaluate(node.child, x) : evaluate(node.child, x);
    case "binary": {
      const a = evaluate(node.left, x);
      const b = evaluate(node.right, x);
      switch (node.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "^": return Math.pow(a, b);
      }
    }
    case "function": {
      const value = evaluate(node.arg, x);
      switch (node.name) {
        case "sin": return Math.sin(value);
        case "cos": return Math.cos(value);
        case "tan": return Math.tan(value);
        case "asin": return Math.asin(value);
        case "acos": return Math.acos(value);
        case "atan": return Math.atan(value);
        case "sqrt": return Math.sqrt(value);
        case "abs": return Math.abs(value);
        case "ln": return Math.log(value);
        case "log": return Math.log10(value);
        case "exp": return Math.exp(value);
        default: throw new Error("Unsupported function: " + node.name);
      }
    }
  }
}

function isConstant(node: Expr): boolean {
  switch (node.kind) {
    case "number": return true;
    case "x": return false;
    case "unary": return isConstant(node.child);
    case "binary": return isConstant(node.left) && isConstant(node.right);
    case "function": return isConstant(node.arg);
  }
}

function simplify(node: Expr): Expr {
  if (node.kind === "number" || node.kind === "x") return node;
  if (node.kind === "unary") {
    const child = simplify(node.child);
    if (node.op === "+") return child;
    if (child.kind === "number") return { kind: "number", value: -child.value };
    if (child.kind === "unary" && child.op === "-") return child.child;
    return { kind: "unary", op: node.op, child };
  }
  if (node.kind === "function") {
    const arg = simplify(node.arg);
    const candidate: Expr = { ...node, arg };
    if (isConstant(candidate)) {
      const value = evaluate(candidate, 0);
      if (Number.isFinite(value)) return { kind: "number", value };
    }
    return candidate;
  }

  const left = simplify(node.left);
  const right = simplify(node.right);
  const candidate: Expr = { ...node, left, right };
  if (isConstant(candidate)) {
    const value = evaluate(candidate, 0);
    if (Number.isFinite(value)) return { kind: "number", value };
  }
  if (node.op === "+") {
    if (left.kind === "number" && left.value === 0) return right;
    if (right.kind === "number" && right.value === 0) return left;
  }
  if (node.op === "-") {
    if (right.kind === "number" && right.value === 0) return left;
    if (left.kind === "number" && left.value === 0) return simplify({ kind: "unary", op: "-", child: right });
  }
  if (node.op === "*") {
    if ((left.kind === "number" && left.value === 0) || (right.kind === "number" && right.value === 0))
      return { kind: "number", value: 0 };
    if (left.kind === "number" && left.value === 1) return right;
    if (right.kind === "number" && right.value === 1) return left;
    if (left.kind === "number" && left.value === -1) return simplify({ kind: "unary", op: "-", child: right });
    if (right.kind === "number" && right.value === -1) return simplify({ kind: "unary", op: "-", child: left });
  }
  if (node.op === "/") {
    if (right.kind === "number" && right.value === 1) return left;
    if (left.kind === "number" && left.value === 0 && !(right.kind === "number" && right.value === 0))
      return { kind: "number", value: 0 };
  }
  if (node.op === "^") {
    if (right.kind === "number" && right.value === 1) return left;
    if (right.kind === "number" && right.value === 0) return { kind: "number", value: 1 };
  }
  return candidate;
}

function derivative(node: Expr): Expr {
  const zero: Expr = { kind: "number", value: 0 };
  const one: Expr = { kind: "number", value: 1 };
  switch (node.kind) {
    case "number": return zero;
    case "x": return one;
    case "unary": return { kind: "unary", op: node.op, child: derivative(node.child) };
    case "binary": {
      const a = node.left;
      const b = node.right;
      const da = derivative(a);
      const db = derivative(b);
      switch (node.op) {
        case "+": return { kind: "binary", op: "+", left: da, right: db };
        case "-": return { kind: "binary", op: "-", left: da, right: db };
        case "*":
          return {
            kind: "binary", op: "+",
            left: { kind: "binary", op: "*", left: da, right: b },
            right: { kind: "binary", op: "*", left: a, right: db },
          };
        case "/":
          return {
            kind: "binary", op: "/",
            left: {
              kind: "binary", op: "-",
              left: { kind: "binary", op: "*", left: da, right: b },
              right: { kind: "binary", op: "*", left: a, right: db },
            },
            right: { kind: "binary", op: "^", left: b, right: { kind: "number", value: 2 } },
          };
        case "^":
          if (b.kind === "number") {
            return {
              kind: "binary", op: "*",
              left: { kind: "binary", op: "*", left: b, right: { kind: "binary", op: "^", left: a, right: { kind: "number", value: b.value - 1 } } },
              right: da,
            };
          }
          return {
            kind: "binary", op: "*",
            left: node,
            right: {
              kind: "binary", op: "+",
              left: { kind: "binary", op: "*", left: db, right: { kind: "function", name: "ln", arg: a } },
              right: { kind: "binary", op: "/", left: { kind: "binary", op: "*", left: b, right: da }, right: a },
            },
          };
      }
    }
    case "function": {
      const u = node.arg;
      const du = derivative(u);
      const f = (name: string, arg: Expr = u): Expr => ({ kind: "function", name, arg });
      const bin = (op: "+" | "-" | "*" | "/" | "^", left: Expr, right: Expr): Expr =>
        ({ kind: "binary", op, left, right });
      switch (node.name) {
        case "sin": return bin("*", f("cos"), du);
        case "cos": return { kind: "unary", op: "-", child: bin("*", f("sin"), du) };
        case "tan": return bin("*", bin("/", one, bin("^", f("cos"), { kind: "number", value: 2 })), du);
        case "asin": return bin("/", du, f("sqrt", bin("-", one, bin("^", u, { kind: "number", value: 2 }))));
        case "acos": return { kind: "unary", op: "-", child: bin("/", du, f("sqrt", bin("-", one, bin("^", u, { kind: "number", value: 2 })))) };
        case "atan": return bin("/", du, bin("+", one, bin("^", u, { kind: "number", value: 2 })));
        case "sqrt": return bin("/", du, bin("*", { kind: "number", value: 2 }, f("sqrt")));
        case "ln": return bin("/", du, u);
        case "log": return bin("/", du, bin("*", u, { kind: "number", value: Math.LN10 }));
        case "exp": return bin("*", f("exp"), du);
        case "abs": return bin("*", bin("/", u, f("abs")), du);
        default: throw new Error("Unsupported derivative for: " + node.name);
      }
    }
  }
}

function antiderivative(node: Expr): Expr | null {
  const num = (value: number): Expr => ({ kind: "number", value });
  const x: Expr = { kind: "x" };
  const bin = (op: "+" | "-" | "*" | "/" | "^", left: Expr, right: Expr): Expr =>
    ({ kind: "binary", op, left, right });
  const fn = (name: string, arg: Expr = x): Expr => ({ kind: "function", name, arg });

  if (isConstant(node)) {
    const value = evaluate(node, 0);
    return Number.isFinite(value) ? bin("*", num(value), x) : null;
  }
  switch (node.kind) {
    case "number":
      return bin("*", node, x);
    case "x":
      return bin("/", bin("^", x, num(2)), num(2));
    case "unary": {
      const inner = antiderivative(node.child);
      return inner ? { kind: "unary", op: node.op, child: inner } : null;
    }
    case "function": {
      if (node.arg.kind !== "x") return null;
      switch (node.name) {
        case "sin": return { kind: "unary", op: "-", child: fn("cos") };
        case "cos": return fn("sin");
        case "tan": return { kind: "unary", op: "-", child: fn("ln", fn("abs", fn("cos"))) };
        case "exp": return fn("exp");
        case "ln": return bin("-", bin("*", x, fn("ln")), x);
        case "log":
          return bin("-", bin("*", x, fn("log")), bin("/", x, num(Math.LN10)));
        default: return null;
      }
    }
    case "binary": {
      const { left, right, op } = node;
      if (op === "+" || op === "-") {
        const a = antiderivative(left);
        const b = antiderivative(right);
        return a && b ? bin(op, a, b) : null;
      }
      if (op === "*") {
        if (isConstant(left)) {
          const b = antiderivative(right);
          return b ? bin("*", left, b) : null;
        }
        if (isConstant(right)) {
          const a = antiderivative(left);
          return a ? bin("*", a, right) : null;
        }
        return null;
      }
      if (op === "/") {
        if (right.kind === "x" && left.kind === "number" && left.value === 1)
          return fn("ln", fn("abs", x));
        if (isConstant(right)) {
          const a = antiderivative(left);
          return a ? bin("/", a, right) : null;
        }
        return null;
      }
      if (op === "^" && left.kind === "x" && right.kind === "number") {
        if (right.value === -1) return fn("ln", fn("abs", x));
        const exponent = right.value + 1;
        return bin("/", bin("^", x, num(exponent)), num(exponent));
      }
      return null;
    }
  }
}

function toLatex(node: Expr): string {
  switch (node.kind) {
    case "number":
      return Number.isInteger(node.value) ? String(node.value) : Number(node.value.toPrecision(8)).toString();
    case "x": return "x";
    case "unary":
      return node.op === "-" ? "-\\left(" + toLatex(node.child) + "\\right)" : toLatex(node.child);
    case "function": {
      const value = toLatex(node.arg);
      if (node.name === "sqrt") return "\\sqrt{" + value + "}";
      if (node.name === "abs") return "\\left|" + value + "\\right|";
      const names: Record<string, string> = {
        sin: "\\sin", cos: "\\cos", tan: "\\tan", asin: "\\arcsin",
        acos: "\\arccos", atan: "\\arctan", ln: "\\ln", log: "\\log", exp: "\\exp",
      };
      return (names[node.name] ?? node.name) + "\\left(" + value + "\\right)";
    }
    case "binary": {
      const left = toLatex(node.left);
      const right = toLatex(node.right);
      switch (node.op) {
        case "+": return "\\left(" + left + "+" + right + "\\right)";
        case "-": return "\\left(" + left + "-" + right + "\\right)";
        case "*": return "\\left(" + left + "\\cdot " + right + "\\right)";
        case "/": return "\\frac{" + left + "}{" + right + "}";
        case "^": return "{" + left + "}^{" + right + "}";
      }
    }
  }
}

function formatNumber(value: number): string {
  if (Number.isNaN(value)) return "Undefined for these values";
  if (!Number.isFinite(value)) return "Result is not finite";
  return Number(value.toPrecision(10)).toLocaleString("en-US", { maximumFractionDigits: 10 });
}

function simpsonIntegral(fn: (x: number) => number, a: number, b: number): number {
  const steps = 1000;
  const h = (b - a) / steps;
  let sum = fn(a) + fn(b);
  for (let i = 1; i < steps; i++) {
    const y = fn(a + i * h);
    if (!Number.isFinite(y)) throw new Error("The function is undefined inside these bounds.");
    sum += (i % 2 === 0 ? 2 : 4) * y;
  }
  return (sum * h) / 3;
}

function buildPlot(node: Expr): string {
  const width = 600;
  const height = 320;
  const points: string[] = [];
  let drawing = false;
  for (let i = 0; i <= 480; i++) {
    const x = -10 + (20 * i) / 480;
    const y = evaluate(node, x);
    if (!Number.isFinite(y) || y < -10 || y > 10) {
      drawing = false;
      continue;
    }
    const px = ((x + 10) / 20) * width;
    const py = ((10 - y) / 20) * height;
    points.push((drawing ? "L" : "M") + px.toFixed(2) + "," + py.toFixed(2));
    drawing = true;
  }
  return points.join(" ");
}

function MathWorkspace() {
  const fieldRef = useRef<MathFieldHandle>(null);
  const [expression, setExpression] = useState("x^2 + \\sin\\left(x\\right)");
  const [xValue, setXValue] = useState("2");
  const [lowerBound, setLowerBound] = useState("0");
  const [upperBound, setUpperBound] = useState("1");
  const [output, setOutput] = useState<{ title: string; value: string; type: "text" | "latex"; note?: string } | null>(null);
  const [showPlot, setShowPlot] = useState(false);
  const [copied, setCopied] = useState(false);

  const parsedForPlot = useMemo(() => {
    if (!showPlot) return null;
    try {
      return { path: buildPlot(parseExpression(latexToExpression(expression))), error: "" };
    } catch (error) {
      return { path: "", error: error instanceof Error ? error.message : "Unable to graph this expression." };
    }
  }, [expression, showPlot]);

  function insertKey(latex: string) {
    if (!fieldRef.current?.insert(latex)) setExpression((current) => current + latex);
    setOutput(null);
    setShowPlot(false);
  }

  function runAction(action: "evaluate" | "differentiate" | "integrate" | "plot") {
    try {
      const expr = parseExpression(latexToExpression(expression));
      if (action === "plot") {
        setShowPlot(true);
        setOutput(null);
        return;
      }
      setShowPlot(false);
      if (action === "evaluate") {
        const x = Number(xValue);
        if (!Number.isFinite(x)) throw new Error("Enter a valid value for x.");
        const value = evaluate(expr, x);
        setOutput({
          title: "Evaluation",
          type: "text",
          value: "f(" + xValue + ") = " + formatNumber(value),
          note: "Angles are interpreted in radians.",
        });
        return;
      }
      if (action === "differentiate") {
        const result = simplify(derivative(expr));
        setOutput({
          title: "Derivative",
          type: "latex",
          value: "\\frac{d}{dx}f(x) = " + toLatex(result),
          note: "Symbolic differentiation with the supported function rules.",
        });
        return;
      }
      const primitive = antiderivative(expr);
      if (primitive) {
        setOutput({
          title: "Antiderivative",
          type: "latex",
          value: "\\int f(x)\\,dx = " + toLatex(simplify(primitive)) + " + C",
          note: "An antiderivative was found using common symbolic integration rules.",
        });
      } else {
        const a = Number(lowerBound);
        const b = Number(upperBound);
        if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("Enter valid lower and upper bounds.");
        const value = simpsonIntegral((x) => evaluate(expr, x), a, b);
        setOutput({
          title: "Definite integral",
          type: "text",
          value: "∫[" + lowerBound + ", " + upperBound + "] f(x) dx ≈ " + formatNumber(value),
          note: "No simple antiderivative was recognized, so this uses Simpson's numerical method (1,000 intervals).",
        });
      }
    } catch (error) {
      setShowPlot(false);
      setOutput({
        title: "Check your expression",
        type: "text",
        value: error instanceof Error ? error.message : "Unable to calculate this expression.",
      });
    }
  }

  async function copyOutput() {
    if (!output) return;
    const value = output.value;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  const keys: Array<{ label: string; latex: string; tone?: "function" | "operator" }> = [
    { label: "sin", latex: "\\sin\\left(x\\right)", tone: "function" },
    { label: "cos", latex: "\\cos\\left(x\\right)", tone: "function" },
    { label: "tan", latex: "\\tan\\left(x\\right)", tone: "function" },
    { label: "√", latex: "\\sqrt{x}", tone: "function" },
    { label: "x²", latex: "x^{2}", tone: "function" },
    { label: "7", latex: "7" }, { label: "8", latex: "8" }, { label: "9", latex: "9" },
    { label: "÷", latex: "\\div ", tone: "operator" }, { label: "(", latex: "(" },
    { label: "4", latex: "4" }, { label: "5", latex: "5" }, { label: "6", latex: "6" },
    { label: "×", latex: "\\times ", tone: "operator" }, { label: ")", latex: ")" },
    { label: "1", latex: "1" }, { label: "2", latex: "2" }, { label: "3", latex: "3" },
    { label: "−", latex: "-", tone: "operator" }, { label: "^", latex: "^", tone: "operator" },
    { label: "0", latex: "0" }, { label: ".", latex: "." }, { label: "x", latex: "x" },
    { label: "+", latex: "+", tone: "operator" }, { label: "π", latex: "\\pi ", tone: "function" },
    { label: "ln", latex: "\\ln\\left(x\\right)", tone: "function" },
    { label: "log", latex: "\\log\\left(x\\right)", tone: "function" },
    { label: "eˣ", latex: "\\exp\\left(x\\right)", tone: "function" },
    { label: "|x|", latex: "\\left|x\\right|", tone: "function" },
    { label: "1/x", latex: "\\frac{1}{x}", tone: "function" },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Calculator className="size-3.5" />
            ONYX learning tools
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Math Workspace</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Explore expressions, calculus and graphs in one place.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-emerald-500" />
          Calculations run in your browser
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="panel min-w-0 overflow-hidden border border-border/80 bg-card shadow-sm">
          <div className="border-b border-border/70 px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Equation</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Use x for functions and graphs</p>
              </div>
              <button
                type="button"
                onClick={() => { setExpression(""); setOutput(null); setShowPlot(false); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <Trash2 className="size-3.5" />
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <div className="rounded-xl border border-primary/20 bg-background px-3 py-3 shadow-inner sm:px-4 sm:py-4">
              <MathField
                ref={fieldRef}
                value={expression}
                onChange={(value) => { setExpression(value); setOutput(null); setShowPlot(false); }}
                placeholder="Enter an expression, e.g. x^2 + sin(x)"
                className="min-h-12 w-full text-xl"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runAction("evaluate")}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Calculator className="size-4" /> Evaluate
              </button>
              <button
                type="button"
                onClick={() => runAction("differentiate")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Sigma className="size-4" /> Differentiate
              </button>
              <button
                type="button"
                onClick={() => runAction("integrate")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ∫ Integrate
              </button>
              <button
                type="button"
                onClick={() => runAction("plot")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChartLine className="size-4" /> Plot
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                Evaluate at x
                <input
                  type="number"
                  value={xValue}
                  onChange={(event) => setXValue(event.target.value)}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-muted-foreground">Integral bounds</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    aria-label="Integral lower bound"
                    type="number"
                    value={lowerBound}
                    onChange={(event) => setLowerBound(event.target.value)}
                    className="h-10 min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                  <input
                    aria-label="Integral upper bound"
                    type="number"
                    value={upperBound}
                    onChange={(event) => setUpperBound(event.target.value)}
                    className="h-10 min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-border/70 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Scientific keypad</h3>
                <span className="text-[11px] text-muted-foreground">Tap a key to insert</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {keys.map((key, index) => (
                  <button
                    key={key.label + "-" + index}
                    type="button"
                    onClick={() => insertKey(key.latex)}
                    aria-label={"Insert " + key.label}
                    className={[
                      "min-h-10 rounded-lg border px-1.5 text-sm font-medium shadow-sm transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-11 sm:text-base",
                      key.tone === "function"
                        ? "border-violet-500/20 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15 dark:text-violet-300"
                        : key.tone === "operator"
                          ? "border-primary/20 bg-primary/10 text-primary hover:bg-primary/15"
                          : "border-border bg-muted/50 text-foreground hover:bg-muted",
                    ].join(" ")}
                  >
                    {key.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-5">
          <section className="panel overflow-hidden border border-border/80 bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Result</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Your latest calculation</p>
              </div>
              {output && (
                <button
                  type="button"
                  onClick={copyOutput}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            <div className="min-h-48 p-4 sm:p-5">
              {output ? (
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{output.title}</div>
                  {output.type === "latex" ? (
                    <MathPreview latex={output.value} className="py-3 text-foreground" />
                  ) : (
                    <p className="break-words text-lg font-semibold leading-relaxed text-foreground">{output.value}</p>
                  )}
                  {output.note && <p className="text-xs leading-relaxed text-muted-foreground">{output.note}</p>}
                </div>
              ) : (
                <div className="flex min-h-40 flex-col items-center justify-center text-center">
                  <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Sigma className="size-5" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Ready to solve</p>
                  <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                    Enter an expression, then choose an operation to see the result here.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="panel overflow-hidden border border-border/80 bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Function graph</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">x and y range: −10 to 10</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowPlot(false); }}
                disabled={!showPlot}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted disabled:opacity-40"
              >
                <RotateCcw className="size-3" /> Reset
              </button>
            </div>
            <div className="p-3 sm:p-4">
              {showPlot ? (
                parsedForPlot?.error ? (
                  <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{parsedForPlot.error}</p>
                ) : (
                  <svg viewBox="0 0 600 320" role="img" aria-label="Graph of the entered function" className="w-full overflow-visible">
                    {Array.from({ length: 11 }, (_, i) => (
                      <g key={i}>
                        <line x1={(600 * i) / 10} y1="0" x2={(600 * i) / 10} y2="320" stroke="currentColor" strokeOpacity="0.09" />
                        <line x1="0" y1={(320 * i) / 10} x2="600" y2={(320 * i) / 10} stroke="currentColor" strokeOpacity="0.09" />
                      </g>
                    ))}
                    <line x1="0" y1="160" x2="600" y2="160" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.3" />
                    <line x1="300" y1="0" x2="300" y2="320" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.3" />
                    <path d={parsedForPlot?.path ?? ""} fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <text x="584" y="150" fill="currentColor" opacity="0.7" fontSize="12">x</text>
                    <text x="310" y="14" fill="currentColor" opacity="0.7" fontSize="12">y</text>
                  </svg>
                )
              ) : (
                <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
                  <ChartLine className="mb-2 size-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Select Plot to visualize f(x).</p>
                </div>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                The graph skips points outside the visible range. Trigonometric functions use radians.
              </p>
            </div>
          </section>

          <div className="flex gap-3 rounded-xl border border-border/70 bg-muted/30 p-3.5 text-xs leading-relaxed text-muted-foreground">
            <span className="mt-0.5 shrink-0 text-primary"><Calculator className="size-4" /></span>
            <p>
              Supported functions include sin, cos, tan, inverse trig, √, |x|, ln, log and eˣ.
              Common polynomial and trigonometric antiderivatives are shown symbolically; other integrals use a numerical approximation.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
