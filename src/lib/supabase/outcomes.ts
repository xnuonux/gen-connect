import { createClient } from "@/lib/supabase/server";
import { type OutcomeType } from "@/lib/types/outcome";

// the dollars-not-fuel revenue ledger (gc_outcome_events, v0_1_7). one row per
// real win the user logs; the hero stat sums it. this is the only writer +
// reader. the event_type taxonomy lives in lib/types/outcome (client-safe).
export {
  OUTCOME_TYPES,
  OUTCOME_LABELS,
  type OutcomeType,
} from "@/lib/types/outcome";

export type OutcomeInput = {
  contactId?: string | null;
  sourceDraftId?: string | null;
  eventType: OutcomeType;
  dollarValue: number;
  note?: string | null;
};

// log one real outcome. user_id is set server-side from the session, never
// trusted from the client; RLS scopes the write to the caller.
export async function recordOutcome(
  userId: string,
  input: OutcomeInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("gc_outcome_events").insert({
      user_id: userId,
      contact_id: input.contactId ?? null,
      source_draft_id: input.sourceDraftId ?? null,
      event_type: input.eventType,
      // clamp non-negative + round to cents so a fat-fingered value can't poison
      // the hero (the db CHECK also guards >= 0).
      dollar_value: Math.max(0, Math.round(input.dollarValue * 100) / 100),
      note: input.note ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}

// the hero number: total opportunity dollars since launch, in CENTS (integer) to
// keep the ui math float-drift-free. RLS scopes to the caller. wins are few, so a
// client-side sum is fine; past ~1000 logged wins this should move to a sum rpc
// (the postgrest row cap would otherwise truncate the tail).
export async function totalOpportunitiesCents(): Promise<number> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("gc_outcome_events")
      .select("dollar_value");
    return ((data ?? []) as { dollar_value: number | string | null }[]).reduce(
      (sum, r) => sum + Math.round((Number(r.dollar_value) || 0) * 100),
      0,
    );
  } catch {
    return 0;
  }
}
