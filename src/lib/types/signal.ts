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
