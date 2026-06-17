import { createClient } from "@/lib/supabase/server";
import { type SignalType } from "@/lib/types/signal";

// the signal layer's db access. all reads + writes go through the session client
// so RLS scopes everything to the signed-in user. the scoring orchestration (the
// haiku call + flame fallback) lives in the action/webhook, not here ... this file
// is pure persistence.

export type AgentStatus = "active" | "paused" | "archived";
export type HitStatus =
  | "pending"
  | "scored"
  | "actioned"
  | "dismissed"
  | "expired"
  | "aged_out";

export type SignalAgent = {
  id: string;
  name: string;
  signalType: SignalType;
  icp: Record<string, unknown>;
  objective: Record<string, unknown>;
  ramp: Record<string, unknown>;
  scoreThreshold: number;
  status: AgentStatus;
  lastRanAt: string | null;
  createdAt: string;
  hitCount7d: number;
};

export type SignalHitRow = {
  id: string;
  agentId: string;
  contactId: string | null;
  signalType: SignalType;
  raw: Record<string, unknown>;
  aiScore: number | null;
  aiRationale: string | null;
  status: HitStatus;
  detectedAt: string;
  draftId: string | null;
};

async function userId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// list the user's agents with a 7-day hit count for the grid. two queries
// (agents, then recent hit agent_ids) ... fine at this volume, RLS-scoped.
export async function listAgents(nowMs: number): Promise<SignalAgent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_signal_agents")
    .select(
      "id, name, signal_type, icp, objective, ramp, score_threshold, status, last_ran_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const agents = (data ?? []) as Array<{
    id: string;
    name: string;
    signal_type: SignalType;
    icp: Record<string, unknown> | null;
    objective: Record<string, unknown> | null;
    ramp: Record<string, unknown> | null;
    score_threshold: number | string | null;
    status: AgentStatus;
    last_ran_at: string | null;
    created_at: string;
  }>;

  const counts = new Map<string, number>();
  if (agents.length > 0) {
    const since = new Date(nowMs - SEVEN_DAYS_MS).toISOString();
    const { data: hits } = await supabase
      .from("gc_signal_hits")
      .select("agent_id")
      .gte("detected_at", since)
      .limit(2000);
    for (const h of (hits ?? []) as Array<{ agent_id: string }>) {
      counts.set(h.agent_id, (counts.get(h.agent_id) ?? 0) + 1);
    }
  }

  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    signalType: a.signal_type,
    icp: a.icp ?? {},
    objective: a.objective ?? {},
    ramp: a.ramp ?? {},
    scoreThreshold: Number(a.score_threshold ?? 0.5),
    status: a.status,
    lastRanAt: a.last_ran_at,
    createdAt: a.created_at,
    hitCount7d: counts.get(a.id) ?? 0,
  }));
}

// the live feed: scored + pending hits, not dismissed/expired, hottest first.
export async function listHits(limit = 60): Promise<SignalHitRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_signal_hits")
    .select(
      "id, agent_id, contact_id, signal_type, raw, ai_score, ai_rationale, status, detected_at, draft_id",
    )
    .in("status", ["pending", "scored", "actioned"])
    .order("ai_score", { ascending: false, nullsFirst: false })
    .order("detected_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<{
    id: string;
    agent_id: string;
    contact_id: string | null;
    signal_type: SignalType;
    raw: Record<string, unknown> | null;
    ai_score: number | string | null;
    ai_rationale: string | null;
    status: HitStatus;
    detected_at: string;
    draft_id: string | null;
  }>).map((h) => ({
    id: h.id,
    agentId: h.agent_id,
    contactId: h.contact_id,
    signalType: h.signal_type,
    raw: h.raw ?? {},
    aiScore: h.ai_score == null ? null : Number(h.ai_score),
    aiRationale: h.ai_rationale,
    status: h.status,
    detectedAt: h.detected_at,
    draftId: h.draft_id,
  }));
}

export async function createAgent(args: {
  name: string;
  signalType: SignalType;
  icp: Record<string, unknown>;
  objective: Record<string, unknown>;
  ramp: Record<string, unknown>;
  scoreThreshold: number;
}): Promise<SignalAgent | null> {
  const uid = await userId();
  if (!uid) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_signal_agents")
    .insert({
      user_id: uid,
      name: args.name,
      signal_type: args.signalType,
      icp: args.icp,
      objective: args.objective,
      ramp: args.ramp,
      score_threshold: args.scoreThreshold,
      status: "active",
    })
    .select(
      "id, name, signal_type, icp, objective, ramp, score_threshold, status, last_ran_at, created_at",
    )
    .single();
  if (error || !data) throw new Error(error?.message ?? "create agent failed");
  const a = data as {
    id: string;
    name: string;
    signal_type: SignalType;
    icp: Record<string, unknown> | null;
    objective: Record<string, unknown> | null;
    ramp: Record<string, unknown> | null;
    score_threshold: number | string | null;
    status: AgentStatus;
    last_ran_at: string | null;
    created_at: string;
  };
  return {
    id: a.id,
    name: a.name,
    signalType: a.signal_type,
    icp: a.icp ?? {},
    objective: a.objective ?? {},
    ramp: a.ramp ?? {},
    scoreThreshold: Number(a.score_threshold ?? 0.5),
    status: a.status,
    lastRanAt: a.last_ran_at,
    createdAt: a.created_at,
    hitCount7d: 0,
  };
}

export async function setAgentStatus(
  agentId: string,
  status: AgentStatus,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("gc_signal_agents")
    .update({ status })
    .eq("id", agentId);
}

// insert a detected hit. deduped within an agent on raw.source_id via the unique
// partial index ... on conflict the insert is ignored. returns the new id or null.
export async function insertHit(args: {
  agentId: string;
  signalType: SignalType;
  raw: Record<string, unknown>;
  contactId?: string | null;
  aiScore?: number | null;
  aiRationale?: string | null;
  detectedAt?: string;
}): Promise<string | null> {
  const uid = await userId();
  if (!uid) return null;
  const supabase = await createClient();
  const scored = args.aiScore != null;
  const { data, error } = await supabase
    .from("gc_signal_hits")
    .insert({
      user_id: uid,
      agent_id: args.agentId,
      contact_id: args.contactId ?? null,
      signal_type: args.signalType,
      raw: args.raw,
      ai_score: args.aiScore ?? null,
      ai_rationale: args.aiRationale ?? null,
      status: scored ? "scored" : "pending",
      detected_at: args.detectedAt ?? new Date().toISOString(),
      scored_at: scored ? new Date().toISOString() : null,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    // a unique-violation on the dedupe index is expected + fine.
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }
  return (data?.id as string) ?? null;
}

export async function dismissHit(
  hitId: string,
  reason: string,
  notes?: string | null,
): Promise<void> {
  const uid = await userId();
  if (!uid) return;
  const supabase = await createClient();
  await supabase.from("gc_signal_dismissals").insert({
    user_id: uid,
    hit_id: hitId,
    reason,
    notes: notes ?? null,
  });
  await supabase
    .from("gc_signal_hits")
    .update({ status: "dismissed" })
    .eq("id", hitId);
}

export async function markHitActioned(
  hitId: string,
  draftId: string | null,
  contactId: string | null,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("gc_signal_hits")
    .update({
      status: "actioned",
      draft_id: draftId,
      contact_id: contactId,
      actioned_at: new Date().toISOString(),
    })
    .eq("id", hitId);
}

export async function getHit(hitId: string): Promise<SignalHitRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_signal_hits")
    .select(
      "id, agent_id, contact_id, signal_type, raw, ai_score, ai_rationale, status, detected_at, draft_id",
    )
    .eq("id", hitId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const h = data as {
    id: string;
    agent_id: string;
    contact_id: string | null;
    signal_type: SignalType;
    raw: Record<string, unknown> | null;
    ai_score: number | string | null;
    ai_rationale: string | null;
    status: HitStatus;
    detected_at: string;
    draft_id: string | null;
  };
  return {
    id: h.id,
    agentId: h.agent_id,
    contactId: h.contact_id,
    signalType: h.signal_type,
    raw: h.raw ?? {},
    aiScore: h.ai_score == null ? null : Number(h.ai_score),
    aiRationale: h.ai_rationale,
    status: h.status,
    detectedAt: h.detected_at,
    draftId: h.draft_id,
  };
}
