"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getVoiceProfile } from "@/lib/supabase/voice";
import { updateContactStage } from "@/lib/supabase/contacts";
import {
  createDraftFromGeneration,
  getLatestDraftForContact,
  setUserOverride,
  type DraftRecord,
} from "@/lib/supabase/drafts";
import { generateFiveAngles } from "@/lib/ai/drafting";
import { judgeAngles } from "@/lib/ai/judge";
import {
  DRAFT_GENERATION_MODEL,
  DRAFT_JUDGE_MODEL,
  type DraftContact,
} from "@/lib/types/draft";

export type GenerateDraftResult =
  | { ok: true; draft: DraftRecord }
  | { ok: false; error: string };

export type OverrideResult = { ok: true } | { ok: false; error: string };

// rough per-set cost: ~$0.08 opus 5-angle gen + ~$0.03 opus self-judge.
// tracked properly via usage_events in a later chunk; this is the estimate
// stored on the draft for now.
const ESTIMATED_COST_CENTS = 11;

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

// extract a personalization hook from a contact's enrichment_data jsonb.
// first usable string wins; null means the generator leans on title/company.
function extractHook(enrichment: unknown): string | null {
  if (!enrichment || typeof enrichment !== "object") return null;
  const e = enrichment as Record<string, unknown>;
  for (const key of ["hook", "personalization_hook", "recent_activity", "summary"]) {
    const v = e[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

const GenerateInput = z.object({ contactId: z.string().uuid() });

// run the full closer-instinct loop for one contact: load contact + voice
// profile, generate 5 angles (opus 4.7), self-judge (opus 4.7), persist, and
// move the contact to 'drafted'. nothing about the contact's data is trusted
// from the client beyond the id ... RLS + the loaded row are the source.
export async function generateDraftAction(
  rawInput: unknown,
): Promise<GenerateDraftResult> {
  const user = await requireUser();
  if (!user) {
    return { ok: false, error: "sign in to draft ..." };
  }

  const parsed = GenerateInput.safeParse(rawInput);
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

    const contact: DraftContact = {
      id: c.id,
      name: c.name,
      title: c.title,
      email: c.email,
      linkedin_url: c.linkedin_url,
      company_name: c.company?.name ?? null,
      company_domain: c.company?.domain ?? null,
      enrichment_hook: extractHook(c.enrichment_data),
    };

    const voiceProfile = await getVoiceProfile();
    const angles = await generateFiveAngles({ contact, voiceProfile });
    const judged = await judgeAngles({ angles, voiceProfile });

    const draft = await createDraftFromGeneration({
      userId: user.id,
      contactId: contact.id,
      objective: null,
      angles,
      judged,
      generationModel: DRAFT_GENERATION_MODEL,
      judgeModel: DRAFT_JUDGE_MODEL,
      costCents: ESTIMATED_COST_CENTS,
    });

    // best-effort stage move ... a draft that saved should not fail because
    // the contact was already past 'drafted'.
    try {
      await updateContactStage(contact.id, "drafted");
    } catch (stageError) {
      console.error("[draft] stage move failed", stageError);
    }

    return { ok: true, draft };
  } catch (err) {
    console.error("[draft] generation failed", err);
    return {
      ok: false,
      error: "the draft didn't land ... give it another shot in a moment.",
    };
  }
}

const OverrideInput = z.object({
  draftId: z.string().uuid(),
  angleId: z.string().uuid(),
});

// record the user picking an angle other than the judge's winner.
export async function overrideAngleAction(
  rawInput: unknown,
): Promise<OverrideResult> {
  const user = await requireUser();
  if (!user) {
    return { ok: false, error: "sign in first ..." };
  }

  const parsed = OverrideInput.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "that pick didn't look right ... try again." };
  }

  try {
    await setUserOverride(parsed.data.draftId, parsed.data.angleId);
    return { ok: true };
  } catch (err) {
    console.error("[draft] override failed", err);
    return { ok: false, error: "couldn't save your pick ... try again." };
  }
}

// read the latest draft for a contact (used by the draft studio page loader).
export async function latestDraftForContact(
  contactId: string,
): Promise<DraftRecord | null> {
  const user = await requireUser();
  if (!user) return null;
  return getLatestDraftForContact(contactId);
}
