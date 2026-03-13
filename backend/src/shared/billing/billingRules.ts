export type BillingType = "PAID" | "FREE" | "DEMO";

const NON_REVENUE_BILLING_TYPES: BillingType[] = ["FREE", "DEMO"];

export function normalizeBillingType(value: unknown): BillingType {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "PAID";
  if (normalized === "FREE" || normalized === "DEMO") return normalized;
  return "PAID";
}

export function resolveRevenueExcluded(billingType: BillingType, requested?: boolean): boolean {
  if (NON_REVENUE_BILLING_TYPES.includes(billingType)) return true;
  return requested ?? false;
}

export function getInitialCreditsForBillingType(billingType: BillingType, requestedCredits: number): number {
  if (billingType === "DEMO") return Math.max(10, requestedCredits);
  return requestedCredits;
}

export function isRevenueEligibleUser(input: { billingType?: string | null; revenueExcluded?: boolean | null }) {
  return normalizeBillingType(input.billingType) === "PAID" && input.revenueExcluded !== true;
}

export function buildRevenueEligibleUserWhere(extra: Record<string, unknown> = {}) {
  return {
    revenueExcluded: false,
    billingType: { notIn: NON_REVENUE_BILLING_TYPES },
    ...extra,
  };
}
