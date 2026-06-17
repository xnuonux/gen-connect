import { createClient } from "@/lib/supabase/server";
import { type TriggerCondition } from "@/lib/types/signal";

// the rules engine's persistence. gc_triggers stores the jsonb predicate (no
// string dsl, ever) + a jsonb action. RLS scopes everything to the session user.
// the evaluator (lib/triggers/evaluate) reads the condition; the fire path
// (gated on the apify webhook) reads the action. see docs/06-signals-spec.md.

export type TriggerKind = "signal" | "event" | "time" | "manual";
export type TriggerStatus = "active" | "paused" | "dry_run" | "archived";

export type TriggerAction = {
  kind: string;
  sequence_id?: string | null;
};

export type Trigger = {
  id: string;
  name: string;
  kind: TriggerKind;
  condition: TriggerCondition;
  action: TriggerAction;
  priority: number;
  status: TriggerStatus;
  fireCount: number;
  lastFiredAt: string | null;
  createdAt: string;
};

type RawTrigger = {
  id: string;
  name: string;
  kind: TriggerKind;
  condition: TriggerCondition | null;
  action: TriggerAction | null;
  priority: number | null;
  status: TriggerStatus;
  fire_count: number | null;
  last_fired_at: string | null;
  created_at: string;
};

const COLS =
  "id, name, kind, condition, action, priority, status, fire_count, last_fired_at, created_at";

function mapTrigger(t: RawTrigger): Trigger {
  return {
    id: t.id,
    name: t.name,
    kind: t.kind,
    condition: (t.condition ?? {}) as TriggerCondition,
    action: (t.action ?? { kind: "draft" }) as TriggerAction,
    priority: t.priority ?? 100,
    status: t.status,
    fireCount: t.fire_count ?? 0,
    lastFiredAt: t.last_fired_at,
    createdAt: t.created_at,
  };
}

async function userId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function listTriggers(): Promise<Trigger[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_triggers")
    .select(COLS)
    .neq("status", "archived")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawTrigger[]).map(mapTrigger);
}

// the active signal-kind triggers, highest priority first ... the auto-fire path
// evaluates a freshly-ingested hit against these.
export async function listActiveSignalTriggers(): Promise<Trigger[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_triggers")
    .select(COLS)
    .eq("kind", "signal")
    .eq("status", "active")
    .order("priority", { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawTrigger[]).map(mapTrigger);
}

// bump a trigger's fire tally + stamp last_fired_at. read-then-write ... a tiny
// race on the count is fine for a tally, and RLS scopes it to the owner.
export async function incrementTriggerFire(triggerId: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gc_triggers")
    .select("fire_count")
    .eq("id", triggerId)
    .maybeSingle();
  const next = (((data as { fire_count: number | null } | null)?.fire_count) ?? 0) + 1;
  const { error } = await supabase
    .from("gc_triggers")
    .update({ fire_count: next, last_fired_at: new Date().toISOString() })
    .eq("id", triggerId);
  if (error) throw new Error(error.message);
}

export async function createTrigger(args: {
  name: string;
  kind: TriggerKind;
  condition: TriggerCondition;
  action: TriggerAction;
  status: TriggerStatus;
}): Promise<Trigger | null> {
  const uid = await userId();
  if (!uid) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_triggers")
    .insert({
      user_id: uid,
      name: args.name,
      kind: args.kind,
      condition: args.condition,
      action: args.action,
      status: args.status,
    })
    .select(COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "create trigger failed");
  return mapTrigger(data as RawTrigger);
}

export async function setTriggerStatus(
  triggerId: string,
  status: TriggerStatus,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("gc_triggers")
    .update({ status })
    .eq("id", triggerId);
  if (error) throw new Error(error.message);
}
