import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Gemini-backed quiz generation. The API key never leaves the server: every
 * request is proxied through this handler.
 */

// Gemini is called directly from the server using the Google AI Studio secret.
// Never expose GEMINI_API_KEY to browser/client code.
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODEL = "gemini-2.5-flash";
const FALLBACK_MODELS = ["gemini-2.5-flash-lite"];
const TIMEOUT_MS = 90_000;

export type GeneratedQuestion = {
  type: string;
  difficulty: string;
  prompt: string;
  options: string[];
  correct: string[]; // AI-selected answer key, grounded in the supplied study material.
  explanation: string;
  points: number;
};

type GenerateInput = {
  material: string;
  count: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  types: string[];
  withExplanations: boolean;
  topic?: string | undefined;
  avoid?: string[] | undefined;
};

const ALLOWED_TYPES = ["mcq", "multi_select", "true_false", "fill_blank", "short_answer", "essay"];

function validate(input: GenerateInput): GenerateInput {
  const material = String(input?.material ?? "").trim();
  if (material.length < 40) {
    throw new Error("Add at least a short paragraph of study material to generate from.");
  }
  const types = (Array.isArray(input.types) ? input.types : []).filter((t) =>
    ALLOWED_TYPES.includes(t),
  );
  if (!types.length) throw new Error("Pick at least one question type.");
  const count = Math.min(30, Math.max(1, Math.round(Number(input.count) || 5)));
  const difficulty = (["easy", "medium", "hard", "mixed"] as const).includes(
    input.difficulty as never,
  )
    ? input.difficulty
    : "medium";
  return {
    material: material.slice(0, 60_000),
    count,
    difficulty,
    types,
    withExplanations: input.withExplanations !== false,
    topic: typeof input.topic === "string" ? input.topic.slice(0, 200) : undefined,
    avoid: Array.isArray(input.avoid)
      ? input.avoid.slice(0, 60).map((s) => String(s).slice(0, 300))
      : [],
  };
}

const SYSTEM_PROMPT = [
  "You are a veteran teacher and professional exam writer with decades of experience writing fair, rigorous assessments.",
  "You write questions that measure real understanding of the material, not trivia or guessing skill.",
  "Every question must be answerable from the supplied study material, have exactly one defensible answer, and come with a correct answer key.",
  "You never invent facts and never write filler questions.",
  "You always reply with a single valid JSON object and nothing else.",
].join(" ");

function buildPrompt(input: GenerateInput) {
  const difficultyGuide =
    input.difficulty === "mixed"
      ? "Use a balanced mix of difficulties (roughly 30% easy, 40% medium, 30% hard)."
      : `Every question must be ${input.difficulty} difficulty.`;

  return [
    `Write exactly ${input.count} high-quality exam question(s), WITH their correct answers, from the STUDY MATERIAL at the bottom.`,
    `Allowed question types: ${input.types.join(", ")}. Use every allowed type at least once when the count allows, and spread them evenly.`,
    difficultyGuide,
    input.topic ? `Focus on this topic: ${input.topic}.` : "",
    input.avoid?.length
      ? `Do NOT repeat, rephrase, or test the same fact as any of these existing questions:\n- ${input.avoid.join("\n- ")}`
      : "",
    "",
    "HOW TO PICK WHAT TO ASK",
    "- Test the most important ideas, definitions, relationships, causes, processes, formulas and conclusions. Skip trivia.",
    "- Cover DIFFERENT parts of the material. Never ask two questions about the same fact.",
    "- easy = recall or recognise a key fact/definition; medium = explain, compare, or apply an idea to a short example; hard = analyse, reason through several steps, or spot a misconception. Hard questions must still be answerable from the material.",
    "- For maths, science and numerical material, prefer questions that need a calculation or application of a formula. Make sure the numbers are consistent and the answer is exactly derivable.",
    "",
    "QUALITY RULES FOR EVERY QUESTION",
    "- The prompt must be clear, self-contained and unambiguous. Never write \"according to the passage/text/material\" or refer to figures that are not included.",
    "- Exactly one answer is defensible. No trick wording, no double negatives, no opinion questions.",
    "- Never include the answer, or a clue to it, in the prompt.",
    "- Do not number the questions or prefix them with 'Q1:'.",
    "",
    "FORMAT RULES PER TYPE",
    '- "mcq": exactly 4 options, exactly one correct. The other three are plausible distractors based on realistic student mistakes or closely related concepts from the material - wrong, but not silly. Make all options similar in length and style so the answer cannot be guessed from its shape. The correct option\u2019s position will be randomised afterwards, so do not worry about its position, but NEVER put it first by habit. Never use "All of the above", "None of the above" or "Both A and B". Do not prefix options with A), B). "correct" is an array holding the correct option text, copied EXACTLY from options.',
    '- "multi_select": 4-5 options with 2 or 3 correct. The prompt must say "Select all that apply". "correct" lists every correct option text, copied EXACTLY from options.',
    '- "true_false": options exactly ["True","False"]. The statement must be fully true or fully false, not partly true. Balance true and false statements across the quiz. "correct" is ["True"] or ["False"].',
    '- "fill_blank": use exactly one ____ in the prompt. The blank is a key term or value with one short unambiguous answer (one to three words, or a number). options []. "correct" holds the answer, e.g. ["photosynthesis"].',
    '- "short_answer": a focused question answerable in one to two sentences, or a short calculation with a definite result. options []. "correct" holds a concise model answer, e.g. ["Mitochondria produce ATP through cellular respiration."].',
    '- "essay": an open question requiring explanation, comparison or argument, stating what a strong answer should cover. options []. "correct" must be [].',
    "- points: 1 for easy, 2 for medium, 3 for hard.",
    input.withExplanations
      ? '- "explanation": one or two sentences explaining why the answer is correct, based on the material.'
      : '- "explanation": always "".',
    '- "source_evidence": a short excerpt (one sentence or less) copied from the study material that supports the answer. Use "" only for essay questions or pure calculations.',
    "",
    "MATH AND SCIENCE FORMATTING",
    "- Write formulas, equations, subscripts/superscripts and chemical formulas in LaTeX: inline $...$ or display $$...$$ (for example $x^2 + 5x + 6 = 0$, $\\frac{a}{b}$, $\\mathrm{H_2O}$).",
    "- Because the reply is JSON, every LaTeX backslash MUST be written as a DOUBLE backslash (\\\\frac, \\\\sqrt, \\\\alpha, \\\\times).",
    "",
    "BEFORE YOU ANSWER, silently check each question: is it clear, is there exactly one right answer, are the distractors plausible, is it different from the others, is the answer key correct? Fix any question that fails.",
    "",
    'Reply with JSON only, shaped { "questions": [ { "type", "difficulty", "prompt", "options", "correct", "explanation", "points", "source_evidence" } ] }.',
    "",
    "STUDY MATERIAL:",
    input.material,
  ]
    .filter((line, i, arr) => line !== "" || (arr[i - 1] ?? "") !== "")
    .join("\n");
}

// ---------------------------------------------------------------------------
// Parsing & cleaning
// ---------------------------------------------------------------------------

function extractJsonText(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1]!.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return text;
}

/** Parses model JSON, repairing the common "LaTeX backslash" breakage. */
function safeParseJson(raw: string): unknown {
  const text = extractJsonText(raw);
  try {
    return JSON.parse(text);
  } catch {
    // Escape lone backslashes that are not part of a valid JSON escape.
    const repaired = text.replace(/\\(?!["\\/nrtu]|u[0-9a-fA-F]{4})/g, "\\\\");
    try {
      return JSON.parse(repaired);
    } catch {
      // Remove trailing commas as a last resort.
      return JSON.parse(repaired.replace(/,\s*([}\]])/g, "$1"));
    }
  }
}

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  return [];
}

/** Maps an AI-supplied answer onto one of the real options ("B", "b) text", case differences...). */
function matchOption(answer: string, options: string[]): string | null {
  if (options.includes(answer)) return answer;
  const norm = normalizeText(answer);
  const exact = options.find((o) => normalizeText(o) === norm);
  if (exact) return exact;
  const letter = answer.trim().match(/^\(?([A-Ea-e])[).:]?$/);
  if (letter) {
    const idx = letter[1]!.toUpperCase().charCodeAt(0) - 65;
    if (options[idx]) return options[idx]!;
  }
  if (norm.length >= 3) {
    const contains = options.filter((o) => {
      const on = normalizeText(o);
      return on.includes(norm) || norm.includes(on);
    });
    if (contains.length === 1) return contains[0]!;
  }
  return null;
}

/** Fisher-Yates shuffle (returns a new array). */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function stripOptionPrefix(option: string) {
  return option.replace(/^\s*\(?[A-Ea-e][).:]\s+/, "").trim();
}

/** Coverage of evidence words found in the material (0..1). */
function evidenceCoverage(evidence: string, materialWords: Set<string>) {
  const words = normalizeText(evidence).split(" ").filter((w) => w.length > 1);
  if (!words.length) return 1;
  const hit = words.filter((w) => materialWords.has(w)).length;
  return hit / words.length;
}

type Cleaned = { question: GeneratedQuestion; evidence: string } | { reject: string };

function cleanQuestion(item: Record<string, unknown>, input: GenerateInput): Cleaned {
  const rawType = String(item["type"] ?? "").trim();
  const type = ALLOWED_TYPES.includes(rawType)
    ? rawType
    : rawType === "multiple_choice" || rawType === "single_choice"
      ? "mcq"
      : "";
  if (!type) return { reject: "unknown type" };
  if (!input.types.includes(type)) return { reject: "type not requested" };

  const prompt = String(item["prompt"] ?? item["question"] ?? "").trim();
  if (prompt.length < 8) return { reject: "empty prompt" };

  const difficulty = ["easy", "medium", "hard"].includes(String(item["difficulty"]))
    ? String(item["difficulty"])
    : "medium";
  const pointsGuess = difficulty === "hard" ? 3 : difficulty === "medium" ? 2 : 1;
  const points = Number(item["points"]) > 0 ? Number(item["points"]) : pointsGuess;
  const explanation = input.withExplanations ? String(item["explanation"] ?? "").trim() : "";
  const evidence = String(item["source_evidence"] ?? item["sourceEvidence"] ?? "").trim();

  let options = toStringArray(item["options"]).map(stripOptionPrefix);
  let correct = toStringArray(item["correct"]);

  if (type === "mcq" || type === "multi_select") {
    const seen = new Set<string>();
    options = options.filter((o) => {
      const n = normalizeText(o);
      if (!n || seen.has(n)) return false;
      seen.add(n);
      return true;
    });
    if (type === "mcq" && options.length !== 4) return { reject: "mcq needs 4 options" };
    if (type === "multi_select" && (options.length < 4 || options.length > 5)) {
      return { reject: "multi_select needs 4-5 options" };
    }
    const mapped = correct.map((c) => matchOption(c, options));
    if (mapped.some((m) => m === null)) return { reject: "answer not among options" };
    correct = [...new Set(mapped as string[])];
    if (type === "mcq" && correct.length !== 1) return { reject: "mcq needs one answer" };
    if (type === "multi_select" && correct.length < 2) return { reject: "multi_select needs 2+ answers" };
    // The AI tends to put the right answer first. Shuffle in code so the position is random.
    // `correct` holds option TEXT, so the answer key follows the shuffle automatically.
    options = shuffled(options);
  } else if (type === "true_false") {
    options = ["True", "False"];
    const first = (correct[0] ?? "").trim().toLowerCase();
    if (first === "true" || first === "t") correct = ["True"];
    else if (first === "false" || first === "f") correct = ["False"];
    else return { reject: "invalid true/false answer" };
  } else if (type === "fill_blank") {
    options = [];
    if (!correct.length) return { reject: "missing blank answer" };
    if (!prompt.includes("__")) return { reject: "fill_blank has no blank" };
  } else if (type === "short_answer") {
    options = [];
    if (!correct.length) return { reject: "missing model answer" };
  } else {
    options = [];
    correct = [];
  }

  return {
    question: { type, difficulty, prompt, options, correct, explanation, points },
    evidence,
  };
}

function parseAndCleanQuestions(raw: string, input: GenerateInput) {
  let parsed: unknown;
  try {
    parsed = safeParseJson(raw);
  } catch {
    throw new Error("The AI returned an unreadable response.");
  }
  const list = Array.isArray(parsed)
    ? parsed
    : ((parsed as { questions?: unknown[] })?.questions as unknown[] | undefined);
  if (!Array.isArray(list) || !list.length) {
    throw new Error("The AI didn't return any questions.");
  }

  const materialWords = new Set(normalizeText(input.material).split(" "));
  const accepted: GeneratedQuestion[] = [];
  const rejections: string[] = [];

  for (const entry of list) {
    const cleaned = cleanQuestion((entry ?? {}) as Record<string, unknown>, input);
    if ("reject" in cleaned) {
      rejections.push(cleaned.reject);
      continue;
    }
    // Only reject answers whose supporting evidence is clearly NOT from the material.
    if (cleaned.evidence && evidenceCoverage(cleaned.evidence, materialWords) < 0.5) {
      rejections.push("evidence not found in material");
      continue;
    }
    // Skip near-duplicates of what we already have.
    const norm = normalizeText(cleaned.question.prompt);
    if (accepted.some((q) => normalizeText(q.prompt) === norm)) {
      rejections.push("duplicate");
      continue;
    }
    accepted.push(cleaned.question);
  }
  return { accepted, rejections };
}

// ---------------------------------------------------------------------------
// Model call
// ---------------------------------------------------------------------------

async function callModel(
  model: string,
  prompt: string,
): Promise<{ ok: true; content: string } | { ok: false; status: number; message: string }> {
  // Explicitly read the Google AI Studio secret. Do not rely on SDK auto-detection.
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("Gemini AI is not configured. Add GEMINI_API_KEY to the server secrets.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;

  try {
    res = await fetch(
      `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error)?.name === "AbortError") {
      throw new Error("The AI took too long to respond. Try fewer questions or less material.");
    }
    throw new Error("Could not reach the Gemini API. Check your connection and try again.");
  }
  clearTimeout(timer);

  if (res.status === 429) {
    throw new Error("Gemini rate limit reached. Please wait a moment and try again.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("The Gemini API key was rejected. Check the GEMINI_API_KEY server secret.");
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`Gemini API error [${res.status}] model=${model}: ${body}`);
    return { ok: false, status: res.status, message: `The Gemini API failed (${res.status}).` };
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const content =
    json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";

  if (!content) {
    return { ok: false, status: 200, message: "Gemini returned an empty response." };
  }
  return { ok: true, content };
}

/** Tries the main model, then fallbacks if it errors out. */
async function callWithFallback(prompt: string): Promise<string> {
  let lastMessage = "The AI service failed. Please try again.";
  for (const model of [MODEL, ...FALLBACK_MODELS]) {
    const result = await callModel(model, prompt);
    if (result.ok) return result.content;
    lastMessage = result.message;
  }
  throw new Error(lastMessage);
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/** Generates questions with answers in one call, topping up over up to 3 attempts. */
async function generateQuestions(data: GenerateInput): Promise<GeneratedQuestion[]> {
  const collected: GeneratedQuestion[] = [];
  const allRejections: string[] = [];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3 && collected.length < data.count; attempt += 1) {
    const needed = data.count - collected.length;
    try {
      const content = await callWithFallback(
        buildPrompt({
          ...data,
          count: needed,
          avoid: [...(data.avoid ?? []), ...collected.map((q) => q.prompt)].slice(0, 60),
        }),
      );
      const { accepted, rejections } = parseAndCleanQuestions(content, data);
      allRejections.push(...rejections);
      const seen = new Set(collected.map((q) => normalizeText(q.prompt)));
      for (const q of accepted) {
        const n = normalizeText(q.prompt);
        if (!seen.has(n) && collected.length < data.count) {
          seen.add(n);
          collected.push(q);
        }
      }
    } catch (error) {
      console.error(`AI quiz generation attempt ${attempt + 1} failed:`, error);
      lastError = error;
    }
  }

  if (!collected.length) {
    if (lastError instanceof Error) throw lastError;
    const reasons = [...new Set(allRejections)].slice(0, 4).join("; ");
    throw new Error(
      "The AI's questions didn't pass quality checks" +
        (reasons ? ` (${reasons})` : "") +
        ". Please try again, or add more study material.",
    );
  }
  return collected;
}

/** Generates a batch of questions from study material. */
export const generateQuizQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: GenerateInput) => validate(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const reservation = await db.rpc("reserve_ai_questions", { _requested: data.count });
    if (reservation.error) throw new Error(reservation.error.message);
    const ledgerId = reservation.data as string;
    try {
      const questions = await generateQuestions(data);

      const settled = await db.rpc("settle_ai_questions", {
        _ledger_id: ledgerId,
        _successful: questions.length,
        _provider: "google-gemini-api",
        _model: MODEL,
        _input_tokens: null,
        _output_tokens: null,
      });
      if (settled.error) throw new Error(settled.error.message);
      return { questions };
    } catch (error) {
      await db.rpc("release_ai_questions", { _ledger_id: ledgerId });
      throw error;
    }
  });

/** Regenerates a single question, avoiding everything already in the quiz. */
export const regenerateQuizQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: GenerateInput) => validate({ ...input, count: 1 }))
  .handler(async ({ data, context }) => {
    const reservation = await context.supabase.rpc("reserve_ai_questions", { _requested: 1 });
    if (reservation.error) throw new Error(reservation.error.message);
    const ledgerId = reservation.data as string;
    try {
      const [question] = await generateQuestions({ ...data, count: 1 });
      if (!question) throw new Error("Couldn't regenerate that question. Try again.");

      const settled = await context.supabase.rpc("settle_ai_questions", {
        _ledger_id: ledgerId,
        _successful: 1,
        _provider: "lovable-ai-gateway",
        _model: MODEL,
        _input_tokens: null,
        _output_tokens: null,
      });
      if (settled.error) throw new Error(settled.error.message);
      return { question };
    } catch (error) {
      await context.supabase.rpc("release_ai_questions", { _ledger_id: ledgerId });
      throw error;
    }
  });
