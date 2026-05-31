import {
  PROVIDER_COST_CENTS,
  type EnrichedFields,
  type EnrichmentSource,
} from "@/lib/types/enrichment";

// the pure planning core of the waterfall. no IO, no providers ... just the
// merge rule, the required-fields gate, and the budget gate. this is the
// piece worth getting exactly right, so it stays testable in isolation.

const filled = (s?: string): boolean => !!(s && s.trim().length > 0);

// fill-missing merge ... an earlier provider's value is never overwritten by a
// later one. first non-empty wins, field by field (type-safe, no dynamic
// keys). signals concatenate-dedupe so talking points accumulate.
export function mergeFields(a: EnrichedFields, b: EnrichedFields): EnrichedFields {
  const pick = (x?: string, y?: string): string | undefined =>
    filled(x) ? x : filled(y) ? y : undefined;

  const signals = Array.from(
    new Set([...(a.signals ?? []), ...(b.signals ?? [])].filter(filled)),
  );

  return {
    name: pick(a.name, b.name),
    email: pick(a.email, b.email),
    linkedin_url: pick(a.linkedin_url, b.linkedin_url),
    title: pick(a.title, b.title),
    company_name: pick(a.company_name, b.company_name),
    company_domain: pick(a.company_domain, b.company_domain),
    industry: pick(a.industry, b.industry),
    location: pick(a.location, b.location),
    hook: pick(a.hook, b.hook),
    signals: signals.length ? signals : undefined,
    // verification comes from the post-step verifier (b) ... its read wins.
    email_status: pick(b.email_status, a.email_status),
    email_verified: b.email_verified ?? a.email_verified,
  };
}

// the data points required before drafting fires (product spec): name, email
// OR linkedin, company, title, and one personalization hook. once these hold,
// the waterfall can stop early ... no reason to spend the rest of the ceiling.
export function hasDraftReadyFields(f: EnrichedFields): boolean {
  return (
    filled(f.name) &&
    (filled(f.email) || filled(f.linkedin_url)) &&
    filled(f.company_name) &&
    filled(f.title) &&
    filled(f.hook)
  );
}

// would running this provider stay within the ceiling? gate BEFORE spending.
export function affords(
  spentCents: number,
  source: EnrichmentSource,
  ceilingCents: number,
): boolean {
  return spentCents + (PROVIDER_COST_CENTS[source] ?? 0) <= ceilingCents;
}

// the next provider to run, or null to stop. stops when the required fields
// are already satisfied, or when no remaining provider fits the budget.
export function planNext(
  order: EnrichmentSource[],
  alreadyRun: ReadonlySet<EnrichmentSource>,
  spentCents: number,
  ceilingCents: number,
  current: EnrichedFields,
): EnrichmentSource | null {
  if (hasDraftReadyFields(current)) return null;
  for (const source of order) {
    if (alreadyRun.has(source)) continue;
    if (affords(spentCents, source, ceilingCents)) return source;
  }
  return null;
}
