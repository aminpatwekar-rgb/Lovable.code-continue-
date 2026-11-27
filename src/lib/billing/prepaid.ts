// Client-safe billing rules for prepaid 30-day plans.
export const PAID_PLAN_CODES = ["core", "orbit", "nexus"] as const;
export type PaidPlanCode = (typeof PAID_PLAN_CODES)[number];
export const PERIOD_DAYS = 30;

export function isPaidPlanCode(code: string): code is PaidPlanCode {
  return (PAID_PLAN_CODES as readonly string[]).includes(code);
}

export function toPaise(monthlyPriceInr: number): number {
  return Math.round(monthlyPriceInr * 100);
}

/** Same plan still active: extend from current expiry. Otherwise start a fresh period now. */
export function nextExpiry(
  now: Date,
  current: { planCode: string; status: string; expiresAt: Date | null } | null,
  purchasedPlanCode: string,
): Date {
  const ms = PERIOD_DAYS * 86_400_000;
  if (
    current &&
    current.status === "active" &&
    current.planCode === purchasedPlanCode &&
    current.expiresAt &&
    current.expiresAt > now
  ) {
    return new Date(current.expiresAt.getTime() + ms);
  }
  return new Date(now.getTime() + ms);
}

/** Razorpay order counts as paid only when status is paid and the full stored amount was received. */
export function isOrderFullyPaid(rzp: { status: string; amount_paid: number }, expectedPaise: number) {
  return rzp.status === "paid" && rzp.amount_paid === expectedPaise;
}
