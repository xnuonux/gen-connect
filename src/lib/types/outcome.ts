// the dollars-not-fuel outcome taxonomy ... pure constants, no server imports,
// so both the server ledger (lib/supabase/outcomes) and client UI (the drawer's
// log-a-win form) can share them. creator-flavored on purpose (gig/stream/merch
// next to deal/meeting/lead) ... it tells you who the icp is.
export const OUTCOME_TYPES = [
  "gig_booked",
  "subscriber_acquired",
  "stream_revenue",
  "merch_sale",
  "lead_qualified",
  "meeting_booked",
  "deal_closed",
] as const;

export type OutcomeType = (typeof OUTCOME_TYPES)[number];

export const OUTCOME_LABELS: Record<OutcomeType, string> = {
  gig_booked: "gig booked",
  subscriber_acquired: "subscriber",
  stream_revenue: "stream revenue",
  merch_sale: "merch sale",
  lead_qualified: "lead qualified",
  meeting_booked: "meeting booked",
  deal_closed: "deal closed",
};
