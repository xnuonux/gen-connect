import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeWebhookSecret, priceMapFromEnv } from "@/lib/billing/stripe";
import { planForPriceId, tierForStatus, isPlanKey, type PlanKey } from "@/lib/billing/plans";
import { applySubscriptionState, userIdForCustomer } from "@/lib/supabase/billing";

// the stripe billing webhook. stripe signs every event; we verify the signature
// (constructEvent) before trusting a byte, then flip the entitlement + record the
// subscription. needs node (raw body + crypto). safe by default: when billing
// isn't configured it 503s in prod and no-ops in dev rather than throwing.
export const runtime = "nodejs";

function toIso(unixSeconds: number | null | undefined): string | null {
  return typeof unixSeconds === "number"
    ? new Date(unixSeconds * 1000).toISOString()
    : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = stripeWebhookSecret();
  if (!stripe || !secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { ok: false, error: "billing webhook not configured" },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, ignored: "stripe not configured" });
  }

  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ ok: false, error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.client_reference_id ?? asString(s.metadata?.userId);
      if (userId) {
        const planMeta = s.metadata?.plan;
        const plan: PlanKey | null = isPlanKey(planMeta) ? planMeta : null;
        await applySubscriptionState({
          userId,
          tier: "paid",
          plan,
          status: "active",
          stripeCustomerId: asString(s.customer),
          stripeSubscriptionId: asString(s.subscription),
          currentPeriodEnd: null,
        });
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = asString(sub.customer);
      const metaUserId = asString(sub.metadata?.userId);
      const userId =
        metaUserId ?? (customerId ? await userIdForCustomer(customerId) : null);
      if (userId) {
        const priceId = sub.items?.data?.[0]?.price?.id ?? null;
        const planMeta = sub.metadata?.plan;
        const plan: PlanKey | null = priceId
          ? planForPriceId(priceId, priceMapFromEnv())
          : isPlanKey(planMeta)
            ? planMeta
            : null;
        const deleted = event.type === "customer.subscription.deleted";
        await applySubscriptionState({
          userId,
          tier: deleted ? "free" : tierForStatus(sub.status),
          plan,
          status: deleted ? "canceled" : sub.status,
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          currentPeriodEnd: toIso(
            (sub as unknown as { current_period_end?: number }).current_period_end,
          ),
        });
      }
    }
  } catch {
    // a verified event whose handler hit a transient db blip ... 200 so stripe
    // doesn't hammer retries; the next event (or a manual replay) reconciles.
    return NextResponse.json({ received: true, handled: false });
  }

  return NextResponse.json({ received: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, hook: "stripe" });
}
