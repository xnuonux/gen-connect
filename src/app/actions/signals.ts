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
  getAgent,
  insertHit,
  touchAgentRan,
  type SignalAgent,
  type SignalHitRow,
  type AgentStatus,
} from "@/lib/supabase/signals";
import { searchXSignals, searchRedditSignals } from "@/lib/signals/ingest";
import { scoreSignalHit } from "@/lib/signals/score";
import { evaluateTrigger } from "@/lib/triggers/evaluate";
import { reserveCost, TOOL_COST_CENTS } from "@/lib/ai/gen-guard";
import { getUserTier } from "@/lib/supabase/entitlements";
import { generateDraftAction } from "@/app/actions/drafts";
import {
  listActiveSignalTriggers,
  incrementTriggerFire,
} from "@/lib/supabase/triggers";
import {
  SIGNAL_TYPES,
  DISMISS_REASONS,
  hookFromHit,
  type SignalType,
} from "@/lib/types/signal";

type Db = Awaited<ReturnType<typeof createClient>>;

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

// ---- run an agent now (live X ingestion) -----------------------------------

const RunNowInput = z.object({
  agentId: z.string().uuid(),
  query: z.string().max(300).optional(),
});

export type RunAgentResult =
  | {
      ok: true;
      found: number;
      inserted: number;
      fired: number;
      drafted: number;
      query: string;
    }
  | { ok: false; error: string };

// pull live X hits for an agent through the key pool, score each (deepseek-flash,
// flame-floor fallback), insert (deduped on source_id). the realtime feed lights
// up as the rows land. manual trigger for v1; the cron + apify webhook reuse this
// same path later.
export async function runAgentNowAction(raw: unknown): Promise<RunAgentResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in to run an agent ..." };

  const parsed = RunNowInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "that agent didn't look right ... refresh." };
  }

  try {
    const agent = await getAgent(parsed.data.agentId);
    if (!agent) return { ok: false, error: "couldn't find that agent ..." };

    // run-now is live only for the x-native intent signals; promotion/funding
    // get their own actors next, so don't run the X actor for them (it would
    // mint mislabeled, empty-title hits).
    const X_NATIVE = ["searching_for", "tool_mention", "product_launch"];
    if (!X_NATIVE.includes(agent.signalType)) {
      return {
        ok: false,
        error:
          "run-now is live for the x-intent signals (searching for, tool mention, launch) right now ... per-type actors land next.",
      };
    }

    // a 60s cooldown stops the button (and two tabs) from hammering the shared
    // apify pool + scoring budget.
    if (agent.lastRanAt) {
      const sinceMs = Date.now() - new Date(agent.lastRanAt).getTime();
      if (sinceMs >= 0 && sinceMs < 60_000) {
        return {
          ok: false,
          error: "just ran ... give it a minute before the next pull.",
        };
      }
    }

    // paid-gate the live spend (apify search + scoring), atomically reserved
    // against today's ceiling ... the same gate every money-costing tool uses.
    const tier = await getUserTier(user.id);
    const gate = await reserveCost(
      tier,
      "signal_run",
      TOOL_COST_CENTS.signal_run,
      1,
    );
    if (gate) return { ok: false, error: gate.message };

    const nowIso = new Date().toISOString();
    // pull X + reddit in parallel; each is best-effort (one source can fail
    // without sinking the run). merge + dedupe on source_id.
    const [xRes, rdRes] = await Promise.all([
      searchXSignals({
        signalType: agent.signalType,
        icp: agent.icp,
        query: parsed.data.query,
        max: 20,
        nowIso,
      }),
      searchRedditSignals({
        signalType: agent.signalType,
        icp: agent.icp,
        query: parsed.data.query,
        max: 15,
        nowIso,
      }),
    ]);
    const query = xRes.query;
    const seenSrc = new Set<string>();
    const raws: Record<string, unknown>[] = [];
    for (const r of [...xRes.raws, ...rdRes.raws]) {
      const sid = typeof r.source_id === "string" ? r.source_id : "";
      if (!sid || seenSrc.has(sid)) continue;
      seenSrc.add(sid);
      raws.push(r);
    }
    if (raws.length === 0 && xRes.error && rdRes.error) {
      return { ok: false, error: `apify ... ${xRes.error}` };
    }

    // score in parallel (the slow part); a model outage falls to the flame floor
    // per hit, so this never strands.
    const scored = await Promise.all(
      raws.map(async (r) => ({
        r,
        s: await scoreSignalHit({
          signalType: agent.signalType,
          raw: r,
          icp: agent.icp,
        }),
      })),
    );

    let inserted = 0;
    const fresh: Array<{
      hitId: string;
      r: Record<string, unknown>;
      score: number;
    }> = [];
    for (const { r, s } of scored) {
      const id = await insertHit({
        agentId: agent.id,
        signalType: agent.signalType,
        raw: r,
        aiScore: s.score,
        aiRationale: `${s.rationale} [${s.scoredBy}]`,
        detectedAt: typeof r.detected_at === "string" ? r.detected_at : nowIso,
      });
      // a null id = deduped (already seen); only fresh hits are fire candidates.
      if (id) {
        inserted += 1;
        fresh.push({ hitId: id, r, score: s.score });
      }
    }

    // auto-fire ... the live half of the rules engine (un-orphans evaluateTrigger
    // beyond the dry run). each fresh hit is evaluated against the user's ACTIVE
    // signal triggers; the first match atomically claims the hit + pulls it into
    // the pipeline as a sourced contact (provenance: source_signal_id +
    // source_trigger_id) + bumps the trigger. then ONE auto-draft, bounded +
    // gated (below): the single strongest fired hit, only when score > 0.7 AND
    // the user is paid AND the cost reserve passes ... so the wedge goes fully
    // autonomous ("the signal IS the message") with no latency or runaway spend.
    let fired = 0;
    let drafted = 0;
    let topFired: { cid: string; score: number } | null = null;
    const triggers = await listActiveSignalTriggers();
    if (triggers.length > 0 && fresh.length > 0) {
      const objective = await getAgentObjective(agent.id);
      const supabase = await createClient();
      const fireNow = Date.now();
      for (const f of fresh) {
        const match = triggers.find((t) =>
          evaluateTrigger(
            t.condition,
            {
              signalType: agent.signalType,
              raw: f.r,
              aiScore: f.score,
              detectedAt:
                typeof f.r.detected_at === "string" ? f.r.detected_at : nowIso,
            },
            null,
            fireNow,
          ),
        );
        if (!match) continue;
        const claim = await claimHitForDraft(f.hitId);
        if (!claim.claimed || !claim.hit) continue;
        try {
          const cid = await createSourcedContact(
            supabase,
            user.id,
            claim.hit,
            objective,
            match.id,
          );
          if (!cid) {
            await revertHitClaim(f.hitId);
            continue;
          }
          await linkHitContact(f.hitId, cid);
          await incrementTriggerFire(match.id);
          fired += 1;
          if (!topFired || f.score > topFired.score) {
            topFired = { cid, score: f.score };
          }
        } catch (e) {
          // any mid-sequence db error reverts the claim, so the hit re-surfaces
          // in the feed instead of stranding 'actioned' with an unlinked contact.
          await revertHitClaim(f.hitId).catch(() => {});
          console.error("[signals] auto-fire hit failed", e);
        }
      }

      // ONE bounded auto-draft of the strongest fired hit (gated). reuses the
      // 5-angle engine through the cost reserve, so it cannot run away on spend
      // or latency ... at most one generation per run. score > 0.7 keeps it to
      // genuinely hot signals; paid-tier + the reserve cap the cost.
      if (topFired && topFired.score > 0.7 && tier === "paid") {
        const draftGate = await reserveCost(
          tier,
          "draft_angles",
          TOOL_COST_CENTS.draft_angles,
          1,
        );
        if (!draftGate) {
          try {
            const dr = await generateDraftAction({ contactId: topFired.cid });
            if (dr.ok) drafted = 1;
          } catch (e) {
            console.error("[signals] auto-draft failed", e);
          }
        }
      }
    }

    await touchAgentRan(agent.id);
    revalidatePath("/signals");
    revalidatePath("/pipeline");
    return { ok: true, found: raws.length, inserted, fired, drafted, query };
  } catch (err) {
    console.error("[signals] run agent failed", err);
    return { ok: false, error: "couldn't run that agent ... try again." };
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

// insert a signal-sourced contact with provenance (source_signal_id, + the
// source_trigger_id when auto-fired) + the hook + agent objective folded into
// enrichment_data. shared by the manual draft bridge + the auto-fire path.
async function createSourcedContact(
  supabase: Db,
  userId: string,
  hit: { id: string; signalType: SignalType; raw: Record<string, unknown> },
  objective: Record<string, unknown>,
  triggerId: string | null,
): Promise<string | null> {
  const r = hit.raw;
  const hook = hookFromHit(hit.signalType, r);
  const row: Record<string, unknown> = {
    user_id: userId,
    name: nameFromHit(r),
    title: str(r.new_title) || str(r.title) || null,
    email: str(r.email) || null,
    linkedin_url: str(r.author_profile_url) || str(r.profile_url) || null,
    stage: "cold",
    source: "signal",
    source_signal_id: hit.id,
    enrichment_data: { ...r, hook, signal_type: hit.signalType, objective },
  };
  if (triggerId) row.source_trigger_id = triggerId;
  const { data, error } = await supabase
    .from("gc_contacts")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id as string;
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
    const contactId = await createSourcedContact(
      supabase,
      user.id,
      hit,
      objective,
      null,
    );
    if (!contactId) {
      // let a retry re-claim cleanly rather than stranding an actioned hit.
      await revertHitClaim(hit.id);
      throw new Error("contact insert failed");
    }
    await linkHitContact(hit.id, contactId);
    revalidatePath("/signals");
    revalidatePath("/pipeline");
    return { ok: true, contactId };
  } catch (err) {
    console.error("[signals] draft from hit failed", err);
    return { ok: false, error: "couldn't draft from that signal ... try again." };
  }
}
