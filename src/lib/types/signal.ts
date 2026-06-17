// the signal layer's type surface ... client-safe (no server imports). the
// gojiberry-beater: persistent agents detect a buying/intent moment, score it, a
// trigger predicate matches, and the 5-angle drafter fires on the signal payload
// itself (the signal IS the message). see docs/06-signals-spec.md.

// the full taxonomy. baked into the gc_signal_agents CHECK constraint so widening
// it never costs a migration. v1 builds the creator-intent core + the founder
// lane; the rest are enum-valid, actor-pending.
export const SIGNAL_TYPES = [
  // creator-intent core (v1 ... the wedge)
  "searching_for",
  "tool_mention",
  "product_launch",
  // founder lane (v1 ... selling into companies)
  "promotion",
  "funding_round",
  // relational + the rest (enum-valid, actor-pending)
  "engaged_with_content",
  "mentioned_you",
  "competitor_follow",
  "competitor_switch",
  "hiring",
  "role_change",
  "content_post",
  "company_news",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

// short, lowercase, in-voice labels for the feed + the copilot.
export const SIGNAL_LABELS: Record<SignalType, string> = {
  searching_for: "searching for a tool",
  tool_mention: "named a competitor",
  product_launch: "just launched",
  promotion: "got promoted",
  funding_round: "raised a round",
  engaged_with_content: "engaged with your content",
  mentioned_you: "mentioned you",
  competitor_follow: "followed a competitor",
  competitor_switch: "left a competitor",
  hiring: "hiring",
  role_change: "changed roles",
  content_post: "posted",
  company_news: "company news",
};

// dismissal reasons ... matches the gc_signal_dismissals CHECK constraint. the
// typed reason feeds the weekly refinement loop. client-safe.
export const DISMISS_REASONS = [
  "wrong_industry",
  "wrong_role",
  "wrong_timing",
  "already_contacted",
  "low_quality_data",
  "not_a_fit",
  "other",
] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number];

export const DISMISS_REASON_LABELS: Record<DismissReason, string> = {
  wrong_industry: "wrong industry",
  wrong_role: "wrong role",
  wrong_timing: "wrong timing",
  already_contacted: "already contacted",
  low_quality_data: "low quality data",
  not_a_fit: "not a fit",
  other: "other",
};

// build a one-line personalization hook from a signal payload ... the moment the
// drafter opens on (the signal IS the message). pure + client-safe so the feed
// card + the draft bridge share one source of truth.
export function hookFromHit(
  signalType: SignalType,
  raw: Record<string, unknown>,
): string {
  const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  switch (signalType) {
    case "searching_for":
      return `posted looking for ${s(raw.matched_need) || "a tool like yours"}`;
    case "tool_mention":
      return `mentioned ${s(raw.mentioned_tool) || "a competitor"} in a post`;
    case "product_launch":
      return `just launched ${s(raw.product_name) || "a new product"}`;
    case "promotion":
      return `just stepped into ${s(raw.new_title) || "a new role"}${s(raw.company) ? ` at ${s(raw.company)}` : ""}`;
    case "funding_round":
      return `just raised ${s(raw.round_type) || "a round"}${s(raw.company) ? ` at ${s(raw.company)}` : ""}`;
    default:
      return SIGNAL_LABELS[signalType];
  }
}

// a normalized signal hit ... the shape after an apify dataset row is mapped to
// the per-type contract. raw carries the type-specific payload the drafter reads.
export type SignalHit = {
  signalType: SignalType;
  raw: Record<string, unknown>;
  aiScore?: number | null;
  detectedAt: string; // iso8601
};

// the trigger predicate (gc_triggers.condition jsonb). jsonb forever, no string
// dsl. implicit AND across the top-level keys; `not` is a recursive negation.
export type TriggerCondition = {
  signal_type?: SignalType;
  score_gte?: number;
  detected_within_hours?: number;
  // path matchers against the normalized hit payload: `<field>_in`,
  // `<field>_includes_any`, `<field>_includes_all`, or `<field>` for exact.
  raw?: Record<string, unknown>;
  // matchers against the matched contact.
  contact?: { stage_in?: string[]; stage_not_in?: string[] };
  not?: TriggerCondition;
};

// the contact slice the evaluator + cooldown read.
export type TriggerContact = {
  stage?: string | null;
};
