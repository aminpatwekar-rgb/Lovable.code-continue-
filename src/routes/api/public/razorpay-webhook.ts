import { createFileRoute } from "@tanstack/react-router";

// Public: never trusts the body. Only looks up a known order and re-reads Razorpay.
export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let rzpOrderId: string | undefined;
        try {
          const body = await request.json();
          rzpOrderId = body?.payload?.payment?.entity?.order_id ?? body?.payload?.order?.entity?.id;
        } catch {
          return new Response("ok");
        }
        if (typeof rzpOrderId !== "string" || !/^order_[A-Za-z0-9]+$/.test(rzpOrderId)) return new Response("ok");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: order } = await supabaseAdmin.from("payment_orders").select("id").eq("razorpay_order_id", rzpOrderId).maybeSingle();
        if (!order) return new Response("ok");
        try {
          const { confirmOrder } = await import("@/lib/billing/razorpay.server");
          await confirmOrder(order.id);
          return new Response("ok");
        } catch (e) {
          console.error("razorpay webhook confirm failed", e);
          return new Response("retry", { status: 500 });
        }
      },
    },
  },
});
