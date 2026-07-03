"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getVoiceProfile } from "@/lib/supabase/voice";
import { updateContactStage } from "@/lib/supabase/contacts";
import {
  createDraftFromGeneration,
  getLatestDraftForContact,
  setUserOverride,
  claimDraftForSend,
  releaseDraftClaim,
  type DraftRecord,
} from "@/lib/supabase/drafts";
import { guardedSend } from "@/lib/email/guarded-send";
import { generateFiveAngles, type DraftObjective } from "@/lib/ai/drafting";
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

// a signal-sourced contact carries its agent's objective (the wizard goal step)
// in enrichment_data.objective ... the 5-angle anchor. pull it so the drafter
// writes toward the real ask, not a guess. returns null for a manual contact.
function extractObjective(enrichment: unknown): DraftObjective | null {
  if (!enrichment || typeof enrichment !== "object") return null;
  const o = (enrichment as Record<string, unknown>).objective;
  if (!o || typeof o !== "object") return null;
  const obj = o as Record<string, unknown>;
  const goal = typeof obj.goal === "string" && obj.goal.trim() ? obj.goal.trim() : null;
  const tone = typeof obj.tone === "string" && obj.tone.trim() ? obj.tone.trim() : null;
  const pains = Array.isArray(obj.pain_points)
    ? (obj.pain_points as unknown[]).filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0,
      )
    : null;
  if (!goal && !(pains && pains.length)) return null;
  return { goal, pain_points: pains, tone };
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
    const objective = extractObjective(c.enrichment_data);
    const angles = await generateFiveAngles({ contact, voiceProfile, objective });
    const judged = await judgeAngles({ angles, voiceProfile });

    const draft = await createDraftFromGeneration({
      userId: user.id,
      contactId: contact.id,
      objective,
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

const SendFirstTouchInput = z.object({ contactId: z.string().uuid() });

export type SendFirstTouchResult =
  | { ok: true; mode: "test" | "live"; deliveredTo: string }
  | { ok: false; error: string };

// close the draft->send fork: send the picked angle as a cold first-touch, right
// from the studio. resolves the winning (or user-overridden) angle's subject+body
// from the persisted draft, then routes through guardedSend ... the SAME compliant,
// test-mode-safe path the unibox reply + the gen copilot use (suppression gate,
// jurisdiction gate, rfc-8058 headers, can-spam footer, unibox + ledger logging).
// nothing but the contact id is trusted from the client. a real send never leaves
// here un-gated ... the presend verdict rendered in the studio decides whether the
// button is live; guardedSend re-checks the gates server-side regardless.
export async function sendFirstTouchAction(
  raw: unknown,
): Promise<SendFirstTouchResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in to send ..." };

  const parsed = SendFirstTouchInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "that contact didn't look right ..." };
  }

  try {
    const supabase = await createClient();
    const { data: row } = await supabase
      .from("gc_contacts")
      .select("id, email")
      .eq("id", parsed.data.contactId)
      .maybeSingle();
    const email = (row as { email: string | null } | null)?.email ?? null;
    if (!email) {
      return {
        ok: false,
        error: "no email on this contact ... enrich or add one before sending.",
      };
    }

    const draft = await getLatestDraftForContact(parsed.data.contactId);
    if (!draft) {
      return { ok: false, error: "draft the five angles first ... nothing to send yet." };
    }
    // already gone out? the persisted 'sent' status is the durable lock (the
    // studio's button-lock is only client state and resets on reload).
    if (draft.status === "sent") {
      return {
        ok: false,
        error: "this draft already went out ... it's in the unibox now.",
      };
    }

    const angleId = draft.user_override_angle_id ?? draft.winning_angle_id;
    const angle =
      draft.angles.find((a) => a.id === angleId) ?? draft.angles[0] ?? null;
    if (!angle) {
      return { ok: false, error: "pick an angle first ... choose the one to send." };
    }

    // claim BEFORE dispatch (compare-and-set judged->sent). if we lose the cas, a
    // concurrent send already took it ... refuse rather than double-send. this is the
    // real idempotency guarantee; the button-lock is just the fast-path ux.
    const claimed = await claimDraftForSend(draft.id);
    if (!claimed) {
      return {
        ok: false,
        error: "this draft already went out ... it's in the unibox now.",
      };
    }

    let result;
    try {
      result = await guardedSend({
        userId: user.id,
        contactId: parsed.data.contactId,
        to: email,
        subject: angle.subject,
        body: angle.body,
        kind: "cold",
      });
    } catch (sendErr) {
      // the dispatch may have gone out before this threw ... keep the claim (no
      // retry) so we never risk a second copy. the user checks the unibox.
      console.error("[draft] send threw after claim", sendErr);
      return {
        ok: false,
        error: "couldn't confirm that send ... check the unibox before resending.",
      };
    }
    if (!result.sent) {
      // cleanly gated before any dispatch ... safe to release for a retry.
      await releaseDraftClaim(draft.id);
      return {
        ok: false,
        error:
          result.error ??
          (result.suppressed
            ? "that address is on your suppression list ... skipped."
            : "that send was blocked ... check the pre-send verdict."),
      };
    }

    // sent ... the cold first-touch is in flight, so move drafted -> sequenced
    // (the active-outreach bucket). best-effort; a saved send never fails on this.
    try {
      await updateContactStage(parsed.data.contactId, "sequenced");
    } catch (stageError) {
      console.error("[draft] post-send stage move failed", stageError);
    }

    return { ok: true, mode: result.mode, deliveredTo: result.deliveredTo };
  } catch (err) {
    console.error("[draft] send first touch failed", err);
    return { ok: false, error: "couldn't send that ... give it another shot." };
  }
}
