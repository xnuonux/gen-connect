import { createClient } from "@/lib/supabase/server";
import { getUserTier } from "@/lib/supabase/entitlements";
import { getBillingSummary } from "@/lib/supabase/billing";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { BillingView } from "./BillingView";

// the upgrade surface. server-reads the current tier + subscription so the cards
// reflect reality (current-plan badge, free-vs-paid copy), and reads the stripe
// config flag so the view degrades gracefully when billing isn't switched on yet.
// the billing= query param carries the post-checkout success/cancel signal.
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string | string[] }>;
}) {
  const sp = await searchParams;
  const billingResult = typeof sp.billing === "string" ? sp.billing : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // the auth gate guarantees a signed-in user on this route, but stay defensive.
  const tier = user ? await getUserTier(user.id) : "free";
  const summary = user ? await getBillingSummary(user.id) : null;

  return (
    <BillingView
      tier={tier}
      currentPlan={summary?.plan ?? null}
      status={summary?.status ?? null}
      stripeConfigured={isStripeConfigured()}
      billingResult={billingResult}
    />
  );
}
