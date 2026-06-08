import { createClient } from "@/lib/supabase/server";
import type { Footprint } from "@/lib/enrichment/footprint";

// the only writer of gc_contacts.enrichment_data.footprint. reads the existing
// jsonb and merge-preserves it (hook, signals, etc), so resolving a footprint
// never clobbers a prior enrichment. rls scopes the write to the owner ... the
// session client only ever touches the caller's own rows.
export async function saveContactFootprint(args: {
  contactId: string;
  footprint: Footprint;
}): Promise<void> {
  const { contactId, footprint } = args;
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("gc_contacts")
    .select("enrichment_data")
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

  const enrichment_data: Record<string, unknown> = {
    ...prior,
    footprint,
    footprint_resolved_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("gc_contacts")
    .update({ enrichment_data })
    .eq("id", contactId);
  if (error) {
    throw new Error(`could not save footprint ... ${error.message}`);
  }
}
