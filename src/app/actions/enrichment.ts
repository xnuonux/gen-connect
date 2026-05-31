"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { runPathA } from "@/lib/enrichment/orchestrator";
import {
  applyEnrichmentToContact,
  writeTraces,
} from "@/lib/supabase/enrichment";
import type { EnrichmentRun } from "@/lib/types/enrichment";

export type EnrichResult =
  | { ok: true; run: EnrichmentRun }
  | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

const Input = z.object({ contactId: z.string().uuid() });

// run path A enrichment for one contact on demand: load the contact, run the
// waterfall, log a trace per provider, merge the result onto the contact.
// only the contact id is trusted from the client ... RLS + the loaded row
// are the source of truth.
export async function enrichContactAction(
  rawInput: unknown,
): Promise<EnrichResult> {
  const user = await requireUser();
  if (!user) {
    return { ok: false, error: "sign in to enrich ..." };
  }

  const parsed = Input.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "that contact didn't look right ... refresh and try again.",
    };
  }

  try {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("gc_contacts")
      .select(
        "id, name, title, email, linkedin_url, company:gc_companies(name, domain)",
      )
      .eq("id", parsed.data.contactId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) {
      return { ok: false, error: "couldn't find that contact ..." };
    }

    const c = row as unknown as {
      id: string;
      name: string | null;
      title: string | null;
      email: string | null;
      linkedin_url: string | null;
      company: { name: string | null; domain: string | null } | null;
    };

    const run = await runPathA({
      name: c.name,
      title: c.title,
      email: c.email,
      linkedin_url: c.linkedin_url,
      company_name: c.company?.name ?? null,
      company_domain: c.company?.domain ?? null,
    });

    await writeTraces(user.id, c.id, "path_a", run.results);
    await applyEnrichmentToContact({ userId: user.id, contactId: c.id, run });

    return { ok: true, run };
  } catch (err) {
    console.error("[enrich] path A failed", err);
    return {
      ok: false,
      error: "enrichment didn't land ... give it another shot in a moment.",
    };
  }
}
