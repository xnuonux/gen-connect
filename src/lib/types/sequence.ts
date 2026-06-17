// the sequence graph ... client-safe (no server imports). stored as jsonb in
// gc_sequences.graph. the xyflow editor reads/writes this shape; the validator +
// (later) the pg-boss compiler read it too. see .claude/skills/xyflow-sequences.

export const NODE_KINDS = [
  "start",
  "send",
  "wait",
  "condition",
  "branch",
  "end",
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const NODE_LABELS: Record<NodeKind, string> = {
  start: "start",
  send: "send",
  wait: "wait",
  condition: "condition",
  branch: "branch",
  end: "end",
};

// node data is intentionally loose for v1 ... each kind reads the keys it needs:
//   send: { channel, subject, body }
//   wait: { amount, unit }            (unit: hours | days | weeks)
//   condition: { check }              (opened | clicked | replied | score_gte)
//   branch: { ways }
//   end: { action }                   (completed | move_stage | pause | add_tag)
export type SequenceNodeData = Record<string, unknown>;

export type SequenceNode = {
  id: string;
  type: NodeKind;
  position: { x: number; y: number };
  data: SequenceNodeData;
};

export type SequenceEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
};

export type SequenceGraph = {
  nodes: SequenceNode[];
  edges: SequenceEdge[];
};

export const EMPTY_GRAPH: SequenceGraph = { nodes: [], edges: [] };

// the named source handles a node exposes. condition forks true/false; branch
// forks one path per way (capped 2-4). start/send/wait expose a single unnamed
// handle (returns [] here ... the canvas renders the lone handle); end has none.
// this is the contract that lets the saved graph carry path identity (which edge
// is the true branch, which way is which) so the deferred compiler can route it.
export function sourceHandlesFor(
  kind: NodeKind,
  data: SequenceNodeData,
): string[] {
  if (kind === "condition") return ["true", "false"];
  if (kind === "branch") {
    const raw = typeof data.ways === "number" ? data.ways : 2;
    const ways = Math.max(2, Math.min(4, raw));
    return Array.from({ length: ways }, (_, i) => `way-${i + 1}`);
  }
  return [];
}

// an even integer split that always sums to 100 (remainder folded into the first
// way) ... the default branch weighting the inspector seeds + resets on ways change.
export function evenWeights(n: number): number[] {
  const k = Math.max(2, Math.min(4, n));
  const base = Math.floor(100 / k);
  const out = Array.from({ length: k }, () => base);
  out[0] = (out[0] ?? base) + (100 - base * k);
  return out;
}

export type SequenceStatus = "draft" | "active" | "paused" | "archived";

export type SequenceSummary = {
  id: string;
  name: string;
  status: SequenceStatus;
  version: number;
  enrolledCount: number;
  replyCount: number;
  nodeCount: number;
  updatedAt: string;
};

export type SequenceRecord = SequenceSummary & { graph: SequenceGraph };
