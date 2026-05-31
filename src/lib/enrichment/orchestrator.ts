import { PROVIDERS, type EnrichmentInput } from "@/lib/enrichment/providers";
import {
  hasDraftReadyFields,
  mergeFields,
  planNext,
} from "@/lib/enrichment/waterfall";
import {
  PATH_A_CEILING_CENTS,
  PATH_A_ORDER,
  type EnrichedFields,
  type EnrichmentRun,
  type EnrichmentSource,
  type ProviderResult,
} from "@/lib/types/enrichment";

// path A: the hot, single-lead, on-demand waterfall. cheap context first,
// stop the moment the required-for-drafting fields are satisfied OR the next
// provider would breach the $0.30 ceiling. every accumulated field feeds the
// next provider's input (perplexity may surface a company that crawl4ai then
// scrapes). pure planning lives in waterfall.ts; this is the runner.
export async function runPathA(input: EnrichmentInput): Promise<EnrichmentRun> {
  let fields: EnrichedFields = {
    name: input.name ?? undefined,
    email: input.email ?? undefined,
    linkedin_url: input.linkedin_url ?? undefined,
    title: input.title ?? undefined,
    company_name: input.company_name ?? undefined,
    company_domain: input.company_domain ?? undefined,
  };

  const run = new Set<EnrichmentSource>();
  const results: ProviderResult[] = [];
  let spentCents = 0;

  for (;;) {
    const next = planNext(
      PATH_A_ORDER,
      run,
      spentCents,
      PATH_A_CEILING_CENTS,
      fields,
    );
    if (!next) break;
    run.add(next);

    const provider = PROVIDERS[next];
    if (!provider) continue;

    const result = await provider.enrich({
      name: fields.name ?? null,
      email: fields.email ?? null,
      linkedin_url: fields.linkedin_url ?? null,
      title: fields.title ?? null,
      company_name: fields.company_name ?? null,
      company_domain: fields.company_domain ?? null,
    });
    results.push(result);
    spentCents += result.costCents;
    if (result.status === "ok") {
      fields = mergeFields(fields, result.fields);
    }
  }

  // post-step: verify a found email before it is trusted ("never send
  // unverified"). this is NOT part of the fill-fields order ... it gates
  // quality rather than satisfying the required set, so planNext (which stops
  // once an email exists) would never schedule it.
  if (fields.email) {
    const verifier = PROVIDERS.email_verifier;
    if (verifier) {
      const vr = await verifier.enrich({
        name: fields.name ?? null,
        email: fields.email ?? null,
        linkedin_url: fields.linkedin_url ?? null,
        title: fields.title ?? null,
        company_name: fields.company_name ?? null,
        company_domain: fields.company_domain ?? null,
      });
      results.push(vr);
      spentCents += vr.costCents;
      if (vr.status === "ok") {
        fields = mergeFields(fields, vr.fields);
      }
    }
  }

  return {
    path: "path_a",
    fields,
    totalCostCents: Number(spentCents.toFixed(4)),
    results,
    needsManual: !hasDraftReadyFields(fields),
  };
}
