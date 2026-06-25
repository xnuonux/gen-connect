import type { Tier } from "@/lib/supabase/entitlements";

// the plan shape, straight from the productization plan: a ~$79 creator tier and
// a ~$149 pro tier, 1 fuel = 1 fully-qualified-and-drafted lead. price ids live
// in env (they're per-stripe-account), never hardcoded ... priceIdFor() resolves
// them at call time. this is the standalone's plan source; the integral version
// re-points getUserTier at LUNARI's plan source and this layer becomes the writer
// for the same tier flag.

export type PlanKey = "creator" | "pro";

export type PlanDef = {
  key: PlanKey;
  label: string;
  monthlyUsd: number;
  fuel: number; // qualified leads / month (1 fuel = 1 lead)
  priceEnv: string; // the env var holding this plan's stripe price id
};

export const PLANS: Record<PlanKey, PlanDef> = {
  creator: {
    key: "creator",
    label: "creator",
    monthlyUsd: 79,
    fuel: 80,
    priceEnv: "STRIPE_PRICE_CREATOR",
  },
  pro: {
    key: "pro",
    label: "pro",
    monthlyUsd: 149,
    fuel: 200,
    priceEnv: "STRIPE_PRICE_PRO",
  },
};

export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];

export function isPlanKey(x: unknown): x is PlanKey {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(PLANS, x);
}

// resolve a stripe price id back to a plan key. pure: the caller passes the env
// price map, so this is testable without process.env.
export function planForPriceId(
  priceId: string,
  priceMap: Partial<Record<PlanKey, string | undefined>>,
): PlanKey | null {
  for (const key of PLAN_KEYS) {
    const mapped = priceMap[key];
    if (mapped && mapped === priceId) return key;
  }
  return null;
}

// a stripe subscription status -> the entitlement tier gen reads. active +
// trialing are clearly paid; past_due keeps access during stripe's dunning
// retries (the standard saas grace window) so a transient card decline doesn't
// instantly wall a paying user. everything else (canceled / unpaid / incomplete
// / incomplete_expired / paused) drops to free. pure + tested.
const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

export function tierForStatus(status: string): Tier {
  return PAID_STATUSES.has(status) ? "paid" : "free";
}
