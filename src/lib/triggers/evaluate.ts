import {
  type SignalHit,
  type TriggerCondition,
  type TriggerContact,
} from "@/lib/types/signal";

// the trigger predicate evaluator. a PURE function over { condition, hit,
// contact } returning boolean. the condition is jsonb (no string dsl, ever ...
// jsonb is the one source of truth, editable by a form ui or a raw toggle).
// implicit AND across the top-level keys; `not` is a recursive negation.
// exercised at runtime by the triggers dry-run (testTriggerAction) AND covered by
// fixtures in test/pure.ts (type match, score_gte, _in / _includes_any, not-
// negation, freshness). see docs/06-signals-spec.md "the predicate language".
// `nowMs` is injected so freshness checks are deterministic.

function lc(v: unknown): string {
  return String(v ?? "").toLowerCase();
}

// the `raw` path matchers: `<field>_in` (value in list), `<field>_includes_any`
// (string contains any term), `<field>_includes_all`, or `<field>` for exact.
function matchRaw(
  matchers: Record<string, unknown>,
  raw: Record<string, unknown>,
): boolean {
  for (const [key, expected] of Object.entries(matchers)) {
    const list = Array.isArray(expected) ? expected : [];
    if (key.endsWith("_includes_any")) {
      const field = key.slice(0, -"_includes_any".length);
      const hay = lc(raw[field]);
      if (!list.some((e) => hay.includes(lc(e)))) return false;
    } else if (key.endsWith("_includes_all")) {
      const field = key.slice(0, -"_includes_all".length);
      const hay = lc(raw[field]);
      if (!list.every((e) => hay.includes(lc(e)))) return false;
    } else if (key.endsWith("_in")) {
      const field = key.slice(0, -"_in".length);
      const val = lc(raw[field]);
      if (!list.some((e) => lc(e) === val)) return false;
    } else {
      // exact match on the field
      if (String(raw[key] ?? "") !== String(expected ?? "")) return false;
    }
  }
  return true;
}

function matchContact(
  m: { stage_in?: string[]; stage_not_in?: string[] },
  contact: TriggerContact | null,
): boolean {
  // first-touch auto-fire (+ the dry run) evaluate with no contact yet ... defer
  // contact.* clauses rather than silently failing them. they apply on
  // re-evaluation/enrollment once a contact exists, not at first detection.
  if (!contact) return true;
  const stage = contact?.stage ?? null;
  if (m.stage_in && (!stage || !m.stage_in.includes(stage))) return false;
  if (m.stage_not_in && stage && m.stage_not_in.includes(stage)) return false;
  return true;
}

export function evaluateTrigger(
  condition: TriggerCondition,
  hit: SignalHit,
  contact: TriggerContact | null = null,
  nowMs: number = Date.now(),
): boolean {
  if (condition.signal_type && condition.signal_type !== hit.signalType) {
    return false;
  }

  if (typeof condition.score_gte === "number") {
    const s = typeof hit.aiScore === "number" ? hit.aiScore : 0;
    if (s < condition.score_gte) return false;
  }

  if (typeof condition.detected_within_hours === "number") {
    const t = new Date(hit.detectedAt).getTime();
    const ageHrs = Number.isNaN(t) ? Infinity : (nowMs - t) / 36e5;
    if (ageHrs > condition.detected_within_hours) return false;
  }

  if (condition.raw && !matchRaw(condition.raw, hit.raw)) return false;
  if (condition.contact && !matchContact(condition.contact, contact)) {
    return false;
  }

  // negation: the inner predicate must NOT hold for this one to pass.
  if (condition.not && evaluateTrigger(condition.not, hit, contact, nowMs)) {
    return false;
  }

  return true;
}
