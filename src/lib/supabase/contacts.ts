import { createClient } from "@/lib/supabase/server";
import {
  KANBAN_STAGES,
  type Contact,
  type ContactStage,
} from "@/lib/types/contact";

// the columns the pipeline needs. the embedded company resolves through the
// gc_contacts.company_id foreign key.
const CONTACT_SELECT =
  "id, name, email, title, stage, ai_score, warmth_score, last_action_at, created_at, company:gc_companies(name, domain)";

// postgrest returns numeric(3,1) as a string ... coerce so the ui can do math.
function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

type ContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  title: string | null;
  stage: string;
  ai_score: number | string | null;
  warmth_score: number | string | null;
  last_action_at: string | null;
  created_at: string;
  company: { name: string | null; domain: string | null } | null;
};

function mapContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    title: row.title,
    stage: row.stage as ContactStage,
    aiScore: toNumber(row.ai_score),
    warmthScore: toNumber(row.warmth_score),
    company: row.company,
    lastActionAt: row.last_action_at,
    createdAt: row.created_at,
  };
}

// every contact on the board, newest first. excludes the do_not_contact sink.
// RLS scopes this to the signed-in user ... no user filter needed in the query.
//
// postgREST caps every response at ~1000 rows, so a single .limit(2000) select
// silently truncated the board past 1000 (the oldest cards vanished + the column
// count badges undercounted). page through with .range() until a short page so
// the board gets the COMPLETE set. ordered by (created_at, id) for a stable page
// boundary ... created_at ties (e.g. a bulk seed) would otherwise skip/dupe rows
// across pages. the board renders all cards by design; past a few thousand it
// should move to per-stage paging + virtualization.
const PAGE = 1000;
const MAX_PAGES = 50; // 50k safety bound; beyond this the board must virtualize

export async function listContacts(): Promise<Contact[]> {
  const supabase = await createClient();
  const all: ContactRow[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("gc_contacts")
      .select(CONTACT_SELECT)
      .in("stage", [...KANBAN_STAGES])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      throw new Error(`could not load contacts ... ${error.message}`);
    }

    const rows = (data ?? []) as unknown as ContactRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }

  return all.map(mapContact);
}

// move one contact to a new stage. RLS guarantees the row belongs to the
// caller ... an id that is not theirs simply updates nothing.
export async function updateContactStage(
  contactId: string,
  stage: ContactStage,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("gc_contacts")
    .update({ stage })
    .eq("id", contactId);

  if (error) {
    throw new Error(`could not move contact ... ${error.message}`);
  }
}
