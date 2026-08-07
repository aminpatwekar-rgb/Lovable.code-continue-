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
  correct: string[];
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

const ALLOWED_TYPES = [
  "mcq",
  "multi_select",
  "true_false",
  "fill_blank",
  "short_answer",
  "essay",
];

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
    avoid: Array.isArray(input.avoid) ? input.avoid.slice(0, 60).map((s) => String(s).slice(0, 300)) : [],
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
    input.withExplanations
      ? "Include a one or two sentence explanation of why the answer is right."
      : "Leave explanation as an empty string.",
    input.avoid?.length
      ? `Do NOT repeat or paraphrase these existing questions:\n- ${input.avoid.join("\n- ")}`
      : "",
    "",
    "Rules:",
    "- Never invent facts that are not supported by the material.",
    "- No duplicate or near-duplicate questions.",
    '- "mcq": exactly 4 options, exactly 1 entry in correct (matching an option verbatim).',
    '- "multi_select": 4-5 options, 2 or more entries in correct (each matching an option verbatim).',
    '- "true_false": options ["True","False"], correct is one of them.',
    '- "fill_blank": use ____ in the prompt, options [], correct holds accepted answers.',
    '- "short_answer": options [], correct holds 1-3 acceptable short answers.',
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
      const type = ALLOWED_TYPES.includes(String(item['type'])) ? String(item['type']) : "mcq";
      const options = Array.isArray(item['options']) ? item['options'].map((o) => String(o)) : [];
      const correct = Array.isArray(item['correct'])
        ? item['correct'].map((o) => String(o))
        : item['correct'] != null
          ? [String(item['correct'])]
          : [];
      const difficulty = ["easy", "medium", "hard"].includes(String(item['difficulty']))
        ? String(item['difficulty'])
        : "medium";
      return {
        type,
        difficulty,
        prompt: String(item['prompt'] ?? "").trim(),
        options,
        correct,
        explanation: String(item['explanation'] ?? "").trim(),
        points: Number(item['points']) > 0 ? Number(item['points']) : 1,
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
              "You are an experienced examiner. You write precise, unambiguous assessment questions grounded only in the supplied material, and you always reply with valid JSON.",
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

/** Generates a batch of questions from study material. */
export const generateQuizQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: GenerateInput) => validate(input))
  .handler(async ({ data }) => {
    const content = await callGemini(buildPrompt(data));
    return { questions: parseQuestions(content).slice(0, data.count) };
  });

/** Regenerates a single question, avoiding everything already in the quiz. */
export const regenerateQuizQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: GenerateInput) => validate({ ...input, count: 1 }))
  .handler(async ({ data }) => {
    const content = await callGemini(buildPrompt({ ...data, count: 1 }));
    const [question] = parseQuestions(content);
    if (!question) throw new Error("Couldn't regenerate that question. Try again.");
    return { question };
  });
