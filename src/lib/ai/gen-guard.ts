import { type Tier } from "@/lib/supabase/entitlements";
import { todaysSpendCents } from "@/lib/supabase/usage";

// the cost-protection gate for the money-costing copilot tools. each such tool
// calls costGate() at the top of its execute; if it returns a refusal, the tool
// returns that refusal AS ITS RESULT (never throws) so gen explains the wall in
// dom voice. on a pass, the tool runs then logs the spend via recordUsage().

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
// projectedCents = the most this call could spend; we refuse pre-flight if it
// would breach the ceiling, so the cap is a real upper bound (spent + this call
// <= ceiling) rather than a tripwire that only fires AFTER an overshoot. (cross-
// turn concurrency can still race the read ... a DB-side atomic reserve is the
// follow-up before multi-user; bounded + fine for the single-operator case.)
export async function costGate(
  userId: string,
  tier: Tier,
  projectedCents = 0,
): Promise<GateRefusal | null> {
  if (tier !== "paid") {
    return { ok: false, blocked: "paid_only", message: PAID_ONLY_MSG };
  }
  if (
    (await todaysSpendCents(userId)) + projectedCents >
    PAID_DAILY_CEILING_CENTS
  ) {
    return { ok: false, blocked: "daily_cap", message: DAILY_CAP_MSG };
  }
  return null;
}
