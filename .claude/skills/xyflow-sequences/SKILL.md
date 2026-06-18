---
name: xyflow-sequences
description: Use whenever working on the visual sequence editor, xyflow nodes, sequence compilation, A/B variant testing, or pg-boss orchestration.
---

# xyflow-sequences

the visual sequence editor is the surface where clay/apollo lose. xyflow node primitives, lunari styling, gen-orchestrated.

## the node types

four core types plus terminal:

1. **send** ... email | linkedin_dm | twitter_dm channels (email only in v1)
2. **wait** ... duration (hours/days/weeks) or until_condition (next tuesday 9am, business hours only)
3. **condition** ... boolean check (opened/clicked/replied/has_field/score_gte), branches truthy/falsy
4. **branch** ... weighted N-way split (each weight 1-100, sum to 100)
5. **end** ... terminal node, marks completed | move_stage | pause | add_tag

## the data shape

graph stored as jsonb in `sequences.graph`:

```ts
type SequenceGraph = {
  nodes: Array<{
    id: string;
    type: "start" | "send" | "wait" | "condition" | "branch" | "end";
    position: { x: number; y: number };
    data: SendData | WaitData | ConditionData | BranchData | EndData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string; // 'true' | 'false' for conditions, 'a' | 'b' | 'c' for branches
  }>;
};
```

## the send node

```ts
type SendData = {
  channel: "email" | "linkedin_dm" | "twitter_dm";
  subject_spintax?: string;
  body_spintax: string;
  variants: Array<{
    id: string;
    subject_spintax?: string;
    body_spintax: string;
    weight: number;
  }>;
  schedule_window?: {
    start_hour: number;
    end_hour: number;
    timezone: "contact_local" | "user_local";
  };
  track_opens: boolean;
  track_clicks: boolean;
};
```

up to 3 a/b body variants per send node. weights must sum to 100.

## the spintax engine

`{{spin|alt1|alt2|alt3}}` syntax. parsed at send time, deterministic per (contact_id, node_id) hash so users can replay sends. variants render in a preview pane with 5 sample renders.

## the validation rules

before publish, the validator checks:

1. **no cycles** ... topological sort succeeds, every node reachable from start
2. **all paths terminate** ... every leaf is an end node
3. **send nodes have content** ... non-empty subject + body
4. **condition nodes have both branches** ... truthy AND falsy outgoing edges
5. **branch nodes weights sum to 100** ... and each branch has an outgoing edge
6. **wait nodes have valid duration or until config**

if any check fails, publish refused with inline errors on the offending nodes.

## the compilation

published sequence compiles to a pg-boss job tree:

```ts
// each contact enrollment is one tree
type CompiledJob = {
  contact_id: string;
  sequence_id: string;
  sequence_version: number;
  current_node_id: string;
  scheduled_at: Date;
  payload: Record<string, unknown>;
};
```

pg-boss handles delays, retries (exponential backoff), and idempotency. each node execution writes to `sequence_enrollments` and emits events.

## the versioning

every save creates a new entry in `sequence_versions`. enrolled contacts finish on their pinned version. new enrollments use the latest. user is warned on first edit of a live sequence: "this creates a new version. enrolled contacts finish on v3, new contacts use v4."

## the styling

every node uses lunari tokens. forest-green accent on the selected node's border. gold ring on the highest-performing variant after stats land. controls panel matches sidebar styling.

```ts
const nodeStyle = {
  background: "var(--lunari-surface)",
  border: "1px solid var(--lunari-surface-elevated)",
  borderRadius: 8,
  padding: 12,
  color: "var(--lunari-cream)",
};

const selectedNodeStyle = {
  ...nodeStyle,
  border: "1px solid var(--gen-accent)",
};
```

## the auto-layout

dagre with `rankdir: 'TB'`, `nodesep: 60`, `ranksep: 80`. "auto-layout" button reflows the graph into a clean top-to-bottom tree. user can override by manual drag.

## the keyboard shortcuts

- `space` ... pan mode
- `cmd+a` ... select all
- `delete` ... remove selected nodes/edges
- `cmd+d` ... duplicate selected
- `cmd+enter` ... validate
- `cmd+shift+p` ... publish

## the references

- xyflow docs: https://xyflow.com (formerly react-flow)
- workflow template: reactflow.dev/ui/templates/workflow-editor
- dagre integration: see `@xyflow/dagre-helper`
