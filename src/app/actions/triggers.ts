"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  listTriggers,
  createTrigger,
  setTriggerStatus,
  type Trigger,
  type TriggerStatus,
} from "@/lib/supabase/triggers";
import { listHits } from "@/lib/supabase/signals";
import { evaluateTrigger } from "@/lib/triggers/evaluate";
import {
  SIGNAL_TYPES,
  SIGNAL_LABELS,
  hookFromHit,
  type TriggerCondition,
} from "@/lib/types/signal";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function fetchTriggers(): Promise<Trigger[]> {
  const user = await requireUser();
  if (!user) return [];
  return listTriggers();
}

const ConditionInput = z
  .object({
    signal_type: z.enum(SIGNAL_TYPES).optional(),
    score_gte: z.number().min(0).max(1).optional(),
    detected_within_hours: z.number().min(1).max(2160).optional(),
    raw: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const CreateTriggerInput = z.object({
  name: z.string().min(1).max(80),
  status: z.enum(["active", "dry_run", "paused"]),
  condition: ConditionInput,
  action: z.object({ kind: z.string() }).passthrough(),
});

export type CreateTriggerResult =
  | { ok: true; trigger: Trigger }
  | { ok: false; error: string };

export async function createTriggerAction(
  raw: unknown,
): Promise<CreateTriggerResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in to build a trigger ..." };

  const parsed = CreateTriggerInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "that trigger didn't look right ... check the fields." };
  }

  try {
    const trigger = await createTrigger({
      name: parsed.data.name,
      kind: "signal",
      condition: parsed.data.condition as TriggerCondition,
      action: parsed.data.action,
      status: parsed.data.status,
    });
    if (!trigger) return { ok: false, error: "couldn't build that trigger ... try again." };
    revalidatePath("/triggers");
    return { ok: true, trigger };
  } catch (err) {
    console.error("[triggers] create failed", err);
    return { ok: false, error: "couldn't build that trigger ... try again." };
  }
}

export type TriggerStatusResult = { ok: true } | { ok: false; error: string };

export async function setTriggerStatusAction(
  triggerId: string,
  status: TriggerStatus,
): Promise<TriggerStatusResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in first ..." };
  if (!z.string().uuid().safeParse(triggerId).success) {
    return { ok: false, error: "that trigger didn't look right ..." };
  }
  try {
    await setTriggerStatus(triggerId, status);
    revalidatePath("/triggers");
    return { ok: true };
  } catch {
    return { ok: false, error: "couldn't update that trigger ... try again." };
  }
}

export type TriggerTestMatch = {
  signalLabel: string;
  hook: string;
  score: number | null;
};

export type TestTriggerResult =
  | { ok: true; total: number; matched: number; sample: TriggerTestMatch[] }
  | { ok: false; error: string };

// the dry run: evaluate a candidate condition against the user's recent hits,
// right now, with no firing. this is the live exercise of the pure evaluator
// (lib/triggers/evaluate) + the honest way to author a trigger before the apify
// fire path lands ... "would this have caught these?"
export async function testTriggerAction(
  rawCondition: unknown,
): Promise<TestTriggerResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in to test ..." };

  const parsed = ConditionInput.safeParse(rawCondition);
  if (!parsed.success) {
    return { ok: false, error: "that condition didn't look right ..." };
  }
  const condition = parsed.data as TriggerCondition;

  try {
    const hits = await listHits(200);
    const nowMs = Date.now();
    const matches = hits.filter((h) =>
      evaluateTrigger(
        condition,
        {
          signalType: h.signalType,
          raw: h.raw,
          aiScore: h.aiScore,
          detectedAt: h.detectedAt,
        },
        null,
        nowMs,
      ),
    );
    const sample: TriggerTestMatch[] = matches.slice(0, 5).map((h) => ({
      signalLabel: SIGNAL_LABELS[h.signalType],
      hook: hookFromHit(h.signalType, h.raw),
      score: h.aiScore,
    }));
    return { ok: true, total: hits.length, matched: matches.length, sample };
  } catch (err) {
    console.error("[triggers] test failed", err);
    return { ok: false, error: "couldn't run the test ... try again." };
  }
}
