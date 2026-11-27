import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isPaidPlanCode, toPaise } from "@/lib/billing/prepaid";

export const createPlanOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ planCode: z.string().min(1).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!isPaidPlanCode(data.planCode)) throw new Error("This plan can't be bought online.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { razorpay, razorpayEnv } = await import("@/lib/billing/razorpay.server");
    const { data: plan, error } = await supabaseAdmin
      .from("billing_plans")
      .select("id,code,name,monthly_price_inr,active")
      .eq("code", data.planCode)
      .single();
    if (error || !plan?.active || !plan.monthly_price_inr) throw new Error("Plan not available.");
    const amount = toPaise(Number(plan.monthly_price_inr));
    const userId = context.userId;

    // Reuse an unpaid order for the same plan and amount.
    const { data: existing } = await supabaseAdmin
      .from("payment_orders")
      .select("id,razorpay_order_id")
      .eq("user_id", userId).eq("plan_id", plan.id).eq("status", "pending").eq("amount_paise", amount)
      .not("razorpay_order_id", "is", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    let orderId = existing?.id;
    let rzpOrderId = existing?.razorpay_order_id ?? null;
    if (!orderId || !rzpOrderId) {
      const { data: row, error: insErr } = await supabaseAdmin
        .from("payment_orders")
        .insert({ user_id: userId, plan_id: plan.id, amount_paise: amount })
        .select("id").single();
      if (insErr || !row) throw new Error("Could not start checkout.");
      const rzp = await razorpay("orders", {
        method: "POST",
        body: { amount, currency: "INR", receipt: row.id.replace(/-/g, "").slice(0, 32), notes: { orderId: row.id, userId, plan: plan.code } },
      });
      await supabaseAdmin.from("payment_orders").update({ razorpay_order_id: rzp.id }).eq("id", row.id);
      orderId = row.id;
      rzpOrderId = rzp.id;
    }
    return { orderId, rzpOrderId, amount, currency: "INR", keyId: razorpayEnv().keyId, planName: plan.name };
  });

export const confirmPlanOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: own } = await supabaseAdmin.from("payment_orders").select("id").eq("id", data.orderId).eq("user_id", context.userId).maybeSingle();
    if (!own) throw new Error("Order not found.");
    const { confirmOrder } = await import("@/lib/billing/razorpay.server");
    return confirmOrder(data.orderId);
  });
