import { createClient } from "@/lib/supabase/server";
import type {
  EnrichmentPath,
  EnrichmentRun,
  ProviderResult,
} from "@/lib/types/enrichment";

// gc_enrichment_traces is the append-only audit log (v0_1_2 migration). one
// row per provider call, RLS'd to the caller. this module is the only writer.

// log every provider call from a waterfall run ... ok, skipped, and error
// alike, so the spend + the gaps are both auditable.
export async function writeTraces(
  userId: string,
  contactId: string,
  path: EnrichmentPath,
  results: ProviderResult[],
): Promise<void> {
  if (results.length === 0) return;
  const supabase = await createClient();

  const rows = results.map((r) => ({
    user_id: userId,
    contact_id: contactId,
    source: r.source,
    path,
    status: r.status,
    cost_cents: r.costCents,
    fields_returned: r.fields ?? {},
    raw_payload: (r.raw ?? {}) as Record<string, unknown>,
    error: r.status === "error" ? (r.reason ?? "failed") : null,
  }));

  const { error } = await supabase.from("gc_enrichment_traces").insert(rows);
  if (error) {
    throw new Error(`could not log enrichment ... ${error.message}`);
  }
}

// merge a run's fields into the contact: the hook + signals land in
// enrichment_data (where the drafter's extractHook reads them), email/title
// fill the columns only when empty, and a clean run advances cold -> enriched.
// needs_manual is flagged in enrichment_data, never silently dropped.
export async function applyEnrichmentToContact(args: {
  userId: string;
  contactId: string;
  run: EnrichmentRun;
}): Promise<void> {
  const { contactId, run } = args;
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("gc_contacts")
    .select("email, title, stage, enrichment_data")
    .eq("id", contactId)
    .maybeSingle();

  if (readError) {
    throw new Error(`could not read contact ... ${readError.message}`);
  }
  if (!existing) {
    throw new Error("that contact vanished mid-enrichment ...");
  }

  const prior =
    existing.enrichment_data && typeof existing.enrichment_data === "object"
      ? (existing.enrichment_data as Record<string, unknown>)
      : {};
  const f = run.fields;
  const filled = (v: unknown): boolean =>
    typeof v === "string" && v.trim().length > 0;

  const mergedHook = f.hook ?? prior.hook;
  // flag needs_manual against the MERGED record, not just this run. a no-op
  // re-enrich on an already-enriched contact (providers skip, find nothing)
  // must not regress a prior needs_manual:false back to true ... the hook it
  // already has is preserved, so it is not actually missing data.
  const needsManual = run.needsManual && !filled(mergedHook);

  const enrichmentData: Record<string, unknown> = {
    ...prior,
    hook: mergedHook,
    signals: f.signals ?? prior.signals,
    company_name: f.company_name ?? prior.company_name,
    company_domain: f.company_domain ?? prior.company_domain,
    industry: f.industry ?? prior.industry,
    location: f.location ?? prior.location,
    linkedin_url: f.linkedin_url ?? prior.linkedin_url,
    email_status: f.email_status ?? prior.email_status,
    email_verified: f.email_verified ?? prior.email_verified,
    needs_manual: needsManual,
    last_enriched_at: new Date().toISOString(),
    last_enriched_cost_cents: run.totalCostCents,
    sources: run.results.filter((r) => r.status === "ok").map((r) => r.source),
  };

  const update: Record<string, unknown> = { enrichment_data: enrichmentData };
  if (!existing.email && f.email) update.email = f.email;
  if (!existing.title && f.title) update.title = f.title;
  // a draft-ready enrichment advances the card; a needs_manual one leaves it
  // cold (the spec: flag needs_manual if it comes back cold).
  if (!needsManual && existing.stage === "cold") {
    update.stage = "enriched";
  }

  const { error } = await supabase
    .from("gc_contacts")
    .update(update)
    .eq("id", contactId);

  if (error) {
    throw new Error(`could not save enrichment ... ${error.message}`);
  }
}
