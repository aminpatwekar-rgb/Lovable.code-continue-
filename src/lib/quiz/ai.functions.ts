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

function buildPrompt(input: GenerateInput) {
  return [
    `Generate exactly ${input.count} exam question(s) strictly from the STUDY MATERIAL below.`,
    `Allowed question types: ${input.types.join(", ")}. Spread them across the allowed types.`,
    input.difficulty === "mixed"
      ? "Mix easy, medium and hard difficulty."
      : `Every question must be ${input.difficulty} difficulty.`,
    input.topic ? `Focus on the topic: ${input.topic}.` : "",
    "Generate the questions only in this first stage. Leave correct as [] and explanation as empty. A separate verification stage will select the answer key from the supplied study material.",
    input.avoid?.length
      ? `Do NOT repeat or paraphrase these existing questions:\n- ${input.avoid.join("\n- ")}`
      : "",
    "",
    "Rules:",
    "- Never invent facts that are not supported by the material.",
    "- No duplicate or near-duplicate questions.",
    '- "mcq": exactly 4 options. In this stage, correct must be [].',
    '- "multi_select": 4-5 options. In this stage, correct must be [].',
    '- "true_false": options ["True","False"]. In this stage, correct must be [].',
    '- "fill_blank": use ____ in the prompt, options [], correct must be [].',
    '- "short_answer": options [], correct must be [].',
    '- "essay": options [], correct [].',
    "- points: 1 for easy, 2 for medium, 3 for hard.",
    "",
    'Reply with JSON only, shaped { "questions": [ { "type", "difficulty", "prompt", "options", "correct", "explanation", "points" } ] }.',
    "",
    "STUDY MATERIAL:",
    input.material,
  ]
    .filter(Boolean)
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

async function callGemini(prompt: string) {
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
          {
            role: "system",
            content:
              "You are an experienced assessment-question generator. Generate precise, unambiguous questions grounded ONLY in the supplied study material. Do not select or reveal answer keys in this stage. Never invent facts. Always reply with valid JSON.",
          },
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

async function applyAndVerifyAnswerKeys(
  material: string,
  questions: GeneratedQuestion[],
  withExplanations: boolean,
) {
  const content = await callGemini(buildAnswerKeyPrompt(material, questions, withExplanations));
  const answers = parseGroundedAnswers(content);

  if (answers.length !== questions.length) {
    throw new Error("The AI returned an incomplete answer key. Please try generating again.");
  }

  const byIndex = new Map<number, GroundedAnswer>();
  for (const answer of answers) {
    if (!Number.isInteger(answer.index) || answer.index < 0 || answer.index >= questions.length) {
      throw new Error("The AI returned an invalid answer-key index. Please try again.");
    }
    if (byIndex.has(answer.index)) {
      throw new Error("The AI returned a duplicate answer-key entry. Please try again.");
    }
    byIndex.set(answer.index, answer);
  }

  const normalizedMaterial = normalizeGroundingText(material);
  const grounded = questions.map((question, index) => {
    const answer = byIndex.get(index);
    if (!answer) throw new Error("Question " + (index + 1) + " is missing an answer key.");

    if (question.type !== "essay") {
      if (!answer.sourceEvidence) {
        throw new Error("Question " + (index + 1) + " has no source evidence for its answer.");
      }
      const evidence = normalizeGroundingText(answer.sourceEvidence);
      if (evidence.length < 8 || !normalizedMaterial.includes(evidence)) {
        throw new Error("Question " + (index + 1) + " has an answer that could not be verified against the supplied material.");
      }
    }

    return {
      ...question,
      correct: answer.correct,
      explanation: withExplanations ? answer.explanation : "",
    };
  });

  validateQuestionShape(grounded);
  return grounded;
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
      let questions: GeneratedQuestion[] | null = null;
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 2 && !questions; attempt += 1) {
        try {
          const content = await callGemini(buildPrompt(data));
          const candidate = parseQuestions(content).slice(0, data.count);
          if (candidate.length !== data.count) {
            throw new Error("The AI generated " + candidate.length + " of " + data.count + " requested questions. Please try again.");
          }
          questions = await applyAndVerifyAnswerKeys(data.material, candidate, data.withExplanations);
        } catch (error) {
          lastError = error;
        }
      }

      if (!questions) {
        throw lastError instanceof Error
          ? lastError
          : new Error("The AI could not create a verified quiz. Please try again.");
      }

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
      let question: GeneratedQuestion | null = null;
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 2 && !question; attempt += 1) {
        try {
          const content = await callGemini(buildPrompt({ ...data, count: 1 }));
          const [candidate] = parseQuestions(content);
          if (!candidate) throw new Error("Couldn't regenerate that question. Try again.");
          const verified = await applyAndVerifyAnswerKeys(data.material, [candidate], data.withExplanations);
          question = verified[0] ?? null;
        } catch (error) {
          lastError = error;
        }
      }

      if (!question) {
        throw lastError instanceof Error
          ? lastError
          : new Error("Couldn't regenerate that question. Try again.");
      }

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
