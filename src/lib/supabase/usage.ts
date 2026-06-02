import { createClient } from "@/lib/supabase/server";

// the cost ledger behind the daily spend ceiling. one row per money-costing tool
// call, summed server-side so the ceiling can't be gamed client-side. the spend is
// now RESERVED up front (atomically) rather than logged after the fact ... see
// reserveUsage + the gc_reserve_usage rpc (migration v0_1_6).

export type ReserveResult = {
  reserved: boolean;
  spentCents: number;
  reason?: string;
};

// atomically reserve projected spend against today's ceiling. ONE db call does the
// read + ceiling check + ledger write under a per-user lock, so two concurrent
// turns can't both slip past the cap (the race the old check-then-log left open).
// the reserve IS the ledger write ... a reserved tool must NOT also log the spend.
//
// FAILS OPEN: on an rpc error (infra hiccup) we allow the spend, matching the old
// read's posture ... a transient db blip shouldn't take the paid copilot down (the
// tier gate already did the hard gating + the rate limit caps bursts). a clean
// `reserved: false` from the function is a REAL ceiling breach and is honored.
export async function reserveUsage(
  kind: string,
  costCents: number,
  units: number,
  ceilingCents: number,
): Promise<ReserveResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("gc_reserve_usage", {
      p_kind: kind,
      p_units: Math.max(0, Math.round(units)),
      p_cost_cents: Math.max(0, Math.round(costCents)),
      p_ceiling_cents: Math.max(0, Math.round(ceilingCents)),
    });
    if (error || data == null) {
      return { reserved: true, spentCents: 0, reason: "reserve_unavailable" };
    }
    const row = data as {
      reserved?: boolean;
      spent_cents?: number;
      reason?: string;
    };
    return {
      reserved: row.reserved === true,
      spentCents: Number(row.spent_cents) || 0,
      reason: row.reason,
    };
  } catch {
    // never let a ledger hiccup wall a paid user ... the harder gates still hold.
    return { reserved: true, spentCents: 0, reason: "reserve_unavailable" };
  }
}

// today's spend (UTC day) in cents, read-only ... for a spend display or audit.
// the ceiling itself no longer reads through this (the reserve checks atomically);
// kept as the read side of the ledger + the one place the UTC-day boundary lives.
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
    return 0;
  }
}

function startOfUtcDayIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}
