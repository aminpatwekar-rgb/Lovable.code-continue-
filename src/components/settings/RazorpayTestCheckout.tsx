import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { createTestOrder, verifyTestPayment } from "@/lib/razorpay-test.functions";
import { loadCheckoutScript, type RazorpayHandlerResponse } from "./RazorpayCheckoutButton";

type Result = { tone: "ok" | "error" | "info"; title: string; lines: string[] };

const TONE = {
  ok: "border-green-500/40 bg-green-500/10",
  error: "border-destructive/40 bg-destructive/10",
  info: "border-border bg-muted",
} as const;

function TestCheckoutCard() {
  const [rupees, setRupees] = useState("1");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const create = useServerFn(createTestOrder);
  const verify = useServerFn(verifyTestPayment);

  const amountPaise = Math.round(Number(rupees) * 100);
  const validAmount = Number.isFinite(amountPaise) && amountPaise >= 100 && amountPaise <= 100_000;

  async function pay() {
    if (!validAmount) {
      toast.error("Enter an amount between ₹1 and ₹1,000.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const order = await create({ data: { amountPaise } });
      if (!(await loadCheckoutScript()) || !window.Razorpay) {
        throw new Error("Could not load Razorpay checkout.");
      }
      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "ONYX · Test checkout",
        description: "Test payment (no real money)",
        handler: async (res: RazorpayHandlerResponse) => {
          try {
            const v = await verify({ data: res });
            setResult({
              tone: "ok",
              title: "Payment verified",
              lines: [
                `Order: ${res.razorpay_order_id}`,
                `Payment: ${res.razorpay_payment_id}`,
                `Verified by: ${v.method === "hmac" ? "HMAC-SHA256 signature" : "Razorpay API lookup"}`,
              ],
            });
          } catch (e) {
            setResult({
              tone: "error",
              title: "Verification failed",
              lines: [e instanceof Error ? e.message : "Unknown error"],
            });
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setResult({ tone: "info", title: "Checkout closed", lines: ["No payment was made."] });
          },
        },
        theme: { color: "#111111" },
      });
      rzp.on("payment.failed", (res) => {
        setBusy(false);
        setResult({
          tone: "error",
          title: "Payment failed",
          lines: [res.error?.description ?? "The payment was declined."],
        });
      });
      rzp.open();
    } catch (e) {
      setBusy(false);
      setResult({
        tone: "error",
        title: "Could not start checkout",
        lines: [e instanceof Error ? e.message : "Unknown error"],
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Razorpay test checkout</CardTitle>
        <CardDescription>
          Admin only. Creates a test order, opens Razorpay, then verifies the payment on the server.
          Nothing is saved and no plan is activated.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="rzp-test-amount">Amount (₹)</Label>
          <Input
            id="rzp-test-amount"
            type="number"
            min={1}
            max={1000}
            step={1}
            value={rupees}
            onChange={(e) => setRupees(e.target.value)}
          />
        </div>
        <Button type="button" disabled={busy || !validAmount} onClick={() => void pay()}>
          {busy ? "Working…" : `Pay ₹${validAmount ? amountPaise / 100 : "—"} (test)`}
        </Button>
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Test credentials</p>
          <p>Card 4100 2800 0000 1007 · CVV 123 · any future expiry</p>
          <p>UPI test@razorpay</p>
        </div>
        {result && (
          <div className={`rounded-md border p-3 text-sm ${TONE[result.tone]}`} role="status">
            <p className="font-medium">{result.title}</p>
            {result.lines.map((l) => (
              <p key={l} className="break-all text-xs text-muted-foreground">
                {l}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RazorpayTestCheckout() {
  const { role } = useAuth();
  if (role !== "admin") return null;
  return <TestCheckoutCard />;
}
