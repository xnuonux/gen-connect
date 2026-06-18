import { renderSample } from "@/lib/sequences/spintax";
import { sourceHandlesFor, type NodeKind, type SequenceGraph } from "@/lib/types/sequence";

// compile a graph into the ordered run a contact would actually experience ... a
// pure function (no infra), so the editor can preview the journey AND the deferred
// pg-boss worker (railway) can consume the same plan. it walks the primary path:
// condition -> the true edge, branch -> the heaviest way, accumulating relative
// time from wait nodes. it is also a deeper executability check than validateGraph:
// if the walk never reaches an end, the run is not real yet. see xyflow-sequences.

export type CompiledStep = {
  nodeId: string;
  kind: NodeKind;
  offsetMs: number;
  offsetLabel: string;
  title: string;
  detail?: string;
};

export type CompiledRun = {
  steps: CompiledStep[];
  reachedEnd: boolean;
  note?: string;
};

function unitMs(unit: string): number {
  if (unit === "hours") return 3600e3;
  if (unit === "weeks") return 604800e3;
  return 86400e3; // days (default)
}

function str(data: Record<string, unknown>, key: string, fallback = ""): string {
  return typeof data[key] === "string" ? (data[key] as string) : fallback;
}
function num(data: Record<string, unknown>, key: string, fallback: number): number {
  return typeof data[key] === "number" ? (data[key] as number) : fallback;
}

// cumulative offset from enrollment, in the units creators actually think in.
function fmtOffset(ms: number): string {
  if (ms <= 0) return "now";
  const d = Math.floor(ms / 86400e3);
  const h = Math.floor((ms % 86400e3) / 3600e3);
  if (d === 0) return `+${h}h`;
  if (h === 0) return `+${d}d`;
  return `+${d}d ${h}h`;
}

const MAX_STEPS = 64; // defensive cap ... validateGraph forbids cycles, but never trust the walk.

export function compileRun(graph: SequenceGraph): CompiledRun {
  const start = graph.nodes.find((n) => n.type === "start");
  if (!start) return { steps: [], reachedEnd: false, note: "no start node yet." };

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out = new Map<string, { target: string; handle: string | null }[]>();
  for (const n of graph.nodes) out.set(n.id, []);
  for (const e of graph.edges) {
    out.get(e.source)?.push({ target: e.target, handle: e.sourceHandle ?? null });
  }

  const steps: CompiledStep[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = start.id;
  let offset = 0;
  let reachedEnd = false;
  let branched = false; // did the walk follow a branch? ... changes the dead-end copy.
  let note: string | undefined;

  for (let i = 0; i < MAX_STEPS && cur; i += 1) {
    // capture the (loop-condition-narrowed) current id into a clean const so the
    // edges type doesn't infer circularly through the cur reassignment below.
    const at: string = cur;
    if (seen.has(at)) {
      note = "the path loops ... showing it up to the repeat.";
      break;
    }
    seen.add(at);
    const node = byId.get(at);
    if (!node) break;
    const edges = out.get(at) ?? [];
    const data = node.data ?? {};

    if (node.type === "start") {
      steps.push({ nodeId: at, kind: "start", offsetMs: offset, offsetLabel: fmtOffset(offset), title: "enrolled" });
      cur = edges[0]?.target;
      continue;
    }
    if (node.type === "send") {
      const channel = str(data, "channel", "email");
      const subject = str(data, "subject");
      const body = str(data, "body");
      steps.push({
        nodeId: at,
        kind: "send",
        offsetMs: offset,
        offsetLabel: fmtOffset(offset),
        title: `${channel} · ${subject ? renderSample(subject, 0) : "(no subject)"}`,
        detail: body ? renderSample(body, 0) : undefined,
      });
      cur = edges[0]?.target;
      continue;
    }
    if (node.type === "wait") {
      const amount = num(data, "amount", 0);
      const unit = str(data, "unit", "days");
      offset += amount * unitMs(unit);
      steps.push({ nodeId: at, kind: "wait", offsetMs: offset, offsetLabel: fmtOffset(offset), title: `wait ${amount} ${unit}` });
      cur = edges[0]?.target;
      continue;
    }
    if (node.type === "condition") {
      const check = str(data, "check", "opened");
      // follow ONLY the true edge ... never fall back to the false edge while
      // claiming "true" (an unwired true path correctly reads as a dead-end here).
      const truthy = edges.find((e) => e.handle === "true");
      steps.push({
        nodeId: at,
        kind: "condition",
        offsetMs: offset,
        offsetLabel: fmtOffset(offset),
        title: `if ${check}`,
        detail: "preview follows the true path",
      });
      cur = truthy?.target;
      continue;
    }
    if (node.type === "branch") {
      const weights = Array.isArray(data.weights) ? (data.weights as unknown[]) : [];
      const handles = sourceHandlesFor("branch", data);
      let bestIdx = 0;
      let bestW = -1;
      handles.forEach((_h, idx) => {
        const w = typeof weights[idx] === "number" ? (weights[idx] as number) : 0;
        if (w > bestW) {
          bestW = w;
          bestIdx = idx;
        }
      });
      const handle = handles[bestIdx];
      const edge = edges.find((e) => e.handle === handle) ?? edges[0];
      branched = true;
      steps.push({
        nodeId: at,
        kind: "branch",
        offsetMs: offset,
        offsetLabel: fmtOffset(offset),
        title: `branch ... way ${bestIdx + 1} (${bestW < 0 ? 0 : bestW}%)`,
        detail: "preview follows the heaviest path",
      });
      cur = edge?.target;
      continue;
    }
    if (node.type === "end") {
      const action = str(data, "action", "completed");
      steps.push({ nodeId: at, kind: "end", offsetMs: offset, offsetLabel: fmtOffset(offset), title: `end · ${action}` });
      reachedEnd = true;
      cur = undefined;
      break;
    }
    cur = edges[0]?.target;
  }

  if (!reachedEnd && !note) {
    // distinguish the three not-reached cases honestly: cur still set = the 64-step
    // cap; a branch was taken = only the heaviest slice dead-ends; otherwise the
    // path genuinely has no end wired.
    note = cur
      ? "preview capped at 64 steps ... the rest isn't shown."
      : branched
        ? "the heaviest path dead-ends ... a lighter way may still reach an end."
        : "this path doesn't reach an end yet.";
  }
  return { steps, reachedEnd, note };
}
