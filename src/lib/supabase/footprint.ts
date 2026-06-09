import { createClient } from "@/lib/supabase/server";
import type { Footprint } from "@/lib/enrichment/footprint";

// the fields a footprint teaches us about the contact (derived by
// footprintToContactFields). all optional ... we only fill the gaps.
export type FootprintFields = {
  name?: string;
  title?: string;
  company_name?: string;
  location?: string;
  hook?: string;
};

// the only writer of gc_contacts.enrichment_data.footprint. two jobs, one write:
//   1. store the resolved link graph under enrichment_data.footprint, merge-
//      preserving the rest of the jsonb (hook, signals, etc).
//   2. backfill the contact from what the footprint taught us ... fill-missing
//      only (name/title columns when empty, company/location/hook into
//      enrichment_data when empty), so a free footprint resolve also makes a bare
//      contact draftable. never overwrites a value the contact already has.
// rls scopes every read + write to the owner.
export async function saveContactFootprint(args: {
  contactId: string;
  footprint: Footprint;
  fields: FootprintFields;
}): Promise<void> {
  const { contactId, footprint, fields } = args;
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("gc_contacts")
    .select("name, title, enrichment_data")
    .eq("id", contactId)
    .maybeSingle();
  if (readError) {
    throw new Error(`could not read contact ... ${readError.message}`);
  }
  if (!existing) {
    throw new Error("that contact vanished mid-resolve ...");
  }

  const prior =
    existing.enrichment_data && typeof existing.enrichment_data === "object"
      ? (existing.enrichment_data as Record<string, unknown>)
      : {};
  const filled = (v: unknown): boolean =>
    typeof v === "string" && v.trim().length > 0;

  const enrichment_data: Record<string, unknown> = {
    ...prior,
    footprint,
    footprint_resolved_at: new Date().toISOString(),
    // fill-missing: a prior hook (e.g. from paid path-A enrichment) always wins.
    hook: filled(prior.hook) ? prior.hook : fields.hook,
    company_name: filled(prior.company_name)
      ? prior.company_name
      : fields.company_name,
    location: filled(prior.location) ? prior.location : fields.location,
  };

  const update: Record<string, unknown> = { enrichment_data };
  if (!filled(existing.name) && filled(fields.name)) update.name = fields.name;
  if (!filled(existing.title) && filled(fields.title))
    update.title = fields.title;

  const { error } = await supabase
    .from("gc_contacts")
    .update(update)
    .eq("id", contactId);
  if (error) {
    throw new Error(`could not save footprint ... ${error.message}`);
  }
}
