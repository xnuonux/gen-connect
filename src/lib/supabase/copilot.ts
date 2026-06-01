import { createClient } from "@/lib/supabase/server";
import { KANBAN_STAGES, type ContactStage } from "@/lib/types/contact";

// the pipeline-control queries behind the Gen copilot's tools. all RLS-scoped
// to the caller via the session client ... a contact id that is not theirs
// simply matches nothing. kept here, out of the tool file, per the convention.

export type CopilotContact = {
  id: string;
  name: string | null;
  title: string | null;
  company: string | null;
  stage: string;
  score: number;
};

type ContactRow = {
  id: string;
  name: string | null;
  title: string | null;
  stage: string;
  ai_score: number | string | null;
  company: { name: string | null } | null;
};

function mapRow(r: ContactRow): CopilotContact {
  return {
    id: r.id,
    name: r.name,
    title: r.title,
    company: r.company?.name ?? null,
    stage: r.stage,
    score: Number(r.ai_score) || 0,
  };
}

// read pipeline contacts, optionally filtered by stage + a name/company/title
// search. newest first.
export async function listContactsFiltered(args: {
  stage?: string | null;
  search?: string | null;
  limit?: number;
}): Promise<CopilotContact[]> {
  const supabase = await createClient();
  let q = supabase
    .from("gc_contacts")
    .select("id, name, title, stage, ai_score, company:gc_companies(name)")
    .order("created_at", { ascending: false })
    .limit(args.limit ?? 20);
  if (args.stage) q = q.eq("stage", args.stage);

  const { data, error } = await q;
  if (error) throw new Error(`could not read pipeline ... ${error.message}`);

  let rows = ((data ?? []) as unknown as ContactRow[]).map(mapRow);
  if (args.search) {
    const n = args.search.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.name ?? "").toLowerCase().includes(n) ||
        (r.company ?? "").toLowerCase().includes(n) ||
        (r.title ?? "").toLowerCase().includes(n),
    );
  }
  return rows;
}

// the email + name for one contact, for the send tool. null if not found
// (or not the caller's, per RLS).
export async function getContactEmail(
  contactId: string,
): Promise<{ email: string | null; name: string | null } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_contacts")
    .select("email, name")
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw new Error(`could not read contact ... ${error.message}`);
  if (!data) return null;
  return {
    email: (data.email as string | null) ?? null,
    name: (data.name as string | null) ?? null,
  };
}

// move a set of contacts to a stage (incl. do_not_contact to dismiss). returns
// how many actually moved (RLS filters out any that are not the caller's).
export async function moveContactsStage(
  contactIds: string[],
  stage: ContactStage,
): Promise<{ moved: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_contacts")
    .update({ stage })
    .in("id", contactIds)
    .select("id");
  if (error) throw new Error(`could not move contacts ... ${error.message}`);
  return { moved: (data ?? []).length };
}

// add tags to a set of contacts, merging with what they already have (no
// clobber, deduped, lowercased).
export async function addContactTags(
  contactIds: string[],
  tags: string[],
): Promise<{ tagged: number }> {
  const supabase = await createClient();
  const clean = Array.from(
    new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean)),
  );
  if (clean.length === 0 || contactIds.length === 0) return { tagged: 0 };

  const { data: rows, error } = await supabase
    .from("gc_contacts")
    .select("id, tags")
    .in("id", contactIds);
  if (error) throw new Error(`could not read tags ... ${error.message}`);

  let tagged = 0;
  for (const r of (rows ?? []) as { id: string; tags: string[] | null }[]) {
    const merged = Array.from(new Set([...(r.tags ?? []), ...clean]));
    const { error: upErr } = await supabase
      .from("gc_contacts")
      .update({ tags: merged })
      .eq("id", r.id);
    if (!upErr) tagged++;
  }
  return { tagged };
}

export type PipelineSummary = {
  total: number;
  byStage: Record<string, number>;
  needsEnrichment: number;
  top: CopilotContact[];
};

// a quick read of the whole pipeline: totals, the stage breakdown, how many
// still lack a personalization hook, and the highest-scored contacts.
//
// every total here is a real count query (head: true), NOT a fetch-then-count.
// postgREST caps every response at ~1000 rows, so counting fetched rows silently
// maxes out at 1000 for any pipeline past that ... the "stuck at 1000" bug. let
// the database do the counting, and only fetch the 5 rows we actually render.
export async function pipelineSummary(): Promise<PipelineSummary> {
  const supabase = await createClient();

  // a real count of contacts in a stage (or all, when stage is omitted).
  const countStage = async (stage?: ContactStage): Promise<number> => {
    let q = supabase
      .from("gc_contacts")
      .select("id", { count: "exact", head: true });
    if (stage) q = q.eq("stage", stage);
    const { count, error } = await q;
    if (error) throw new Error(`could not summarize ... ${error.message}`);
    return count ?? 0;
  };

  const [total, needsEnrichment, stageCounts, topRows] = await Promise.all([
    countStage(),
    // no personalization hook yet ... enrichment_data->>hook null or absent.
    (async () => {
      const { count, error } = await supabase
        .from("gc_contacts")
        .select("id", { count: "exact", head: true })
        .is("enrichment_data->>hook", null);
      if (error) throw new Error(`could not summarize ... ${error.message}`);
      return count ?? 0;
    })(),
    Promise.all(
      KANBAN_STAGES.map(async (stage) => ({
        stage,
        n: await countStage(stage),
      })),
    ),
    // top scored: ordered + limited on the db side, never from a capped set.
    supabase
      .from("gc_contacts")
      .select("id, name, title, stage, ai_score, company:gc_companies(name)")
      .order("ai_score", { ascending: false })
      .limit(5),
  ]);

  const byStage: Record<string, number> = {};
  for (const { stage, n } of stageCounts) {
    if (n > 0) byStage[stage] = n;
  }

  const top = ((topRows.data ?? []) as unknown as ContactRow[]).map(mapRow);

  return { total, byStage, needsEnrichment, top };
}
