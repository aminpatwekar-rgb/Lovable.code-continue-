import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export function SubscriptionSettingsCard() {
  return (
    <Card className="lift transition-colors duration-200 hover:lift-hover">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>ONYX Subscription</CardTitle>
            <CardDescription>Paid subscriptions are not available yet.</CardDescription>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Billing setup pending
          </span>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        No payment will be taken and no paid plan will be activated until live Razorpay order
        creation, server-side payment verification and subscription activation are configured.
        Contact workonyx.support@gmail.com for plan enquiries.
      </CardContent>
    </Card>
  );
}
