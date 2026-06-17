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
