"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured, priceIdFor } from "@/lib/billing/stripe";
import { isPlanKey } from "@/lib/billing/plans";

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

// start a stripe checkout for a plan. auth-gated; degrades with a clean,
// voice-checked message when billing isn't switched on yet (no keys / no price
// id), so the ui never sees a raw stripe error. client_reference_id + metadata
// carry the user id so the webhook can flip the entitlement deterministically.
export async function createCheckoutAction(
  raw: unknown,
): Promise<CheckoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "sign in first ..." };

  const parsed = z.object({ plan: z.string() }).safeParse(raw);
  if (!parsed.success || !isPlanKey(parsed.data.plan)) {
    return { ok: false, error: "pick a real plan ..." };
  }

  if (!isStripeConfigured()) {
    return {
      ok: false,
      error:
        "billing isn't switched on yet ... drop the stripe keys in to enable it.",
    };
  }
  const stripe = getStripe();
  const price = priceIdFor(parsed.data.plan);
  if (!stripe || !price) {
    return {
      ok: false,
      error:
        "billing isn't fully wired yet ... that plan's price id is still missing.",
    };
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/pipeline?billing=success`,
      cancel_url: `${origin}/pipeline?billing=cancelled`,
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: { userId: user.id, plan: parsed.data.plan },
      subscription_data: { metadata: { userId: user.id, plan: parsed.data.plan } },
      allow_promotion_codes: true,
    });
    if (!session.url) {
      return { ok: false, error: "stripe didn't hand back a checkout link ... try again." };
    }
    return { ok: true, url: session.url };
  } catch {
    return { ok: false, error: "couldn't start checkout ... give it another shot." };
  }
}
