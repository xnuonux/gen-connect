import { createClient } from "@/lib/supabase/server";
import {
  EMPTY_GRAPH,
  type SequenceGraph,
  type SequenceRecord,
  type SequenceStatus,
  type SequenceSummary,
} from "@/lib/types/sequence";

// the sequences data layer ... RLS-scoped CRUD over gc_sequences. the editor reads
// + writes the graph jsonb; every save snapshots into gc_sequence_versions +
// bumps version (enrolled contacts finish on their pinned version, later).

type Row = {
  id: string;
  name: string;
  status: SequenceStatus;
  version: number | null;
  enrolled_count: number | null;
  reply_count: number | null;
  graph: SequenceGraph | null;
  updated_at: string;
};

const COLS =
  "id, name, status, version, enrolled_count, reply_count, graph, updated_at";

function graphOf(g: SequenceGraph | null): SequenceGraph {
  if (g && Array.isArray(g.nodes) && Array.isArray(g.edges)) return g;
  return EMPTY_GRAPH;
}

function summarize(r: Row): SequenceSummary {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    version: r.version ?? 1,
    enrolledCount: r.enrolled_count ?? 0,
    replyCount: r.reply_count ?? 0,
    nodeCount: graphOf(r.graph).nodes.length,
    updatedAt: r.updated_at,
  };
}

async function userId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function listSequences(): Promise<SequenceSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_sequences")
    .select(COLS)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(summarize);
}

export async function getSequence(id: string): Promise<SequenceRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_sequences")
    .select(COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Row;
  return { ...summarize(r), graph: graphOf(r.graph) };
}

// a fresh sequence opens with a single start node ... the editor builds onward.
export async function createSequence(name: string): Promise<SequenceRecord | null> {
  const uid = await userId();
  if (!uid) return null;
  const supabase = await createClient();
  const graph: SequenceGraph = {
    nodes: [
      { id: "start", type: "start", position: { x: 240, y: 40 }, data: {} },
    ],
    edges: [],
  };
  const { data, error } = await supabase
    .from("gc_sequences")
    .insert({ user_id: uid, name, graph, status: "draft" })
    .select(COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "create sequence failed");
  const r = data as Row;
  return { ...summarize(r), graph: graphOf(r.graph) };
}

// save the graph (+ optional name/status). bumps version + snapshots the prior
// graph into gc_sequence_versions. two writes ... fine for single-user editing.
export async function saveSequence(args: {
  id: string;
  graph: SequenceGraph;
  name?: string;
  status?: SequenceStatus;
}): Promise<SequenceRecord | null> {
  const uid = await userId();
  if (!uid) return null;
  const supabase = await createClient();

  const { data: prior } = await supabase
    .from("gc_sequences")
    .select("version")
    .eq("id", args.id)
    .maybeSingle();
  const nextVersion = (((prior as { version: number | null } | null)?.version) ?? 1) + 1;

  const patch: Record<string, unknown> = {
    graph: args.graph,
    version: nextVersion,
  };
  if (args.name !== undefined) patch.name = args.name;
  if (args.status !== undefined) patch.status = args.status;

  const { data, error } = await supabase
    .from("gc_sequences")
    .update(patch)
    .eq("id", args.id)
    .select(COLS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "save sequence failed");

  // snapshot (best-effort) ... a missed snapshot never blocks the save.
  await supabase.from("gc_sequence_versions").insert({
    user_id: uid,
    sequence_id: args.id,
    version: nextVersion,
    graph: args.graph,
  });

  const r = data as Row;
  return { ...summarize(r), graph: graphOf(r.graph) };
}

// enroll contacts into a sequence ... the execution spine. inserts
// gc_sequence_enrollments rows at the start node, dedupes against any already-
// active enrollment, recomputes enrolled_count from the live count (derived, so it
// converges), and advances eligible contacts (cold/enriched/drafted) to
// 'sequenced' without ever pulling a replied/booked/closed contact backwards. the
// pg-boss executor (railway, deferred) picks these rows up later; for now they
// populate the campaigns ledger + the pipeline stage. RLS-scoped on every table.
export async function enrollContacts(args: {
  sequenceId: string;
  contactIds: string[];
}): Promise<{ enrolled: number }> {
  const uid = await userId();
  if (!uid) return { enrolled: 0 };
  const supabase = await createClient();

  const seq = await getSequence(args.sequenceId);
  if (!seq) throw new Error("sequence not found");
  const startId = seq.graph.nodes.find((n) => n.type === "start")?.id ?? null;

  const { data: existing } = await supabase
    .from("gc_sequence_enrollments")
    .select("contact_id")
    .eq("sequence_id", args.sequenceId)
    .eq("status", "active")
    .in("contact_id", args.contactIds);
  const already = new Set(
    ((existing ?? []) as { contact_id: string }[]).map((r) => r.contact_id),
  );
  const targets = args.contactIds.filter((id) => !already.has(id));
  if (targets.length === 0) return { enrolled: 0 };

  const rows = targets.map((cid) => ({
    user_id: uid,
    sequence_id: args.sequenceId,
    contact_id: cid,
    version: seq.version,
    current_node_id: startId,
    status: "active",
  }));
  const { error } = await supabase.from("gc_sequence_enrollments").insert(rows);
  if (error) throw new Error(error.message);

  const { count } = await supabase
    .from("gc_sequence_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("sequence_id", args.sequenceId)
    .eq("status", "active");
  await supabase
    .from("gc_sequences")
    .update({ enrolled_count: count ?? seq.enrolledCount + rows.length })
    .eq("id", args.sequenceId);

  await supabase
    .from("gc_contacts")
    .update({ stage: "sequenced" })
    .in("id", targets)
    .in("stage", ["cold", "enriched", "drafted"]);

  return { enrolled: rows.length };
}
