import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createPlanOrder, confirmPlanOrder } from "@/lib/razorpay.functions";

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", cb: (res: { error?: { description?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

// Loaded only when the customer starts checkout.
export function loadCheckoutScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(Boolean(window.Razorpay)));
    script.addEventListener("error", () => resolve(false));
    if (!existing) {
      script.src = CHECKOUT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

export function RazorpayCheckoutButton({ planCode, label }: { planCode: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const create = useServerFn(createPlanOrder);
  const confirm = useServerFn(confirmPlanOrder);
  const qc = useQueryClient();

  async function onSuccess(orderId: string) {
    try {
      // The server re-reads the order and payment from Razorpay before activating the plan.
      const res = await confirm({ data: { orderId } });
      if (res.status === "paid") {
        toast.success("Payment verified. Your plan is now active.");
        await qc.invalidateQueries({ queryKey: ["plan-summary"] });
      } else {
        toast.info("Payment received. Your plan will activate shortly.");
      }
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Could not verify the payment. Contact support if you were charged.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    try {
      const order = await create({ data: { planCode } });
      if (!(await loadCheckoutScript()) || !window.Razorpay) {
        throw new Error("Could not load Razorpay checkout. Check your connection and try again.");
      }
      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.rzpOrderId,
        amount: order.amount,
        currency: order.currency,
        name: "ONYX",
        description: `${order.planName} plan · 30 days`,
        handler: (_res: RazorpayHandlerResponse) => void onSuccess(order.orderId),
        modal: {
          ondismiss: () => {
            setBusy(false);
            toast.info("Checkout cancelled. You have not been charged.");
          },
        },
        theme: { color: "#111111" },
      });
      rzp.on("payment.failed", (res) => {
        setBusy(false);
        toast.error(res.error?.description ?? "Payment failed. Please try again.");
      });
      rzp.open();
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : "Could not start checkout.");
    }
  }

  return (
    <Button type="button" className="w-full" disabled={busy} onClick={() => void start()}>
      {busy ? "Opening checkout…" : label}
    </Button>
  );
}
