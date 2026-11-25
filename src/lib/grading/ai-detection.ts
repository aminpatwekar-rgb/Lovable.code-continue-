/**
 * AI-writing indicators. Pure functions, no network: safe to import on client and server.
 * These are *indicators for teacher review*, never proof. Short or heavily formal text is
 * easy to misjudge, so very short submissions are not scored at all.
 */

export const MIN_WORDS_TO_SCORE = 100;
export const MAX_SCAN_BATCH = 30;

export type AiRisk = "low" | "medium" | "high";

export type AiSignal = {
  key: string;
  label: string;
  detail: string;
  /** Contribution to the score when fired. */
  weight: number;
  fired: boolean;
};

export type AiFlag = { text: string; reason: string };

export type AiScanResult = {
  submission_id: string;
  status: "done" | "too_short" | "no_text";
  score: number | null;
  risk: AiRisk | null;
  word_count: number;
  signals: AiSignal[];
  flagged: AiFlag[];
  model: string | null;
  scanned_at: string;
};

/** Phrases that appear far more often in chatbot output than in student writing. */
const STOCK_PHRASES: { re: RegExp; label: string }[] = [
  {
    re: /\bit is (?:crucial|important|essential|worth noting) (?:to note |to remember |to understand )?that\b/i,
    label: "“it is crucial/important to note that”",
  },
  {
    re: /\bin (?:summary|conclusion),? (?:it is|a|the|we)\b/i,
    label: "formulaic “In summary/conclusion” opener",
  },
  { re: /\bdelv(?:e|es|ing) (?:into|deeper)\b/i, label: "“delve into”" },
  { re: /\bin the (?:realm|world|landscape) of\b/i, label: "“in the realm/landscape of”" },
  { re: /\ba (?:testament|beacon) (?:to|of)\b/i, label: "“a testament to”" },
  {
    re: /\b(?:plays?|played) a (?:crucial|pivotal|vital|significant) role\b/i,
    label: "“plays a pivotal/crucial role”",
  },
  {
    re: /\bmultifaceted\b|\bmyriad\b|\btapestry\b|\bintricate interplay\b/i,
    label: "ornate filler vocabulary",
  },
  { re: /\bfurthermore,? a\b|\ba balanced approach\b/i, label: "“a balanced approach”" },
  {
    re: /\bas an ai\b|\bI (?:cannot|can't) (?:browse|access)\b|\bas a language model\b/i,
    label: "chatbot self-reference",
  },
];

const FORMAL_OPENERS =
  /^(?:furthermore|moreover|additionally|consequently|in addition|overall|ultimately|in conclusion|in summary|thus|therefore),?\s/i;

/** Remove $math$ blocks and collapse whitespace so equations don't skew sentence statistics. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]{1,200}\$/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])|\n+/)
    .map((s) => s.trim())
    .filter((s) => countWords(s) >= 3);
}

function mean(values: number[]) {
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
}
function stdev(values: number[]) {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

export type LocalAnalysis = {
  wordCount: number;
  sentenceCount: number;
  signals: AiSignal[];
  flagged: AiFlag[];
  /** 0-100 from the local signals alone. */
  localScore: number;
};

export function analyzeLocally(rawText: string, opts?: { pasteAttempts?: number }): LocalAnalysis {
  const text = cleanText(rawText);
  const wordCount = countWords(text);
  const sentences = splitSentences(text);
  const flagged: AiFlag[] = [];
  const signals: AiSignal[] = [];

  // 1. Burstiness: uniform sentence length is typical of generated text.
  const lengths = sentences.map(countWords);
  const cv = lengths.length >= 6 ? stdev(lengths) / Math.max(1, mean(lengths)) : null;
  const uniform = cv !== null && cv < 0.35;
  signals.push({
    key: "burstiness",
    label: "Uniform sentence length",
    detail:
      cv === null
        ? "Too few sentences to measure variation."
        : `Sentence-length variation is ${cv.toFixed(2)} (people usually vary more than 0.40; generated text is often flatter).`,
    weight: 25,
    fired: uniform,
  });

  // 2. Stock phrases.
  const phraseHits = new Set<string>();
  for (const s of sentences) {
    for (const p of STOCK_PHRASES) {
      if (p.re.test(s)) {
        phraseHits.add(p.label);
        if (flagged.length < 8)
          flagged.push({
            text: s.slice(0, 300),
            reason: `Contains ${p.label}, common in chatbot output.`,
          });
        break;
      }
    }
  }
  signals.push({
    key: "stock_phrases",
    label: "Chatbot-style phrasing",
    detail: phraseHits.size
      ? `Found: ${[...phraseHits].slice(0, 4).join("; ")}.`
      : "No stock chatbot phrases found.",
    weight: 30,
    fired: phraseHits.size >= 2,
  });

  // 3. Transition-heavy sentence openers.
  const openers = sentences.filter((s) => FORMAL_OPENERS.test(s)).length;
  const openerRatio = sentences.length ? openers / sentences.length : 0;
  signals.push({
    key: "transitions",
    label: "Heavy formal transitions",
    detail: `${openers} of ${sentences.length} sentences open with a formal transition (Furthermore, Moreover, Overall…).`,
    weight: 15,
    fired: openers >= 3 && openerRatio >= 0.2,
  });

  // 4. Blocked paste attempts recorded by the locked editor.
  const paste = opts?.pasteAttempts ?? 0;
  signals.push({
    key: "paste_attempts",
    label: "Blocked paste attempts",
    detail:
      paste > 0
        ? `The locked editor blocked ${paste} paste attempt${paste === 1 ? "" : "s"}.`
        : "No blocked paste attempts.",
    weight: 10,
    fired: paste >= 2,
  });

  const maxLocal = signals.reduce((n, s) => n + s.weight, 0);
  const fired = signals.filter((s) => s.fired).reduce((n, s) => n + s.weight, 0);
  return {
    wordCount,
    sentenceCount: sentences.length,
    signals,
    flagged,
    localScore: Math.round((fired / maxLocal) * 100),
  };
}

export function riskFor(score: number): AiRisk {
  return score >= 60 ? "high" : score >= 30 ? "medium" : "low";
}

/** Blend local indicators with the model's assessment. Local-only when the model is unavailable. */
export function blendScore(localScore: number, llmScore: number | null): number {
  if (llmScore === null) return Math.min(100, localScore);
  return Math.max(0, Math.min(100, Math.round(localScore * 0.4 + llmScore * 0.6)));
}
