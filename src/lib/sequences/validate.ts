import { type SequenceGraph } from "@/lib/types/sequence";

// the publish gate ... a pure function over the graph (no server imports), so the
// editor + the (later) compiler share one source of truth. returns the offending
// node ids so the canvas can flag them inline. see .claude/skills/xyflow-sequences.

export type SequenceIssue = { nodeId?: string; message: string };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
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

  const out = new Map<string, string[]>();
  for (const n of nodes) out.set(n.id, []);
  for (const e of edges) {
    if (out.has(e.source)) out.get(e.source)!.push(e.target);
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
    const outgoing = out.get(n.id) ?? [];
    if (n.type === "end") continue;
    // every non-end leaf must terminate at an end node.
    if (outgoing.length === 0) {
      issues.push({ nodeId: n.id, message: `${n.type} is a dead end ... connect it onward to an end node.` });
    }
    if (n.type === "send" && !str(n.data.body)) {
      issues.push({ nodeId: n.id, message: "send node has no body." });
    }
    if (n.type === "condition" && outgoing.length < 2) {
      issues.push({ nodeId: n.id, message: "condition needs both a true and a false branch." });
    }
    if (n.type === "branch" && outgoing.length < 2) {
      issues.push({ nodeId: n.id, message: "branch needs at least two outgoing paths." });
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
