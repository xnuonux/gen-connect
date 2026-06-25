import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanKey } from "@/lib/billing/plans";
import type { Tier } from "@/lib/supabase/entitlements";

// the billing write path. the stripe webhook runs with NO session, so the flip
// goes through the service-role admin client with user_id set explicitly. this is
// the ONE place a subscription event becomes (a) the entitlement flag gen reads
// to gate spend and (b) the audit/ui record of the user's plan. both in one txn-
// ish upsert pair, keyed on user_id.

export async function applySubscriptionState(args: {
  userId: string;
  tier: Tier;
  plan: PlanKey | null;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "admin client unavailable" };

  // 1. the entitlement flag (gc_user_entitlements.tier) ... the gate on spend.
  const { error: entErr } = await admin
    .from("gc_user_entitlements")
    .upsert({ user_id: args.userId, tier: args.tier }, { onConflict: "user_id" });
  if (entErr) return { ok: false, error: entErr.message };

  // 2. the subscription record (audit + the ui's "what plan am i on").
  const { error: subErr } = await admin.from("gc_billing_subscriptions").upsert(
    {
      user_id: args.userId,
      plan: args.plan,
      status: args.status,
      stripe_customer_id: args.stripeCustomerId,
      stripe_subscription_id: args.stripeSubscriptionId,
      current_period_end: args.currentPeriodEnd,
    },
    { onConflict: "user_id" },
  );
  if (subErr) return { ok: false, error: subErr.message };
  return { ok: true };
}

// resolve which user a stripe customer maps to ... for subscription.* events that
// carry only the customer id (the row was written at checkout).
export async function userIdForCustomer(
  customerId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("gc_billing_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .limit(1)
    .maybeSingle();
  return (data?.user_id as string | null) ?? null;
}

// the signed-in user's current plan + status, for the billing ui. reads through
// the session client (rls scopes to the user). lazy-imports the server client so
// this module stays importable outside a request (e.g. test harnesses).
export async function getBillingSummary(
  userId: string,
): Promise<{ plan: string | null; status: string | null } | null> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("gc_billing_subscriptions")
      .select("plan, status")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      plan: (data?.plan as string | null) ?? null,
      status: (data?.status as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
