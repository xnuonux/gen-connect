// the enrichment waterfall ... two paths, two cost ceilings (product spec).
// path A: single lead, hot, on-demand, $0.30 ceiling. path B: bulk ICP
// discovery, async on the railway worker, $0.01 ceiling.

// matches the gc_enrichment_traces.source check constraint.
export const ENRICHMENT_SOURCES = [
  "perplexity_sonar",
  "crawl4ai",
  "apify_linkedin",
  "apollo",
  "apify_leads_finder",
  "email_verifier",
  "manual",
] as const;

export type EnrichmentSource = (typeof ENRICHMENT_SOURCES)[number];

export type EnrichmentPath = "path_a" | "path_b";

export type EnrichmentStatus = "ok" | "skipped" | "error" | "needs_manual";

// the normalized fields any provider can contribute. all optional ... a
// provider fills what it found, the orchestrator merges fill-missing.
export type EnrichedFields = {
  name?: string;
  email?: string;
  linkedin_url?: string;
  title?: string;
  company_name?: string;
  company_domain?: string;
  industry?: string;
  location?: string;
  // the one personalization hook ... this is what the drafter reads from
  // gc_contacts.enrichment_data.hook.
  hook?: string;
  // recent activity / talking points the drafter can lean on.
  signals?: string[];
  // email verification (neverbounce): "valid" | "invalid" | "catchall" |
  // "disposable" | "unknown". email_verified is true only on "valid".
  email_status?: string;
  email_verified?: boolean;
};

// one provider's contribution to the waterfall.
export type ProviderResult = {
  source: EnrichmentSource;
  status: EnrichmentStatus;
  costCents: number;
  fields: EnrichedFields;
  // why a provider skipped (not_configured) or errored. surfaced in the trace.
  reason?: string;
  // a trimmed raw payload stored on the trace for audit. never the whole blob.
  raw?: unknown;
};

// the full result of a waterfall run for one contact.
export type EnrichmentRun = {
  path: EnrichmentPath;
  fields: EnrichedFields;
  totalCostCents: number;
  results: ProviderResult[];
  // true when the required-for-drafting fields were not all found within the
  // ceiling ... the contact is flagged for a human to finish.
  needsManual: boolean;
};

// the two ceilings, in cents (product spec: $0.30 and $0.01).
export const PATH_A_CEILING_CENTS = 30;
export const PATH_B_CEILING_CENTS = 1;

// rough per-call cost in cents, from the product spec waterfall. used to gate
// the next provider against the remaining budget BEFORE spending it.
export const PROVIDER_COST_CENTS: Record<EnrichmentSource, number> = {
  perplexity_sonar: 0.5,
  crawl4ai: 1,
  apify_linkedin: 5,
  apollo: 5,
  apify_leads_finder: 0.15,
  email_verifier: 0.4,
  manual: 0,
};

// path A provider order: cheap context first, the apify leads finder (apollo
// backed, returns emails) as the email source, apollo's own match as the
// fallback. the email_verifier (neverbounce) runs as a post-step in the
// orchestrator, not in this fill-fields order ... it verifies, it does not
// fill the required set.
export const PATH_A_ORDER: EnrichmentSource[] = [
  "perplexity_sonar",
  "crawl4ai",
  "apify_leads_finder",
  "apollo",
];
