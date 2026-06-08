"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { resolveFootprint, type Footprint } from "@/lib/enrichment/footprint";
import { saveContactFootprint } from "@/lib/supabase/footprint";

export type FootprintResult =
  | { ok: true; footprint: Footprint }
  | { ok: false; error: string };

const Input = z.object({ contactId: z.string().uuid() });

// resolve one contact's public footprint on demand: load the contact, resolve
// from gravatar + github (free, public, official apis ... no cost gate), and
// store the link graph back on the contact. only the contact id is trusted from
// the client; rls + the loaded row are the source of truth.
export async function resolveFootprintAction(
  rawInput: unknown,
): Promise<FootprintResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false, error: "sign in to resolve a footprint ..." };
  }

  const parsed = Input.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "that contact didn't look right ... refresh and try again.",
    };
  }

  try {
    const { data: row, error } = await supabase
      .from("gc_contacts")
      .select("id, email, enrichment_data")
      .eq("id", parsed.data.contactId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      return { ok: false, error: "couldn't find that contact ..." };
    }

    const c = row as {
      id: string;
      email: string | null;
      enrichment_data: Record<string, unknown> | null;
    };
    if (!c.email) {
      return {
        ok: false,
        error:
          "that contact has no email yet ... a footprint resolves from the email, so find or add one first.",
      };
    }

    // reuse a github handle from a prior footprint if there is one, so a re-run
    // still resolves github even when gravatar drops the link.
    const priorFootprint = (c.enrichment_data?.footprint ?? null) as Footprint | null;
    const priorGithub = priorFootprint?.links?.find(
      (l) => l.platform === "github",
    )?.handle;

    const footprint = await resolveFootprint({
      email: c.email,
      githubUsername: priorGithub ?? null,
    });

    if (footprint.sources.length === 0) {
      return {
        ok: false,
        error:
          "no public footprint for that email ... they may not have a gravatar or a public github. that's normal, plenty of people don't.",
      };
    }

    await saveContactFootprint({ contactId: c.id, footprint });
    return { ok: true, footprint };
  } catch (err) {
    console.error("[footprint] resolve failed", err);
    return {
      ok: false,
      error: "footprint resolve didn't land ... give it another shot in a moment.",
    };
  }
}
