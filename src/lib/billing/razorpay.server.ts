import { isOrderFullyPaid, nextExpiry } from "./prepaid";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/razorpay";

export function razorpayEnv() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["RAZORPAY_CONNECTION_KEY"];
  const keyId = process.env["RAZORPAY_CONNECTION_KEY_ID"];
  if (!lovableKey || !connectionKey || !keyId) throw new Error("Razorpay is not connected");
  return { lovableKey, connectionKey, keyId, live: keyId.startsWith("rzp_live_") };
}

export async function razorpay(path: string, init: { method?: string; body?: unknown } = {}) {
  const { lovableKey, connectionKey } = razorpayEnv();
  const res = await fetch(`${GATEWAY_URL}/${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
      "Content-Type": "application/json",
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Razorpay ${path} failed [${res.status}]: ${text}`);
    throw new Error(`Razorpay request failed [${res.status}]`);
  }
  return res.json();
}

/** The only code that marks an order paid and activates a plan. Idempotent. */
export async function confirmOrder(orderId: string): Promise<{ status: "paid" | "pending" | "unknown" }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order, error } = await supabaseAdmin
    .from("payment_orders")
    .select("id,user_id,plan_id,amount_paise,currency,razorpay_order_id,status")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order || !order.razorpay_order_id) return { status: "unknown" };
  if (order.status === "paid") return { status: "paid" };

  let rzp = await razorpay(`orders/${order.razorpay_order_id}`);
  let paymentId: string | null = null;
  if (rzp.status === "attempted") {
    const pays = await razorpay(`orders/${order.razorpay_order_id}/payments`);
    const auth = (pays.items ?? []).find((p: { status: string }) => p.status === "authorized");
    if (auth) {
      const cap = await razorpay(`payments/${auth.id}/capture`, {
        method: "POST",
        body: { amount: order.amount_paise, currency: order.currency },
      });
      if (cap.status === "captured" && cap.amount === order.amount_paise) {
        paymentId = auth.id;
        rzp = { status: "paid", amount_paid: cap.amount };
      }
    }
  }
  if (!isOrderFullyPaid(rzp, order.amount_paise)) return { status: "pending" };

  if (!paymentId) {
    const pays = await razorpay(`orders/${order.razorpay_order_id}/payments`);
    paymentId = (pays.items ?? []).find((p: { status: string }) => p.status === "captured")?.id ?? null;
  }

  const { data: flipped, error: upErr } = await supabaseAdmin
    .from("payment_orders")
    .update({ status: "paid", paid_at: new Date().toISOString(), razorpay_payment_id: paymentId, updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id");
  if (upErr) throw upErr;
  if (!flipped?.length) return { status: "paid" }; // someone else already fulfilled

  const [{ data: sub }, { data: plan }] = await Promise.all([
    supabaseAdmin.from("subscriptions").select("status,expires_at,billing_plans(code)").eq("user_id", order.user_id).maybeSingle(),
    supabaseAdmin.from("billing_plans").select("code").eq("id", order.plan_id).single(),
  ]);
  const current = sub
    ? {
        planCode: (sub.billing_plans as { code: string } | null)?.code ?? "",
        status: sub.status,
        expiresAt: sub.expires_at ? new Date(sub.expires_at) : null,
      }
    : null;
  const now = new Date();
  const expires = nextExpiry(now, current, plan?.code ?? "");
  const startNew = !current || current.planCode !== plan?.code || current.status !== "active" || !current.expiresAt || current.expiresAt <= now;
  const { error: subErr } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: order.user_id,
      plan_id: order.plan_id,
      status: "active",
      expires_at: expires.toISOString(),
      provider: "razorpay",
      provider_subscription_id: order.razorpay_order_id,
      updated_at: now.toISOString(),
      ...(startNew ? { started_at: now.toISOString() } : {}),
    },
    { onConflict: "user_id" },
  );
  if (subErr) throw subErr;
  return { status: "paid" };
}
