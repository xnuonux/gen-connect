import {
  sourceHandlesFor,
  type SequenceGraph,
} from "@/lib/types/sequence";

// the publish gate ... a pure function over the graph (no server imports), so the
// editor + the (later) compiler share one source of truth. returns the offending
// node ids so the canvas can flag them inline. see .claude/skills/xyflow-sequences.
//
// path identity matters: condition/branch carry named source handles (true/false,
// way-1..n). the gate requires exactly one edge per named handle + branch weights
// summing to 100, so it never greenlights a graph the compiler can't route.

export type SequenceIssue = { nodeId?: string; message: string };

type OutEdge = { target: string; handle: string | null };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function wayLabel(handle: string): string {
  return handle.startsWith("way-") ? handle.slice(4) : handle;
}

export function validateGraph(graph: SequenceGraph): SequenceIssue[] {
  const issues: SequenceIssue[] = [];
  const { nodes, edges } = graph;

  if (nodes.length === 0) {
    return [{ message: "empty ... add a start node and a first send." }];
  }

  const starts = nodes.filter((n) => n.type === "start");
  if (starts.length === 0) {
    issues.push({ message: "no start node ... every sequence begins at start." });
  } else if (starts.length > 1) {
    issues.push({ message: "more than one start node ... there can be only one." });
  }

  // targets-only adjacency for reachability + cycle detection; the full edge list
  // (with source handle) for the per-node path-identity rules.
  const out = new Map<string, string[]>();
  const outFull = new Map<string, OutEdge[]>();
  for (const n of nodes) {
    out.set(n.id, []);
    outFull.set(n.id, []);
  }
  for (const e of edges) {
    if (out.has(e.source)) out.get(e.source)!.push(e.target);
    if (outFull.has(e.source))
      outFull.get(e.source)!.push({ target: e.target, handle: e.sourceHandle ?? null });
  }

  // reachability from start (bfs).
  const start = starts[0];
  if (start) {
    const seen = new Set<string>([start.id]);
    const queue = [start.id];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of out.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    for (const n of nodes) {
      if (!seen.has(n.id)) {
        issues.push({ nodeId: n.id, message: "unreachable from start." });
      }
    }
  }

  // cycle detection (dfs with a recursion stack).
  const color = new Map<string, 0 | 1 | 2>(); // 0 unseen, 1 in-stack, 2 done
  let hasCycle = false;
  const visit = (id: string) => {
    color.set(id, 1);
    for (const next of out.get(id) ?? []) {
      const c = color.get(next) ?? 0;
      if (c === 1) hasCycle = true;
      else if (c === 0) visit(next);
    }
    color.set(id, 2);
  };
  for (const n of nodes) if ((color.get(n.id) ?? 0) === 0) visit(n.id);
  if (hasCycle) {
    issues.push({ message: "the graph loops ... sequences must flow forward to an end." });
  }

  // per-node rules.
  for (const n of nodes) {
    const outgoing = outFull.get(n.id) ?? [];
    if (n.type === "end") continue;

    // every non-end leaf must terminate at an end node.
    if (outgoing.length === 0) {
      issues.push({ nodeId: n.id, message: `${n.type} is a dead end ... connect it onward to an end node.` });
    }

    if (n.type === "send") {
      if (n.data.channel === "email" && !str(n.data.subject)) {
        issues.push({ nodeId: n.id, message: "email send has no subject." });
      }
      if (!str(n.data.body)) {
        issues.push({ nodeId: n.id, message: "send node has no body." });
      }
      // a/b variants: every variant body filled + extra weights never exceed 100
      // (the primary absorbs the remainder), so the split is real, not cosmetic.
      const variants = Array.isArray(n.data.variants)
        ? (n.data.variants as unknown[])
        : [];
      if (variants.length > 0) {
        let extraSum = 0;
        let emptyBody = false;
        for (const v of variants) {
          const o = (v ?? {}) as Record<string, unknown>;
          if (!str(o.body)) emptyBody = true;
          extraSum += typeof o.weight === "number" ? o.weight : 0;
        }
        if (emptyBody) {
          issues.push({ nodeId: n.id, message: "a send variant has no body." });
        }
        if (extraSum > 100) {
          issues.push({ nodeId: n.id, message: "send variant weights exceed 100." });
        }
      }
    }

    // condition + branch carry named handles ... one edge per handle, no more.
    if (n.type === "condition" || n.type === "branch") {
      const handles = sourceHandlesFor(n.type, n.data);
      for (const h of handles) {
        const count = outgoing.filter((e) => e.handle === h).length;
        const where = n.type === "condition" ? `${h} path` : `path ${wayLabel(h)}`;
        if (count === 0) {
          issues.push({ nodeId: n.id, message: `${n.type} ${where} has no outgoing edge.` });
        } else if (count > 1) {
          issues.push({ nodeId: n.id, message: `${n.type} ${where} has more than one edge.` });
        }
      }
    }

    // branch weights must cover every way and sum to 100.
    if (n.type === "branch") {
      const handles = sourceHandlesFor("branch", n.data);
      const weights = Array.isArray(n.data.weights) ? (n.data.weights as unknown[]) : [];
      const nums = weights.map((w) => (typeof w === "number" ? w : NaN));
      const sum = nums.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      if (nums.length !== handles.length || nums.some((w) => !Number.isFinite(w)) || sum !== 100) {
        issues.push({ nodeId: n.id, message: "branch weights must cover every path and sum to 100." });
      }
    }
  }

  // at least one end node overall.
  if (!nodes.some((n) => n.type === "end")) {
    issues.push({ message: "no end node ... a sequence has to finish somewhere." });
  }

  return issues;
}

export function isPublishable(graph: SequenceGraph): boolean {
  return validateGraph(graph).length === 0;
}
