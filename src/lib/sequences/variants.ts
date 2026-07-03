// a/b variant selection for a send node ... pure + testable. the editor authors up to
// a few weighted variant bodies on a send node (data.variants: [{body, weight, subject?}])
// and the validator enforces that weighted variants have a body and the extra weights
// never exceed 100 (the PRIMARY body absorbs the remainder). this picks the arm a given
// contact lands in, deterministically from the contact's seed, so a contact always sees
// the same variant (a real split, not a per-render flicker) and the split is stable
// across ticks + retries. without this the runner would ship only the primary body and
// the authored+validated a/b test would silently never fire.

export type SendChoice = { subject: string; body: string };

type ParsedVariant = { subject: string | null; body: string; weight: number };

function parseVariants(raw: unknown): ParsedVariant[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedVariant[] = [];
  for (const v of raw) {
    const o = (v ?? {}) as Record<string, unknown>;
    const body = typeof o.body === "string" ? o.body : "";
    const weight = typeof o.weight === "number" ? o.weight : 0;
    // only a weighted, non-empty variant is a real arm ... a 0% or empty slot is inert
    // (matches the validator's contract), so it never steals traffic from the primary.
    if (weight > 0 && body.trim().length > 0) {
      out.push({
        subject: typeof o.subject === "string" ? o.subject : null,
        body,
        weight,
      });
    }
  }
  return out;
}

// pick the send arm for `seed` (0-99 roll off the contact seed). the primary holds the
// remainder to 100, so with no real variants it always wins ... a pure passthrough. a
// variant with no subject of its own inherits the primary subject.
export function pickSend(
  primary: SendChoice,
  rawVariants: unknown,
  seed: number,
): SendChoice {
  const variants = parseVariants(rawVariants);
  if (variants.length === 0) return primary;

  const extra = variants.reduce((s, v) => s + v.weight, 0);
  const primaryWeight = Math.max(0, 100 - extra);
  const roll = ((seed % 100) + 100) % 100; // 0-99, stable per contact

  if (roll < primaryWeight) return primary;
  let acc = primaryWeight;
  for (const v of variants) {
    acc += v.weight;
    if (roll < acc) {
      return { subject: v.subject ?? primary.subject, body: v.body };
    }
  }
  return primary; // rounding slack ... fall back to the primary
}
