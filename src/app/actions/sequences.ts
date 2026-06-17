"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  listSequences,
  getSequence,
  createSequence,
  saveSequence,
} from "@/lib/supabase/sequences";
import { validateGraph } from "@/lib/sequences/validate";
import {
  NODE_KINDS,
  type SequenceGraph,
  type SequenceRecord,
  type SequenceSummary,
} from "@/lib/types/sequence";

// the sequences action surface ... thin RLS-scoped wrappers the editor calls.
// every mutation revalidates /sequences + /campaigns so both surfaces stay true.

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function fetchSequences(): Promise<SequenceSummary[]> {
  const user = await requireUser();
  if (!user) return [];
  return listSequences();
}

export async function getSequenceAction(
  id: string,
): Promise<SequenceRecord | null> {
  const user = await requireUser();
  if (!user) return null;
  if (!z.string().uuid().safeParse(id).success) return null;
  return getSequence(id);
}

export type CreateSequenceResult =
  | { ok: true; sequence: SequenceRecord }
  | { ok: false; error: string };

export async function createSequenceAction(
  name: string,
): Promise<CreateSequenceResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in to build a sequence ..." };

  const clean = z.string().trim().min(1).max(80).safeParse(name);
  const finalName = clean.success ? clean.data : "untitled sequence";

  try {
    const sequence = await createSequence(finalName);
    if (!sequence) {
      return { ok: false, error: "couldn't start that sequence ... try again." };
    }
    revalidatePath("/sequences");
    revalidatePath("/campaigns");
    return { ok: true, sequence };
  } catch (err) {
    console.error("[sequences] create failed", err);
    return { ok: false, error: "couldn't start that sequence ... try again." };
  }
}

const NodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(NODE_KINDS),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()),
});

const EdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
});

const GraphSchema = z.object({
  nodes: z.array(NodeSchema).max(200),
  edges: z.array(EdgeSchema).max(400),
});

const SaveSequenceInput = z.object({
  id: z.string().uuid(),
  graph: GraphSchema,
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
});

export type SaveSequenceResult =
  | { ok: true; sequence: SequenceRecord }
  | { ok: false; error: string; issues?: string[] };

// save persists the graph as a draft anytime. flipping to active is the publish
// gate ... it must pass validateGraph, the same pure check the canvas runs. the
// server is the source of truth so a tampered client can't activate a broken graph.
export async function saveSequenceAction(
  raw: unknown,
): Promise<SaveSequenceResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in to save ..." };

  const parsed = SaveSequenceInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "that sequence didn't look right ... check the canvas." };
  }

  const graph = parsed.data.graph as SequenceGraph;

  if (parsed.data.status === "active") {
    const issues = validateGraph(graph);
    if (issues.length > 0) {
      return {
        ok: false,
        error: "fix these before it can go live ...",
        issues: issues.map((i) => i.message),
      };
    }
  }

  try {
    const sequence = await saveSequence({
      id: parsed.data.id,
      graph,
      name: parsed.data.name,
      status: parsed.data.status,
    });
    if (!sequence) return { ok: false, error: "couldn't save that ... try again." };
    revalidatePath("/sequences");
    revalidatePath("/campaigns");
    return { ok: true, sequence };
  } catch (err) {
    console.error("[sequences] save failed", err);
    return { ok: false, error: "couldn't save that ... try again." };
  }
}
