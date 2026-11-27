import { describe, it, expect } from "vitest";
import { isOrderFullyPaid, isPaidPlanCode, nextExpiry, toPaise } from "./prepaid";

const now = new Date("2026-01-01T00:00:00Z");
const day = 86_400_000;

describe("prepaid billing rules", () => {
  it("only CORE, ORBIT and NEXUS can be bought online", () => {
    expect(isPaidPlanCode("core")).toBe(true);
    expect(isPaidPlanCode("orbit")).toBe(true);
    expect(isPaidPlanCode("nexus")).toBe(true);
    expect(isPaidPlanCode("spark")).toBe(false);
    expect(isPaidPlanCode("apex")).toBe(false);
  });
  it("prices convert to paise", () => {
    expect(toPaise(499)).toBe(49900);
    expect(toPaise(2499)).toBe(249900);
    expect(toPaise(9999)).toBe(999900);
  });
  it("new purchase gives 30 days from now", () => {
    expect(nextExpiry(now, null, "core").getTime()).toBe(now.getTime() + 30 * day);
  });
  it("renewing same active plan stacks onto remaining time", () => {
    const exp = new Date(now.getTime() + 10 * day);
    expect(nextExpiry(now, { planCode: "core", status: "active", expiresAt: exp }, "core").getTime()).toBe(now.getTime() + 40 * day);
  });
  it("switching plan or expired plan starts fresh", () => {
    const exp = new Date(now.getTime() + 10 * day);
    expect(nextExpiry(now, { planCode: "core", status: "active", expiresAt: exp }, "orbit").getTime()).toBe(now.getTime() + 30 * day);
    const old = new Date(now.getTime() - day);
    expect(nextExpiry(now, { planCode: "core", status: "active", expiresAt: old }, "core").getTime()).toBe(now.getTime() + 30 * day);
  });
  it("order is paid only with full amount", () => {
    expect(isOrderFullyPaid({ status: "paid", amount_paid: 49900 }, 49900)).toBe(true);
    expect(isOrderFullyPaid({ status: "paid", amount_paid: 100 }, 49900)).toBe(false);
    expect(isOrderFullyPaid({ status: "attempted", amount_paid: 0 }, 49900)).toBe(false);
  });
});
