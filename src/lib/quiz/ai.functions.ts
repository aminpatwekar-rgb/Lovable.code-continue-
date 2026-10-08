import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Gemini-backed quiz generation. The API key never leaves the server: every
 * request is proxied through this handler.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.5-flash";
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

const GENERATOR_SYSTEM_PROMPT = [
  "You are a veteran teacher and professional exam writer with decades of experience writing fair, rigorous assessments.",
  "You write questions that measure real understanding of the material, not trivia or guessing skill.",
  "Every question must be answerable from the supplied study material alone, and must have exactly one defensible answer.",
  "You never invent facts, never use outside knowledge, and never write filler questions.",
  "In this stage you write ONLY the questions; the answer key is produced and verified in a separate stage, so leave correct as [] and explanation as an empty string.",
  "Always reply with valid JSON only.",
].join(" ");

const ANSWER_KEY_SYSTEM_PROMPT =
  "You are a meticulous answer-key verifier for academic quizzes. Use ONLY the supplied study material, never outside knowledge, and never guess. Always reply with valid JSON only.";

function buildPrompt(input: GenerateInput) {
  const difficultyGuide =
    input.difficulty === "mixed"
      ? "Use a balanced mix of difficulties (roughly 30% easy, 40% medium, 30% hard)."
      : `Every question must be ${input.difficulty} difficulty.`;

  return [
    `Write exactly ${input.count} high-quality exam question(s) from the STUDY MATERIAL at the bottom.`,
    `Allowed question types: ${input.types.join(", ")}. Use every allowed type at least once when the count allows, and spread them evenly.`,
    difficultyGuide,
    input.topic ? `Focus on this topic: ${input.topic}.` : "",
    input.avoid?.length
      ? `Do NOT repeat, rephrase, or test the same fact as any of these existing questions:\n- ${input.avoid.join("\n- ")}`
      : "",
    "",
    "HOW TO PICK WHAT TO ASK",
    "- Test the most important ideas, definitions, relationships, causes, processes, formulas and conclusions in the material. Skip trivia such as names, page details, dates or numbers that don't matter.",
    "- Cover DIFFERENT parts of the material. Do not ask two questions about the same fact, and do not cluster questions on one paragraph.",
    "- Cognitive level: easy = recall or recognise a key fact/definition; medium = explain, compare, or apply an idea to a short example; hard = analyse, reason through multiple steps, apply to a new situation, or spot a misconception. Hard questions must still be answerable from the material.",
    "- For maths, science and numerical material, prefer questions that need a calculation or application of a formula. Make sure every number given is consistent and the result is exactly derivable from the material.",
    "",
    "QUALITY RULES FOR EVERY QUESTION",
    "- The prompt must be clear, self-contained and unambiguous. A student must understand it without seeing the material. Never write \"according to the passage/text/material\", \"as mentioned above\", or refer to figures that are not included.",
    "- Exactly one answer must be defensible. No trick wording, no double negatives, no opinion-based questions.",
    "- Use plain, precise language at the level of the material. Keep prompts concise.",
    "- Never include the answer, or a clue that gives it away, in the prompt or in other questions.",
    "- Do not number the questions or prefix them with 'Q1:' etc.",
    "",
    "FORMAT RULES PER TYPE",
    '- "mcq": exactly 4 options. One is correct; the other three are plausible distractors built from realistic student mistakes, common misconceptions, or closely related concepts from the material. Distractors must be clearly wrong to someone who knows the material, but not silly or obviously absurd. Make all options similar in length, style and grammar so the right answer cannot be guessed from its shape. Vary which position holds the correct option. Never use "All of the above", "None of the above", or "Both A and B". Do not prefix options with A), B) etc.',
    '- "multi_select": 4-5 options, with 2 or 3 correct. The prompt must say "Select all that apply". Each option must be independently and clearly true or false based on the material.',
    '- "true_false": options exactly ["True","False"]. The statement must be clearly and fully true or fully false, not partly true. Avoid absolute words like "always" or "never" unless the material states them. Roughly balance true and false statements across the quiz.',
    '- "fill_blank": use exactly one ____ in the prompt. The blank must be a key term or value with a single short, unambiguous answer (one to three words, or a number). The sentence around the blank must give enough context that only that answer fits. options [].',
    '- "short_answer": a focused question answerable in one to two sentences, or a short calculation with a definite result. State exactly what is being asked for. options [].',
    '- "essay": an open question that requires explanation, comparison or argument built from the material, and states what a strong answer should cover (for example "Explain X and discuss Y"). options [].',
    "- In this stage correct must always be [] and explanation must be \"\".",
    "- points: 1 for easy, 2 for medium, 3 for hard.",
    "",
    "MATH AND SCIENCE FORMATTING",
    "- Write every formula, equation, variable with a subscript or superscript, and chemical formula in LaTeX: inline as $...$ and display as $$...$$ (for example $x^2 + 5x + 6 = 0$, $\\frac{a}{b}$, $\\mathrm{H_2O}$).",
    "- Escape backslashes correctly so the JSON stays valid.",
    "",
    "BEFORE YOU ANSWER, silently check each question: Is it clear? Is there exactly one right answer supported by the material? Are the distractors plausible? Is it different from every other question? Fix or replace any question that fails.",
    "",
    'Reply with JSON only, shaped { "questions": [ { "type", "difficulty", "prompt", "options", "correct", "explanation", "points" } ] }.',
    "",
    "STUDY MATERIAL:",
    input.material,
  ]
    .filter((line, i, arr) => line !== "" || (arr[i - 1] ?? "") !== "")
    .join("\n");
}

function parseQuestions(raw: string): GeneratedQuestion[] {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1]!.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start > 0 || end < text.length - 1) text = text.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The AI returned an unreadable response. Try generating again.");
  }
  const list = (parsed as { questions?: unknown[] })?.questions;
  if (!Array.isArray(list) || !list.length) {
    throw new Error("The AI didn't return any questions. Try adding more material.");
  }

  return list
    .map((q) => {
      const item = q as Record<string, unknown>;
      const type = ALLOWED_TYPES.includes(String(item["type"])) ? String(item["type"]) : "mcq";
      const options = Array.isArray(item["options"]) ? item["options"].map((o) => String(o)) : [];
      const correct = Array.isArray(item["correct"]) ? item["correct"].map(String).filter(Boolean) : [];
      const difficulty = ["easy", "medium", "hard"].includes(String(item["difficulty"]))
        ? String(item["difficulty"])
        : "medium";
      return {
        type,
        difficulty,
        prompt: String(item["prompt"] ?? "").trim(),
        options,
        correct,
        explanation: String(item["explanation"] ?? "").trim(),
        points: Number(item["points"]) > 0 ? Number(item["points"]) : 1,
      };
    })
    .filter((q) => q.prompt.length > 0);
}

async function callGemini(prompt: string, system: string) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this workspace.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(GATEWAY, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error)?.name === "AbortError") {
      throw new Error("The AI took too long to respond. Try fewer questions or less material.");
    }
    throw new Error("Could not reach the AI service. Check your connection and try again.");
  }
  clearTimeout(timer);

  if (res.status === 429) {
    throw new Error("AI rate limit reached. Please wait a moment and try again.");
  }
  if (res.status === 402) {
    throw new Error("AI credits are exhausted. Add credits in your workspace billing settings.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("The AI credentials were rejected. Contact your administrator.");
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`AI gateway error [${res.status}]: ${body}`);
    throw new Error(`The AI service failed (${res.status}). Please try again.`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("The AI returned an empty response. Try again.");
  return content;
}

type GroundedAnswer = {
  index: number;
  correct: string[];
  explanation: string;
  sourceEvidence: string;
};

function normalizeGroundingText(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validateQuestionShape(questions: GeneratedQuestion[]) {
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i]!;
    const label = "Question " + (i + 1);
    if (!q.prompt.trim()) throw new Error(label + " is missing its question text.");

    if (q.type === "mcq") {
      if (q.options.length !== 4 || q.options.some((o) => !o.trim())) {
        throw new Error(label + " must have exactly four non-empty options.");
      }
      if (new Set(q.options.map(normalizeGroundingText)).size !== q.options.length) {
        throw new Error(label + " contains duplicate options.");
      }
      if (q.correct.length !== 1 || !q.options.includes(q.correct[0]!)) {
        throw new Error(label + " has an invalid MCQ answer key.");
      }
    } else if (q.type === "multi_select") {
      if (q.options.length < 4 || q.options.length > 5 || q.options.some((o) => !o.trim())) {
        throw new Error(label + " must have four or five non-empty options.");
      }
      if (new Set(q.options.map(normalizeGroundingText)).size !== q.options.length) {
        throw new Error(label + " contains duplicate options.");
      }
      if (
        q.correct.length < 2 ||
        q.correct.length > q.options.length ||
        q.correct.some((answer) => !q.options.includes(answer))
      ) {
        throw new Error(label + " must have at least two valid correct options.");
      }
    } else if (q.type === "true_false") {
      q.options = ["True", "False"];
      if (q.correct.length !== 1 || !["True", "False"].includes(q.correct[0]!)) {
        throw new Error(label + " has an invalid True/False answer key.");
      }
    } else if (q.type === "fill_blank" || q.type === "short_answer") {
      if (!q.correct.length) {
        throw new Error(label + " is missing an expected answer.");
      }
    } else if (q.type === "essay" && q.correct.length) {
      throw new Error(label + " must not have an automatic answer key.");
    }
  }
}

function buildAnswerKeyPrompt(
  material: string,
  questions: GeneratedQuestion[],
  withExplanations: boolean,
) {
  const serialized = questions.map((q, index) => ({
    index,
    type: q.type,
    prompt: q.prompt,
    options: q.options,
  }));

  return [
    "You are the answer-key verifier for an academic quiz.",
    "For EVERY question, determine the answer using ONLY the STUDY MATERIAL. Do not use outside knowledge.",
    "You must not change the question or options.",
    "For MCQ, select exactly one option. For multi_select, select every option that is directly supported as correct by the material, with at least two correct options only when the material clearly supports them.",
    "For True/False, select exactly one of True or False.",
    "For fill_blank and short_answer, provide the expected answer(s) that are directly supported by the material.",
    "For essay, return an empty correct array.",
    "For every non-essay question, source_evidence MUST be a short, verbatim excerpt copied from the study material that supports the selected answer. Do not paraphrase the evidence.",
    "If the material does not support a unique or defensible answer, do not guess; the verification will reject it.",
    withExplanations
      ? "Provide a concise explanation based only on the same study material."
      : "Set explanation to an empty string.",
    "",
    'Return JSON only with { "answers": [ { "index", "correct", "explanation", "source_evidence" } ] }.',
    "The answers array must contain one entry for every question index.",
    "",
    "QUESTIONS:",
    JSON.stringify(serialized),
    "",
    "STUDY MATERIAL:",
    material,
  ].join("\n");
}

function parseGroundedAnswers(raw: string): GroundedAnswer[] {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1]!.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start > 0 || end < text.length - 1) text = text.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The AI answer-key response was unreadable. Please try again.");
  }

  const list = (parsed as { answers?: unknown[] })?.answers;
  if (!Array.isArray(list)) {
    throw new Error("The AI did not return an answer key. Please try again.");
  }

  return list.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    return {
      index: Number(item["index"]),
      correct: Array.isArray(item["correct"])
        ? item["correct"].map((v) => String(v).trim()).filter(Boolean)
        : [],
      explanation: String(item["explanation"] ?? "").trim(),
      sourceEvidence: String(item["source_evidence"] ?? "").trim(),
    };
  });
}

/**
 * Verifies each question's answer key against the study material. Questions
 * whose answer cannot be verified are DROPPED (not fatal), so one bad question
 * never throws away the whole batch.
 */
async function applyAndVerifyAnswerKeys(
  material: string,
  questions: GeneratedQuestion[],
  withExplanations: boolean,
): Promise<GeneratedQuestion[]> {
  const content = await callGemini(
    buildAnswerKeyPrompt(material, questions, withExplanations),
    ANSWER_KEY_SYSTEM_PROMPT,
  );
  const answers = parseGroundedAnswers(content);

  const byIndex = new Map<number, GroundedAnswer>();
  for (const answer of answers) {
    if (Number.isInteger(answer.index) && answer.index >= 0 && answer.index < questions.length) {
      if (!byIndex.has(answer.index)) byIndex.set(answer.index, answer);
    }
  }

  const normalizedMaterial = normalizeGroundingText(material);
  const verified: GeneratedQuestion[] = [];

  questions.forEach((question, index) => {
    const answer = byIndex.get(index);
    if (!answer) return;

    if (question.type !== "essay") {
      if (!answer.sourceEvidence) return;
      const evidence = normalizeGroundingText(answer.sourceEvidence);
      if (evidence.length < 8 || !normalizedMaterial.includes(evidence)) return;
    }

    const candidate: GeneratedQuestion = {
      ...question,
      correct: answer.correct,
      explanation: withExplanations ? answer.explanation : "",
    };
    try {
      validateQuestionShape([candidate]);
    } catch {
      return;
    }
    verified.push(candidate);
  });

  return verified;
}

/** Generates + verifies questions, topping up across attempts until `count` is reached. */
async function generateVerified(data: GenerateInput): Promise<GeneratedQuestion[]> {
  const collected: GeneratedQuestion[] = [];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3 && collected.length < data.count; attempt += 1) {
    const needed = data.count - collected.length;
    try {
      const content = await callGemini(
        buildPrompt({
          ...data,
          count: needed,
          avoid: [...(data.avoid ?? []), ...collected.map((q) => q.prompt)].slice(0, 60),
        }),
        GENERATOR_SYSTEM_PROMPT,
      );
      const candidate = parseQuestions(content).slice(0, needed);
      const verified = await applyAndVerifyAnswerKeys(
        data.material,
        candidate,
        data.withExplanations,
      );
      collected.push(...verified);
    } catch (error) {
      console.error(`AI quiz generation attempt ${attempt + 1} failed:`, error);
      lastError = error;
    }
  }

  if (!collected.length) {
    throw lastError instanceof Error
      ? lastError
      : new Error(
          "The AI could not produce questions it could verify from your material. Add more detailed study material and try again.",
        );
  }
  return collected.slice(0, data.count);
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
      const questions = await generateVerified(data);

      const settled = await db.rpc("settle_ai_questions", {
        _ledger_id: ledgerId,
        _successful: questions.length,
        _provider: "lovable-ai-gateway",
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
      const [question] = await generateVerified({ ...data, count: 1 });
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
