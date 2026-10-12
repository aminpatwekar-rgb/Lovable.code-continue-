import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.5-flash";
type Input = { description: string; totalPoints?: number; levelCount?: number };

function validate(input: Input): Input {
  const description = String(input?.description ?? "").trim();
  if (description.length < 20) throw new Error("Describe the assignment in a little more detail (at least 20 characters).");
  return { description: description.slice(0, 4000), totalPoints: Math.min(500, Math.max(1, Math.round(Number(input.totalPoints) || 100))), levelCount: Math.min(5, Math.max(2, Math.round(Number(input.levelCount) || 4))) };
}

export const generateRubricWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Input) => validate(input))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured for this workspace.");
    const total = data.totalPoints ?? 100;
    const levelCount = data.levelCount ?? 4;
    const prompt = [
      "Design a clear, fair grading rubric from the teacher description below.",
      "Reply with JSON only: { title, description, criteria: [{ title, description, max_points, levels: [{ label, description, points }] }] }.",
      "Create 3 to 8 distinct criteria with observable, specific descriptions. Avoid duplicates and do not invent requirements not implied by the teacher.",
      "Create exactly " + levelCount + " performance levels per criterion, ordered highest to lowest.",
      "The criterion max_points must add up to exactly " + total + " points. Each level score must be from 0 to that criterion maximum, highest level gets full points, lower levels decrease progressively.",
      "Use concise, student-friendly descriptions and meaningful weighting.",
      "Teacher description:", data.description,
    ].join("\n\n");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    let response: Response;
    try {
      response = await fetch(GATEWAY, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json", authorization: "Bearer " + key }, body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: "You are an expert educator and assessment designer. Generate valid, practical rubrics and reply with JSON only." }, { role: "user", content: prompt }], response_format: { type: "json_object" } }) });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw new Error("Rubric generation took too long. Try a shorter description.");
      throw new Error("Could not reach the AI service. Check your connection and try again.");
    } finally { clearTimeout(timer); }
    if (response.status === 429) throw new Error("AI rate limit reached. Please wait a moment and try again.");
    if (response.status === 402) throw new Error("AI credits are exhausted. Add credits in your workspace billing settings.");
    if (response.status === 401 || response.status === 403) throw new Error("The AI credentials were rejected. Contact your administrator.");
    if (!response.ok) throw new Error("Rubric generation failed (" + response.status + "). Please try again.");
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    let raw = payload.choices?.[0]?.message?.content ?? "";
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) raw = fence[1]!.trim();
    const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
    if (start >= 0 && end >= start) raw = raw.slice(start, end + 1);
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { throw new Error("The AI returned an unreadable rubric. Please try again."); }
    if (!Array.isArray(parsed.criteria) || !parsed.criteria.length) throw new Error("The AI did not return rubric criteria. Try describing the assignment more clearly.");
    const criteria = parsed.criteria.slice(0, 10).map((c: any) => ({
      title: String(c.title ?? "").trim().slice(0, 120),
      description: String(c.description ?? "").trim().slice(0, 800),
      max_points: Math.max(1, Number(c.max_points) || 1),
      levels: (Array.isArray(c.levels) ? c.levels : []).slice(0, levelCount).map((l: any) => ({ label: String(l.label ?? "").trim().slice(0, 80), description: String(l.description ?? "").trim().slice(0, 500), points: Math.max(0, Number(l.points) || 0) })).filter((l: any) => l.label),
    })).filter((c: any) => c.title && c.levels.length >= 2);
    if (!criteria.length) throw new Error("The AI could not create valid criteria. Please try again.");
    const rawTotal = criteria.reduce((sum: number, c: any) => sum + c.max_points, 0);
    let assigned = 0;
    criteria.forEach((c: any, index: number) => {
      c.max_points = index === criteria.length - 1 ? Math.max(1, total - assigned) : Math.max(1, Math.round(c.max_points / rawTotal * total));
      assigned += c.max_points;
      const max = Math.max(...c.levels.map((l: any) => l.points), 1);
      c.levels.forEach((l: any) => { l.points = Math.min(c.max_points, Math.round(l.points / max * c.max_points * 2) / 2); });
      c.levels.sort((a: any, b: any) => b.points - a.points);
    });
    return { title: String(parsed.title ?? "AI-generated rubric").trim().slice(0, 120) || "AI-generated rubric", description: String(parsed.description ?? "").trim().slice(0, 1000), criteria };
  });
