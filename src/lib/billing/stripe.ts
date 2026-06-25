import Stripe from "stripe";
import { PLANS, type PlanKey } from "@/lib/billing/plans";

// the stripe client, lazily instantiated and SAFE BY DEFAULT: every accessor
// returns null / undefined when the keys aren't set, so the app builds + runs
// with billing simply switched off until you drop in STRIPE_SECRET_KEY,
// STRIPE_WEBHOOK_SECRET, and the per-plan price ids. nothing here throws at
// import time.

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // pin the package's bundled api version (omit the explicit literal so a stripe
  // bump never breaks the build); the version is reproducible per installed
  // package. set it explicitly here if you want to pin harder.
  if (!client) client = new Stripe(key);
  return client;
}

export function stripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}

export function priceIdFor(key: PlanKey): string | undefined {
  return process.env[PLANS[key].priceEnv];
}

// the env price map, for resolving a webhook's price id back to a plan key.
export function priceMapFromEnv(): Partial<Record<PlanKey, string | undefined>> {
  return {
    creator: process.env.STRIPE_PRICE_CREATOR,
    pro: process.env.STRIPE_PRICE_PRO,
  };
}
