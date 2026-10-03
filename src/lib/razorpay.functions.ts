import { createHmac, timingSafeEqual } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TEST_AMOUNT_PAISE = 100;
const CURRENCY = "INR";

const paymentVerificationSchema = z.object({
  razorpayOrderId: z.string().min(1).max(128),
  razorpayPaymentId: z.string().min(1).max(128),
  razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/i),
});

function getCredentials() {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];

  if (!keyId || !keySecret) {
    throw new Error("Razorpay test checkout is not configured yet.");
  }

  return { keyId, keySecret };
}

export const createRazorpayTestOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { keyId, keySecret } = getCredentials();
    const receipt = `onyx_test_${context.userId.replaceAll("-", "").slice(0, 12)}_${Date.now()}`;
    const authorization = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: TEST_AMOUNT_PAISE, currency: CURRENCY, receipt }),
    });

    if (!response.ok) {
      console.error("Razorpay order creation failed", response.status, await response.text());
      throw new Error(
        response.status === 401
          ? "Razorpay rejected the test credentials."
          : "Could not start Razorpay checkout. Please try again.",
      );
    }

    const order = z
      .object({
        id: z.string().min(1),
        amount: z.number().int().min(TEST_AMOUNT_PAISE),
        currency: z.literal(CURRENCY),
      })
      .parse(await response.json());

    return {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    };
  });

export const verifyRazorpayTestPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => paymentVerificationSchema.parse(input))
  .handler(async ({ data }) => {
    const { keySecret } = getCredentials();
    const expected = createHmac("sha256", keySecret)
      .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
      .digest();
    const supplied = Buffer.from(data.razorpaySignature, "hex");
    const valid = supplied.length === expected.length && timingSafeEqual(supplied, expected);

    if (!valid) throw new Error("Razorpay could not verify this payment.");

    return { verified: true as const, paymentId: data.razorpayPaymentId };
  });