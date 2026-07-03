"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { runPathA } from "@/lib/enrichment/orchestrator";
import {
  applyEnrichmentToContact,
  writeTraces,
} from "@/lib/supabase/enrichment";
import {
  resolveFootprint,
  footprintToContactFields,
} from "@/lib/enrichment/footprint";
import { saveContactFootprint } from "@/lib/supabase/footprint";
import type { EnrichmentRun } from "@/lib/types/enrichment";

const FOOTPRINT_TTL_MS = 30 * 86400e3; // re-resolve at most monthly

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
        "id, name, title, email, linkedin_url, enrichment_data, company:gc_companies(name, domain)",
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
      enrichment_data: unknown;
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

    // auto-resolve the public footprint on this hot single-lead path, so the person-
    // graph the drafter + card now read gets populated WITHOUT a separate manual click.
    // TOS-safe: domain is left null so we never crawl the company homepage on an auto
    // pass (that's the explicit "find their presence" button's call) ... only the
    // person's own public profiles (gravatar/github) are touched. cache-first: skip if
    // resolved within the ttl so a re-enrich doesn't re-hit the unauthed providers.
    // best-effort ... a footprint miss never fails enrichment.
    try {
      if (c.email) {
        const ed =
          c.enrichment_data && typeof c.enrichment_data === "object"
            ? (c.enrichment_data as Record<string, unknown>)
            : {};
        const prior = ed.footprint_resolved_at;
        const priorMs = typeof prior === "string" ? new Date(prior).getTime() : 0;
        if (!priorMs || Date.now() - priorMs > FOOTPRINT_TTL_MS) {
          const fp = await resolveFootprint({ email: c.email, domain: null });
          if (fp.links.length > 0 || fp.bio || fp.name) {
            await saveContactFootprint({
              contactId: c.id,
              footprint: fp,
              fields: footprintToContactFields(fp),
            });
          }
        }
      }
    } catch (fpErr) {
      console.error("[enrich] footprint auto-resolve failed", fpErr);
    }

    return { ok: true, run };
  } catch (err) {
    console.error("[enrich] path A failed", err);
    return {
      ok: false,
      error: "enrichment didn't land ... give it another shot in a moment.",
    };
  }
}
