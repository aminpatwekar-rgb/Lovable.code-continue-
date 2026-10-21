import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchQuizAnalytics } from "@/lib/quiz/analytics";

// Quiz analytics is a paid feature: verify the caller's plan on the server
// before computing anything, instead of relying on the client-side PlanGate.
export const getQuizAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { quizId: string }) => {
    if (!input || typeof input.quizId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.quizId)) {
      throw new Error("Invalid quiz");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: allowed, error } = await (context.supabase as any).rpc("user_has_feature", {
      _feature: "advanced_analytics",
    });
    if (error) throw new Error("Could not verify your plan");
    if (!allowed) throw new Error("Quiz analytics require a plan that includes advanced analytics.");
    return fetchQuizAnalytics(data.quizId, context.supabase as any);
  });
