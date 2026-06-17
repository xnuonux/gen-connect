"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  listAgents,
  listHits,
  createAgent,
  setAgentStatus,
  dismissHit,
  claimHitForDraft,
  getAgentObjective,
  linkHitContact,
  revertHitClaim,
  type SignalAgent,
  type SignalHitRow,
  type AgentStatus,
} from "@/lib/supabase/signals";
import {
  SIGNAL_TYPES,
  DISMISS_REASONS,
  hookFromHit,
} from "@/lib/types/signal";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// ---- reads -----------------------------------------------------------------

export async function fetchAgents(): Promise<SignalAgent[]> {
  const user = await requireUser();
  if (!user) return [];
  return listAgents(Date.now());
}

export async function fetchHits(): Promise<SignalHitRow[]> {
  const user = await requireUser();
  if (!user) return [];
  return listHits();
}

// ---- create agent ----------------------------------------------------------

const CreateAgentInput = z.object({
  name: z.string().min(1).max(80),
  signalType: z.enum(SIGNAL_TYPES),
  icp: z.record(z.string(), z.unknown()).default({}),
  objective: z.record(z.string(), z.unknown()).default({}),
  // the precision slider, 0 (discovery/broad) to 100 (high precision/narrow).
  precision: z.number().min(0).max(100),
  maxHitsPerDay: z.number().min(1).max(500).default(30),
});

export type CreateAgentResult =
  | { ok: true; agent: SignalAgent }
  | { ok: false; error: string };

export async function createAgentAction(
  raw: unknown,
): Promise<CreateAgentResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in to run an agent ..." };

  const parsed = CreateAgentInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "that agent didn't look right ... check the fields." };
  }

  try {
    const agent = await createAgent({
      name: parsed.data.name,
      signalType: parsed.data.signalType,
      icp: parsed.data.icp,
      objective: parsed.data.objective,
      ramp: { max_hits_per_day: parsed.data.maxHitsPerDay, soft_cap: parsed.data.maxHitsPerDay * 2 },
      // the slider is the only knob the user sees; it maps to the threshold.
      scoreThreshold: Math.round((parsed.data.precision / 100) * 100) / 100,
    });
    if (!agent) return { ok: false, error: "couldn't create that agent ... try again." };
    revalidatePath("/signals");
    return { ok: true, agent };
  } catch (err) {
    console.error("[signals] create agent failed", err);
    return { ok: false, error: "couldn't create that agent ... try again." };
  }
}

export type AgentStatusResult = { ok: true } | { ok: false; error: string };

export async function setAgentStatusAction(
  agentId: string,
  status: AgentStatus,
): Promise<AgentStatusResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in first ..." };
  const ok = z.string().uuid().safeParse(agentId).success;
  if (!ok) return { ok: false, error: "that agent didn't look right ..." };
  try {
    await setAgentStatus(agentId, status);
    revalidatePath("/signals");
    return { ok: true };
  } catch {
    return { ok: false, error: "couldn't update that agent ... try again." };
  }
}

// ---- dismiss ---------------------------------------------------------------

const DismissInput = z.object({
  hitId: z.string().uuid(),
  reason: z.enum(DISMISS_REASONS),
  notes: z.string().max(500).optional(),
});

export type DismissResult = { ok: true } | { ok: false; error: string };

export async function dismissHitAction(raw: unknown): Promise<DismissResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in first ..." };
  const parsed = DismissInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "that dismissal didn't look right ..." };
  }
  try {
    await dismissHit(parsed.data.hitId, parsed.data.reason, parsed.data.notes ?? null);
    revalidatePath("/signals");
    return { ok: true };
  } catch {
    return { ok: false, error: "couldn't dismiss that ... try again." };
  }
}

// ---- signal -> draft (the wedge: the signal IS the message) ----------------

function nameFromHit(raw: Record<string, unknown>): string | null {
  return (
    str(raw.author_name) ||
    str(raw.maker_name) ||
    str(raw.name) ||
    null
  );
}

const DraftFromHitInput = z.object({ hitId: z.string().uuid() });

export type DraftFromHitResult =
  | { ok: true; contactId: string }
  | { ok: false; error: string };

// pull a hit into the pipeline as a sourced contact (provenance stamped) +
// stage it for drafting. the studio writes the 5 angles; this is the bridge.
export async function draftFromHitAction(
  raw: unknown,
): Promise<DraftFromHitResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in to draft ..." };

  const parsed = DraftFromHitInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "that signal didn't look right ... refresh." };
  }

  try {
    // atomic claim ... only one caller wins, so a double-click never
    // double-creates a contact (the TOCTOU fix). a hit already linked to a
    // contact routes straight back to it instead of inserting again.
    const { claimed, hit } = await claimHitForDraft(parsed.data.hitId);
    if (!hit) return { ok: false, error: "couldn't find that signal ..." };
    if (!claimed && hit.contactId) {
      return { ok: true, contactId: hit.contactId };
    }

    // the originating agent's objective is the 5-angle anchor ... carry it onto
    // the sourced contact so the drafter writes toward the real ask, not a guess.
    const objective = await getAgentObjective(hit.agentId);

    const supabase = await createClient();
    const r = hit.raw;
    const hook = hookFromHit(hit.signalType, r);

    const { data: created, error } = await supabase
      .from("gc_contacts")
      .insert({
        user_id: user.id,
        name: nameFromHit(r),
        title: str(r.new_title) || str(r.title) || null,
        email: str(r.email) || null,
        linkedin_url: str(r.author_profile_url) || str(r.profile_url) || null,
        stage: "cold",
        source: "signal",
        source_signal_id: hit.id,
        enrichment_data: { ...r, hook, signal_type: hit.signalType, objective },
      })
      .select("id")
      .single();

    if (error || !created) {
      // let a retry re-claim cleanly rather than stranding an actioned hit.
      await revertHitClaim(hit.id);
      throw new Error(error?.message ?? "contact insert failed");
    }

    const contactId = created.id as string;
    await linkHitContact(hit.id, contactId);
    revalidatePath("/signals");
    revalidatePath("/pipeline");
    return { ok: true, contactId };
  } catch (err) {
    console.error("[signals] draft from hit failed", err);
    return { ok: false, error: "couldn't draft from that signal ... try again." };
  }
}
