import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AdminCtx = {
  userId: string;
  supabase: {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  };
};

async function assertAdmin(context: AdminCtx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Could not verify permissions");
  if (!data) throw new Error("Forbidden");
}

const MIN_PAISE = 100;
const MAX_PAISE = 100_000; // ₹1,000 cap for test orders

export const createTestOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ amountPaise: z.number().int().min(MIN_PAISE).max(MAX_PAISE) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AdminCtx);
    const { razorpay, razorpayEnv } = await import("@/lib/billing/razorpay.server");
    const env = razorpayEnv();
    if (env.live) throw new Error("Test checkout is disabled with live keys.");
    const order = await razorpay("orders", {
      method: "POST",
      body: {
        amount: data.amountPaise,
        currency: "INR",
        receipt: `test_${Date.now()}`,
        notes: { purpose: "test-checkout", userId: context.userId },
      },
    });
    return {
      orderId: order.id as string,
      amount: order.amount as number,
      currency: order.currency as string,
      keyId: env.keyId,
    };
  });

export const verifyTestPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
        razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
        razorpay_signature: z.string().min(1).max(256),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as AdminCtx);
    const { razorpay, razorpayEnv } = await import("@/lib/billing/razorpay.server");
    const env = razorpayEnv();
    if (env.live) throw new Error("Test checkout is disabled with live keys.");

    // Preferred: HMAC-SHA256(order_id|payment_id, KEY_SECRET) when the secret is available.
    if (env.mode === "direct") {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(env.keySecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign(
        "HMAC",
        key,
        enc.encode(`${data.razorpay_order_id}|${data.razorpay_payment_id}`),
      );
      const expected = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join(
        "",
      );
      const given = data.razorpay_signature.toLowerCase();
      let diff = expected.length ^ given.length;
      for (let i = 0; i < expected.length; i++)
        diff |= expected.charCodeAt(i) ^ (given.charCodeAt(i) || 0);
      if (diff !== 0) {
        throw new Error("Signature mismatch. Payment not verified.");
      }
      return { verified: true as const, method: "hmac" as const };
    }

    // Connector mode has no key secret: confirm with Razorpay that this payment belongs to this order.
    const pay = await razorpay(`payments/${data.razorpay_payment_id}`);
    if (
      pay.order_id !== data.razorpay_order_id ||
      !["authorized", "captured"].includes(pay.status)
    ) {
      throw new Error("Payment could not be verified with Razorpay.");
    }
    return { verified: true as const, method: "api" as const };
  });
