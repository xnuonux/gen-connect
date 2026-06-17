import { type Tier } from "@/lib/supabase/entitlements";
import { reserveUsage } from "@/lib/supabase/usage";

// the cost-protection gate for the money-costing copilot tools. each such tool
// calls reserveCost() at the top of its execute; if it returns a refusal, the tool
// returns that refusal AS ITS RESULT (never throws) so gen explains the wall in
// dom voice. on a pass, the projected spend is ALREADY logged (the reserve IS the
// ledger write), so the tool runs WITHOUT a second spend log.

// owner-tunable: the paid plan's daily spend ceiling, cents. free is effectively
// 0 (cost-tools refuse before any spend). ~$5/day default ... the arch cost
// model is ~$1.50/day avg, so this caps a runaway loop without throttling a
// real day. set GEN_DAILY_CEILING_CENTS to tune.
export const PAID_DAILY_CEILING_CENTS = Number(
  process.env.GEN_DAILY_CEILING_CENTS ?? 500,
);

// rough marginal cost, cents, from docs/01-architecture.md cost model. find_leads
// + verify_emails are PER-UNIT (per domain queried / per email) ... the tools
// multiply by the batch size so the ledger + the ceiling track real fan-out, not
// a flat per-call fiction (one find_leads call can hit up to 12 hunter requests).
export const TOOL_COST_CENTS = {
  find_leads: 2, // per hunter domain-search request
  find_leads_by_icp: 10, // per 100 leads (apify ~$1/1k, 100-lead min charge/run)
  signal_run: 10, // one live agent run ... apify search + up to ~20 hit scores
  verify_emails: 1, // per email verified (~$0.001-0.004)
  enrich_contact: 30, // path-A $0.30/lead ceiling (per contact)
  bulk_enrich: 30, // per contact
  draft_angles: 11, // ~$0.08 gen + ~$0.03 judge
  send_email: 1, // resend send
} as const;

export type CostToolName = keyof typeof TOOL_COST_CENTS;

export type GateRefusal = {
  ok: false;
  blocked: "paid_only" | "daily_cap";
  message: string;
};

const PAID_ONLY_MSG =
  "that one costs money, so it's on the paid plan. what's free right now: import your own list, organize + tag your pipeline, and see where things stand. want to bring in a list?";
const DAILY_CAP_MSG =
  "that'd push past today's spend cap ... it resets tomorrow. happy to keep organizing what's already in your pipeline in the meantime.";

// returns a refusal result to return straight from the tool, or null to proceed.
// tier first (free => paid_only, no db touch). then ONE db-atomic reserve of the
// projected (upper-bound) cost: gc_reserve_usage locks the user's day window, sums
// today's spend, and writes the cost row ONLY if spent + this call <= ceiling. so
// the cap is a hard upper bound even under concurrency ... two turns can't both
// read a stale sum and both slip past (the race the old check-then-log left open is
// closed at the db). the reserve IS the ledger write, so the tool must NOT also log
// the spend. projectedCents is the most this call could spend; units feeds the
// ledger's fan-out count (domains queried, emails verified, contacts enriched).
//
// the reserve is charged whether or not the tool then succeeds ... a refund would
// mean a row-lowering path, which is the exact attack the ledger's no-update/delete
// RLS + non-neg constraint were built to block. erring toward charging a failed
// attempt is the safe direction for a ceiling (and a failed attempt often still
// cost a provider call). the over-charge is bounded by the projected estimate.
export async function reserveCost(
  tier: Tier,
  kind: CostToolName,
  projectedCents: number,
  units = 1,
): Promise<GateRefusal | null> {
  if (tier !== "paid") {
    return { ok: false, blocked: "paid_only", message: PAID_ONLY_MSG };
  }
  const { reserved } = await reserveUsage(
    kind,
    projectedCents,
    units,
    PAID_DAILY_CEILING_CENTS,
  );
  if (!reserved) {
    return { ok: false, blocked: "daily_cap", message: DAILY_CAP_MSG };
  }
  return null;
}
