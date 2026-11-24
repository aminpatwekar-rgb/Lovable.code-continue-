import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// The former ₹1 test checkout never created or activated a subscription.
// Keep the exported server functions fail-closed so stale callers cannot charge users.
export const createRazorpayTestOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    throw new Error("Razorpay test checkout is disabled. Live subscription billing is not configured.");
  });

export const verifyRazorpayTestPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input)
  .handler(async () => {
    throw new Error("Razorpay test payment verification is disabled. No subscription was activated.");
  });
