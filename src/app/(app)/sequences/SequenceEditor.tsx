"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Plus,
  Mail,
  Clock,
  GitFork,
  Split,
  Square,
  Play,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  fetchSequences,
  getSequenceAction,
  createSequenceAction,
  saveSequenceAction,
} from "@/app/actions/sequences";
import { validateGraph } from "@/lib/sequences/validate";
import {
  NODE_LABELS,
  sourceHandlesFor,
  evenWeights,
  type NodeKind,
  type SequenceGraph,
  type SequenceRecord,
  type SequenceStatus,
  type SequenceSummary,
} from "@/lib/types/sequence";

// the visual sequence editor ... xyflow canvas, lunari-styled nodes, a node
// inspector, and the publish gate wired to the same pure validator the server
// runs. save persists a draft anytime; activate runs validateGraph first. the
// graph jsonb round-trips through gc_sequences. compile-to-pg-boss is deferred
// (railway) ... this is the authoring surface. see .claude/skills/xyflow-sequences.

const HANDLE_STYLE = {
  width: 9,
  height: 9,
  background: "var(--lunari-neutral-500)",
  border: "2px solid var(--lunari-surface)",
} as const;

const KIND_ICON: Record<NodeKind, LucideIcon> = {
  start: Play,
  send: Mail,
  wait: Clock,
  condition: GitFork,
  branch: Split,
  end: Square,
};

const DEFAULT_DATA: Record<NodeKind, Record<string, unknown>> = {
  start: {},
  send: { channel: "email", subject: "", body: "" },
  wait: { amount: 2, unit: "days" },
  condition: { check: "opened" },
  branch: { ways: 2, weights: [50, 50] },
  end: { action: "completed" },
};

function wayLabelShort(handle: string): string {
  return handle.startsWith("way-") ? handle.slice(4) : handle;
}

const PALETTE: Exclude<NodeKind, "start">[] = [
  "send",
  "wait",
  "condition",
  "branch",
  "end",
];

const STATUS_STYLE: Record<SequenceStatus, string> = {
  draft: "bg-lunari-surface-elevated text-lunari-neutral-400",
  active: "bg-gen-accent-soft text-gen-accent",
  paused: "bg-lunari-surface-elevated text-lunari-gold",
  archived: "bg-lunari-surface-elevated text-lunari-neutral-500",
};

function readStr(data: Record<string, unknown>, key: string): string {
  return typeof data[key] === "string" ? (data[key] as string).trim() : "";
}
function readNum(data: Record<string, unknown>, key: string, fallback: number): number {
  return typeof data[key] === "number" ? (data[key] as number) : fallback;
}

function summaryFor(kind: NodeKind, data: Record<string, unknown>): string {
  switch (kind) {
    case "start":
      return "enrolled contacts enter here";
    case "send": {
      const ch = readStr(data, "channel") || "email";
      const subj = readStr(data, "subject");
      return subj ? `${ch} · ${subj}` : `${ch} · no subject yet`;
    }
    case "wait":
      return `wait ${readNum(data, "amount", 2)} ${readStr(data, "unit") || "days"}`;
    case "condition":
      return `if ${readStr(data, "check") || "opened"}`;
    case "branch":
      return `${readNum(data, "ways", 2)}-way split`;
    case "end":
      return `end · ${readStr(data, "action") || "completed"}`;
  }
}

// one node component, rendered for every kind ... reads props.type for its kind.
function GcNode(props: NodeProps) {
  const kind = (props.type ?? "send") as NodeKind;
  const data = (props.data ?? {}) as Record<string, unknown>;
  const selected = props.selected ?? false;
  const Icon = KIND_ICON[kind];
  const body = readStr(data, "body");
  const named = sourceHandlesFor(kind, data);
  return (
    <div
      className={cn(
        "min-w-[190px] max-w-[230px] rounded-lg border bg-lunari-surface px-3 py-2.5",
        selected ? "border-gen-accent" : "border-lunari-surface-elevated",
      )}
    >
      {kind !== "start" ? (
        <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      ) : null}
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 stroke-[1.25] text-lunari-neutral-400" />
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-lunari-neutral-400">
          {NODE_LABELS[kind]}
        </span>
      </div>
      <p className="mt-1 truncate text-sm text-lunari-cream">
        {summaryFor(kind, data)}
      </p>
      {kind === "send" && body ? (
        <p className="mt-1 line-clamp-2 text-[11px] text-lunari-neutral-400">
          {body}
        </p>
      ) : null}
      {named.length > 0 ? (
        <>
          {named.map((h, i) => (
            <Handle
              key={h}
              id={h}
              type="source"
              position={Position.Bottom}
              style={{ ...HANDLE_STYLE, left: `${((i + 1) / (named.length + 1)) * 100}%` }}
            />
          ))}
          {/* labels just inside the bottom edge, aligned to each handle. */}
          <div className="relative mt-2 h-3">
            {named.map((h, i) => (
              <span
                key={h}
                className="absolute top-0 -translate-x-1/2 font-mono text-[8px] uppercase tracking-wide text-lunari-neutral-500"
                style={{ left: `${((i + 1) / (named.length + 1)) * 100}%` }}
              >
                {kind === "branch" ? wayLabelShort(h) : h}
              </span>
            ))}
          </div>
        </>
      ) : kind !== "end" ? (
        <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
      ) : null}
    </div>
  );
}

const NODE_TYPES: NodeTypes = {
  start: GcNode,
  send: GcNode,
  wait: GcNode,
  condition: GcNode,
  branch: GcNode,
  end: GcNode,
};

function toFlow(graph: SequenceGraph): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { ...n.data },
    deletable: n.type !== "start",
  }));
  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
  }));
  return { nodes, edges };
}

function fromFlow(nodes: Node[], edges: Edge[]): SequenceGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: (n.type ?? "send") as NodeKind,
      position: n.position,
      data: (n.data ?? {}) as Record<string, unknown>,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
    })),
  };
}

const EDGE_OPTIONS = {
  type: "smoothstep",
  style: { stroke: "var(--lunari-surface-elevated)", strokeWidth: 1.5 },
} as const;

export function SequenceEditor({
  initialSequences,
  initialActive,
}: {
  initialSequences: SequenceSummary[];
  initialActive: SequenceRecord | null;
}) {
  const queryClient = useQueryClient();
  const initialFlow = initialActive
    ? toFlow(initialActive.graph)
    : { nodes: [], edges: [] };

  const [activeId, setActiveId] = useState<string | null>(
    initialActive?.id ?? null,
  );
  const [name, setName] = useState(initialActive?.name ?? "");
  const [nodes, setNodes, onNodesChange] = useNodesState(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const loadedRef = useRef<string | null>(initialActive?.id ?? null);

  const { data: sequences = [] } = useQuery({
    queryKey: ["sequences"],
    queryFn: fetchSequences,
    initialData: initialSequences,
  });

  const { data: activeRecord } = useQuery({
    queryKey: ["sequence", activeId],
    queryFn: async () => (activeId ? getSequenceAction(activeId) : null),
    initialData:
      activeId && initialActive && initialActive.id === activeId
        ? initialActive
        : undefined,
    enabled: !!activeId,
  });

  // load the canvas only when the active sequence actually changes ... in-flight
  // edits survive refetches; switching sequences reloads the graph.
  useEffect(() => {
    if (activeRecord && loadedRef.current !== activeRecord.id) {
      const f = toFlow(activeRecord.graph);
      setNodes(f.nodes);
      setEdges(f.edges);
      setName(activeRecord.name);
      setSelectedId(null);
      loadedRef.current = activeRecord.id;
    }
  }, [activeRecord, setNodes, setEdges]);

  const status: SequenceStatus = activeRecord?.status ?? "draft";

  const graph = useMemo(() => fromFlow(nodes, edges), [nodes, edges]);
  const issues = useMemo(() => validateGraph(graph), [graph]);
  const publishable = issues.length === 0 && nodes.length > 1;

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c }, eds)),
    [setEdges],
  );

  const addNode = useCallback(
    (kind: Exclude<NodeKind, "start">) => {
      const id = `${kind}-${crypto.randomUUID().slice(0, 8)}`;
      setNodes((nds) => {
        const count = nds.length;
        const node: Node = {
          id,
          type: kind,
          position: { x: 120 + (count % 3) * 210, y: 150 + count * 64 },
          data: { ...DEFAULT_DATA[kind] },
          deletable: true,
        };
        return [...nds, node];
      });
      setSelectedId(id);
    },
    [setNodes],
  );

  const updateNodeData = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      );
      // shrinking a branch's ways orphans edges on the dropped way handles ...
      // prune them so the graph never carries a dangling, unrenderable edge.
      if (typeof patch.ways === "number") {
        const ways = Math.max(2, Math.min(4, patch.ways));
        const valid = new Set(
          Array.from({ length: ways }, (_, i) => `way-${i + 1}`),
        );
        setEdges((eds) =>
          eds.filter(
            (e) =>
              !(
                e.source === id &&
                typeof e.sourceHandle === "string" &&
                e.sourceHandle.startsWith("way-") &&
                !valid.has(e.sourceHandle)
              ),
          ),
        );
      }
    },
    [setNodes, setEdges],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
    },
    [setNodes, setEdges],
  );

  const create = useMutation({
    mutationFn: async () => {
      const r = await createSequenceAction("untitled sequence");
      if (!r.ok) throw new Error(r.error);
      return r.sequence;
    },
    onSuccess: (seq) => {
      queryClient.setQueryData(["sequence", seq.id], seq);
      void queryClient.invalidateQueries({ queryKey: ["sequences"] });
      loadedRef.current = null;
      setActiveId(seq.id);
      toast.success("new sequence ... build the first send.");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "couldn't create that ..."),
  });

  const save = useMutation({
    mutationFn: async (nextStatus: SequenceStatus | undefined) => {
      if (!activeId) throw new Error("no sequence selected.");
      const r = await saveSequenceAction({
        id: activeId,
        graph: fromFlow(nodes, edges),
        name: name.trim() || "untitled sequence",
        status: nextStatus,
      });
      if (!r.ok) {
        if (r.issues?.length) {
          throw new Error(`${r.error} ${r.issues.slice(0, 2).join(" · ")}`);
        }
        throw new Error(r.error);
      }
      return r.sequence;
    },
    onSuccess: (seq) => {
      loadedRef.current = seq.id;
      queryClient.setQueryData(["sequence", seq.id], seq);
      void queryClient.invalidateQueries({ queryKey: ["sequences"] });
      toast.success(
        seq.status === "active"
          ? "live ... new enrollments run this version."
          : seq.status === "paused"
            ? "paused."
            : "saved.",
      );
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "couldn't save ..."),
  });

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const noneYet = sequences.length === 0 && !activeId;

  return (
    <div className="flex h-full min-h-0">
      {/* the sequence rail */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-lunari-surface-elevated bg-lunari-surface">
        <div className="flex items-center justify-between border-b border-lunari-surface-elevated px-4 py-3.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
            sequences
          </span>
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending}
            aria-label="new sequence"
            className="planetarium flex h-6 w-6 items-center justify-center rounded-md text-lunari-neutral-400 hover:bg-lunari-surface-elevated hover:text-lunari-cream disabled:opacity-40"
          >
            <Plus className="h-4 w-4 stroke-[1.25]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {sequences.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-lunari-neutral-500">
              no sequences yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {sequences.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    className={cn(
                      "planetarium w-full rounded-md px-2.5 py-2 text-left",
                      s.id === activeId
                        ? "bg-lunari-surface-elevated"
                        : "hover:bg-lunari-surface-elevated/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-lunari-cream">
                        {s.name}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em]",
                          STATUS_STYLE[s.status],
                        )}
                      >
                        {s.status}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-lunari-neutral-500">
                      {s.nodeCount} {s.nodeCount === 1 ? "step" : "steps"} ·{" "}
                      {s.enrolledCount} enrolled
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* the editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        {noneYet ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-500">
              sequences
            </span>
            <p className="max-w-sm text-sm text-lunari-neutral-400">
              no sequences yet ... build one on the canvas. a start, a first
              send in your voice, a wait, then the follow-up that does the work.
            </p>
            <button
              type="button"
              onClick={() => create.mutate()}
              disabled={create.isPending}
              className="planetarium flex items-center gap-2 rounded-md bg-gen-accent px-3 py-2 text-sm font-medium text-lunari-cream hover:bg-gen-accent/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4 stroke-[1.25]" />
              <span>{create.isPending ? "starting ..." : "new sequence"}</span>
            </button>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between gap-3 border-b border-lunari-surface-elevated px-5 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="untitled sequence"
                  className="min-w-0 max-w-xs truncate border-none bg-transparent text-base font-medium text-lunari-cream placeholder:text-lunari-neutral-500 focus:outline-none"
                />
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em]",
                    STATUS_STYLE[status],
                  )}
                >
                  {status}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => save.mutate(undefined)}
                  disabled={save.isPending}
                  className="planetarium rounded-md border border-lunari-surface-elevated px-3 py-1.5 text-xs text-lunari-cream/90 hover:bg-lunari-surface-elevated disabled:opacity-50"
                >
                  {save.isPending ? "saving ..." : "save"}
                </button>
                {status === "active" ? (
                  <button
                    type="button"
                    onClick={() => save.mutate("paused")}
                    disabled={save.isPending}
                    className="planetarium rounded-md border border-lunari-surface-elevated px-3 py-1.5 text-xs text-lunari-gold hover:bg-lunari-surface-elevated disabled:opacity-50"
                  >
                    pause
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => save.mutate("active")}
                    disabled={!publishable || save.isPending}
                    title={
                      !publishable
                        ? (issues[0]?.message ?? "add a send and an end first.")
                        : undefined
                    }
                    className="planetarium rounded-md bg-gen-accent px-3 py-1.5 text-xs font-medium text-lunari-cream hover:bg-gen-accent/90 disabled:opacity-40"
                  >
                    activate
                  </button>
                )}
              </div>
            </header>

            <div className="flex min-h-0 flex-1">
              <div
                className="relative min-w-0 flex-1"
                style={{ background: "var(--lunari-black)" }}
              >
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={NODE_TYPES}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={(_, node) => setSelectedId(node.id)}
                  onPaneClick={() => setSelectedId(null)}
                  defaultEdgeOptions={EDGE_OPTIONS}
                  deleteKeyCode={["Backspace", "Delete"]}
                  colorMode="dark"
                  fitView
                  proOptions={{ hideAttribution: true }}
                >
                  <Background color="var(--lunari-surface-elevated)" gap={24} />
                  <Controls
                    style={{
                      background: "var(--lunari-surface)",
                      border: "1px solid var(--lunari-surface-elevated)",
                    }}
                  />
                  <Panel position="top-left">
                    <div className="flex items-center gap-1 rounded-lg border border-lunari-surface-elevated bg-lunari-surface/90 p-1 backdrop-blur">
                      {PALETTE.map((kind) => {
                        const Icon = KIND_ICON[kind];
                        return (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => addNode(kind)}
                            title={`add ${kind}`}
                            className="planetarium flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-lunari-neutral-400 hover:bg-lunari-surface-elevated hover:text-lunari-cream"
                          >
                            <Icon className="h-3.5 w-3.5 stroke-[1.25]" />
                            <span>{kind}</span>
                          </button>
                        );
                      })}
                    </div>
                  </Panel>
                  {issues.length > 0 ? (
                    <Panel position="bottom-left">
                      <div className="max-w-xs rounded-md border border-lunari-surface-elevated bg-lunari-surface/90 px-3 py-2 backdrop-blur">
                        <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-lunari-gold">
                          {issues.length} to fix before live
                        </span>
                        <ul className="mt-1 space-y-0.5 text-[11px] text-lunari-neutral-400">
                          {issues.slice(0, 4).map((i, idx) => (
                            <li key={idx} className="truncate">
                              ↳ {i.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </Panel>
                  ) : null}
                </ReactFlow>
              </div>

              {selectedNode ? (
                <NodeInspector
                  node={selectedNode}
                  onChange={(patch) => updateNodeData(selectedNode.id, patch)}
                  onDelete={
                    selectedNode.type === "start"
                      ? undefined
                      : () => deleteNode(selectedNode.id)
                  }
                />
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
      {children}
    </span>
  );
}

const INPUT_CLS =
  "mt-1 w-full rounded-md border border-lunari-surface-elevated bg-lunari-black px-2 py-2 text-sm text-lunari-cream placeholder:text-lunari-neutral-500 focus:outline-none focus:ring-1 focus:ring-gen-accent";

// the branch inspector ... ways (2-4) + a per-way weight that must sum to 100.
// changing ways reseeds an even split (and the canvas prunes orphaned way edges).
function BranchFields({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const ways = Math.max(2, Math.min(4, readNum(data, "ways", 2)));
  const weights: number[] =
    Array.isArray(data.weights) && data.weights.length === ways
      ? (data.weights as unknown[]).map((w) => (typeof w === "number" ? w : 0))
      : evenWeights(ways);
  const sum = weights.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>ways</FieldLabel>
        <input
          type="number"
          min={2}
          max={4}
          value={ways}
          onChange={(e) => {
            const w = Math.max(2, Math.min(4, Number(e.target.value) || 2));
            onChange({ ways: w, weights: evenWeights(w) });
          }}
          className={INPUT_CLS}
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <FieldLabel>weights</FieldLabel>
          <span
            className={cn(
              "font-mono text-[10px] tabular-nums",
              sum === 100 ? "text-lunari-neutral-400" : "text-lunari-gold",
            )}
          >
            {sum} / 100
          </span>
        </div>
        <div className="mt-1 space-y-1.5">
          {weights.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-12 font-mono text-[10px] uppercase tracking-wide text-lunari-neutral-500">
                way {i + 1}
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={w}
                onChange={(e) => {
                  const next = [...weights];
                  next[i] = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  onChange({ weights: next });
                }}
                className={cn(INPUT_CLS, "mt-0 flex-1")}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-lunari-neutral-500">
          a weighted split ... draw one path per way, weights sum to 100.
        </p>
      </div>
    </div>
  );
}

function NodeInspector({
  node,
  onChange,
  onDelete,
}: {
  node: Node;
  onChange: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
}) {
  const kind = (node.type ?? "send") as NodeKind;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const Icon = KIND_ICON[kind];

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-lunari-surface-elevated bg-lunari-surface">
      <div className="flex items-center gap-2 border-b border-lunari-surface-elevated px-4 py-3.5">
        <Icon className="h-4 w-4 stroke-[1.25] text-gen-accent" />
        <span className="text-sm text-lunari-cream">{NODE_LABELS[kind]} node</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {kind === "start" ? (
          <p className="text-sm text-lunari-neutral-400">
            every contact enrolled in this sequence enters here. wire it to the
            first send.
          </p>
        ) : null}

        {kind === "send" ? (
          <>
            <div>
              <FieldLabel>channel</FieldLabel>
              <select
                value={readStr(data, "channel") || "email"}
                onChange={(e) => onChange({ channel: e.target.value })}
                className={INPUT_CLS}
              >
                <option value="email" className="bg-lunari-surface">
                  email
                </option>
                <option value="linkedin_dm" className="bg-lunari-surface">
                  linkedin dm
                </option>
                <option value="twitter_dm" className="bg-lunari-surface">
                  twitter dm
                </option>
              </select>
            </div>
            <div>
              <FieldLabel>subject</FieldLabel>
              <input
                value={readStr(data, "subject")}
                onChange={(e) => onChange({ subject: e.target.value })}
                placeholder="quick one about your launch"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <FieldLabel>body</FieldLabel>
              <textarea
                value={readStr(data, "body")}
                onChange={(e) => onChange({ body: e.target.value })}
                rows={7}
                placeholder="saw the move ... write the first touch in your voice. spintax + variants land next."
                className={cn(INPUT_CLS, "resize-none leading-relaxed")}
              />
            </div>
          </>
        ) : null}

        {kind === "wait" ? (
          <div className="flex gap-2">
            <div className="flex-1">
              <FieldLabel>amount</FieldLabel>
              <input
                type="number"
                min={1}
                max={365}
                value={readNum(data, "amount", 2)}
                onChange={(e) =>
                  onChange({
                    amount: Math.max(1, Math.min(365, Number(e.target.value) || 1)),
                  })
                }
                className={INPUT_CLS}
              />
            </div>
            <div className="flex-1">
              <FieldLabel>unit</FieldLabel>
              <select
                value={readStr(data, "unit") || "days"}
                onChange={(e) => onChange({ unit: e.target.value })}
                className={INPUT_CLS}
              >
                <option value="hours" className="bg-lunari-surface">
                  hours
                </option>
                <option value="days" className="bg-lunari-surface">
                  days
                </option>
                <option value="weeks" className="bg-lunari-surface">
                  weeks
                </option>
              </select>
            </div>
          </div>
        ) : null}

        {kind === "condition" ? (
          <div>
            <FieldLabel>check</FieldLabel>
            <select
              value={readStr(data, "check") || "opened"}
              onChange={(e) => onChange({ check: e.target.value })}
              className={INPUT_CLS}
            >
              <option value="opened" className="bg-lunari-surface">
                opened the last send
              </option>
              <option value="clicked" className="bg-lunari-surface">
                clicked a link
              </option>
              <option value="replied" className="bg-lunari-surface">
                replied
              </option>
              <option value="score_gte" className="bg-lunari-surface">
                ai score above threshold
              </option>
            </select>
            <p className="mt-2 text-[11px] text-lunari-neutral-500">
              wire two paths out ... one when it is true, one when it is not.
            </p>
          </div>
        ) : null}

        {kind === "branch" ? <BranchFields data={data} onChange={onChange} /> : null}

        {kind === "end" ? (
          <div>
            <FieldLabel>on end</FieldLabel>
            <select
              value={readStr(data, "action") || "completed"}
              onChange={(e) => onChange({ action: e.target.value })}
              className={INPUT_CLS}
            >
              <option value="completed" className="bg-lunari-surface">
                mark completed
              </option>
              <option value="move_stage" className="bg-lunari-surface">
                move pipeline stage
              </option>
              <option value="pause" className="bg-lunari-surface">
                pause the contact
              </option>
              <option value="add_tag" className="bg-lunari-surface">
                add a tag
              </option>
            </select>
          </div>
        ) : null}
      </div>

      {onDelete ? (
        <div className="border-t border-lunari-surface-elevated px-4 py-3">
          <button
            type="button"
            onClick={onDelete}
            className="planetarium flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-lunari-crimson hover:bg-lunari-surface-elevated"
          >
            <Trash2 className="h-3.5 w-3.5 stroke-[1.25]" />
            <span>remove node</span>
          </button>
        </div>
      ) : null}
    </aside>
  );
}
