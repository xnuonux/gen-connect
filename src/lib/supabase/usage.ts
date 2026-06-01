import { createClient } from "@/lib/supabase/server";

// the cost ledger behind the daily spend ceiling. one row per money-costing
// tool call, summed server-side so the ceiling can't be gamed client-side.

// append one cost event. NEVER throws ... a logging failure must not break a
// tool that already ran + spent the money (losing a ledger row is the lesser
// evil than a 500 after the spend already happened).
export async function recordUsage(
  userId: string,
  kind: string,
  costCents: number,
  units = 1,
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("gc_usage_events").insert({
      user_id: userId,
      kind,
      units,
      cost_cents: Math.max(0, Math.round(costCents)),
    });
  } catch {
    // swallow ... the action succeeded; the ledger is best-effort.
  }
}

// today's spend (UTC day) in cents. summed over the day's rows (small set).
export async function todaysSpendCents(userId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("gc_usage_events")
      .select("cost_cents")
      .eq("user_id", userId)
      .gte("occurred_at", startOfUtcDayIso());
    return ((data ?? []) as { cost_cents: number | null }[]).reduce(
      (sum, r) => sum + (Number(r.cost_cents) || 0),
      0,
    );
  } catch {
    // on a read failure, report 0 ... never block a paid user because the
    // ledger read hiccuped (the tier gate already did the hard gating).
    return 0;
  }
}

function startOfUtcDayIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}
