import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { compileRun } from "@/lib/sequences/compile";
import { dueSteps } from "@/lib/sequences/due";
import { pickSend } from "@/lib/sequences/variants";
import { renderSample } from "@/lib/sequences/spintax";
import { guardedSend } from "@/lib/email/guarded-send";
import { IS_LIVE } from "@/lib/email/send";
import type { SequenceGraph } from "@/lib/types/sequence";

// the sequence executor ... the piece that was deferred to a railway pg-boss worker
// so long the campaigns tab dead-ended at enrollment. this is the in-app driver: it
// walks each active enrollment's compiled run, fires every send whose offset has come
// due since enrollment, advances current_node_id, and marks the enrollment completed
// when it reaches an end. it reuses the SAME compileRun the editor previews with and
// the SAME guardedSend every other send routes through, so the test-mode redirect,
// suppression gate, jurisdiction gate, unsubscribe headers + the ledger all apply
// unchanged. no new infra, no new table ... the enrollment row IS the checkpoint.
//
// it is rls-scoped through the session client, so it only ever advances the signed-in
// user's own enrollments. a user-triggered "run due sends now" tick calls it today
// (test-mode-safe). the autonomous cross-user cron (service-role + a schedule) stays a
// single go/no-go ... this runner is the body it would call, proven in-app first.

export type EnrollmentTickResult = {
  scanned: number; // active enrollments looked at
  advanced: number; // enrollments whose cursor moved
  sent: number; // emails actually handed to the sender (test or live)
  completed: number; // enrollments that reached an end
  failed: number; // hard-blocked (no address / suppressed / jurisdiction)
  skipped: number; // non-email or empty send nodes passed over
  mode: "test" | "live";
  note?: string;
};

// defensive per-tick ceilings ... a runaway graph or a huge enrollment set can never
// stampede the shared sender or the db from a single tick.
const MAX_ENROLLMENTS = 200;
const MAX_SENDS = 60;

type EnrollmentRow = {
  id: string;
  sequence_id: string;
  contact_id: string;
  version: number;
  current_node_id: string | null;
  created_at: string;
};

type ContactLite = {
  id: string;
  email: string | null;
  name: string | null;
  title: string | null;
  enrichment_data: Record<string, unknown> | null;
};

// a stable per-contact spintax seed so the same contact always renders the same
// variant (deterministic, not Math.random ... a/b splits stay consistent per person).
function seedFrom(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 997;
}

// resolve the {contact.*} slots from the real record so a send never ships a literal
// "{contact.first_name}". unknown slots stay visible (renderSample's honest default),
// which under the test-mode redirect only the sender ever sees.
function slotValues(c: ContactLite): Record<string, string> {
  const v: Record<string, string> = {};
  const name = (c.name ?? "").trim();
  if (name) {
    v["{contact.name}"] = name.toLowerCase();
    const first = name.split(/\s+/)[0] ?? "";
    if (first) v["{contact.first_name}"] = first.toLowerCase();
  }
  if (c.title) v["{contact.title}"] = String(c.title).toLowerCase();
  const ed = c.enrichment_data ?? {};
  const company = typeof ed.company === "string" ? ed.company : "";
  if (company) v["{contact.company}"] = company.toLowerCase();
  return v;
}

type Db = SupabaseClient;

// claim a step by compare-and-set: move current_node_id from `from` to `to` ONLY if
// the row still sits at `from` (and belongs to `userId`). returns true iff this call
// won the move. this is the concurrency guard that makes the executor at-most-once ...
// two overlapping ticks (two tabs, or the cron overlapping a manual "run due sends")
// both read the same cursor, but only one wins the cas and gets to send; the loser
// sees false and bails. a db error returns false (treated as a lost claim), so a flaky
// write never advances the cursor past an unsent step. the user_id filter is what
// keeps the cas safe under the service-role client (which bypasses rls).
async function casAdvance(
  db: Db,
  userId: string,
  id: string,
  from: string | null,
  to: string | null,
): Promise<boolean> {
  const base = db
    .from("gc_sequence_enrollments")
    .update({ current_node_id: to })
    .eq("id", id)
    .eq("user_id", userId);
  const guarded =
    from === null
      ? base.is("current_node_id", null)
      : base.eq("current_node_id", from);
  const { data, error } = await guarded.select("id").maybeSingle();
  if (error) return false;
  return !!data;
}

export async function advanceDueEnrollments(
  opts: {
    sequenceId?: string;
    contactId?: string;
    nowMs?: number;
    // service mode: the autonomous cron passes an injected service-role client AND
    // the user to run for. rls is then bypassed, so EVERY query below is scoped by
    // this userId explicitly. omit both and it runs session/rls-scoped as before.
    db?: Db;
    userId?: string;
  } = {},
): Promise<EnrollmentTickResult> {
  const supabase = opts.db ?? (await createClient());
  let userId = opts.userId ?? null;
  if (!userId) {
    const { data: auth } = await supabase.auth.getUser();
    userId = auth.user?.id ?? null;
  }
  const mode: "test" | "live" = IS_LIVE ? "live" : "test";
  const base: EnrollmentTickResult = {
    scanned: 0,
    advanced: 0,
    sent: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    mode,
  };
  if (!userId) return { ...base, note: "not signed in." };

  const now = opts.nowMs ?? Date.now();

  // 1. active enrollments (scoped by user_id ... redundant under rls, REQUIRED under
  //    the service-role client), oldest first, optionally narrowed to one sequence or
  //    one contact for a targeted tick.
  let q = supabase
    .from("gc_sequence_enrollments")
    .select("id, sequence_id, contact_id, version, current_node_id, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(MAX_ENROLLMENTS);
  if (opts.sequenceId) q = q.eq("sequence_id", opts.sequenceId);
  if (opts.contactId) q = q.eq("contact_id", opts.contactId);
  const { data: enrollRows, error: enrollErr } = await q;
  if (enrollErr) throw new Error(enrollErr.message);
  const enrollments = (enrollRows ?? []) as EnrollmentRow[];
  base.scanned = enrollments.length;
  if (enrollments.length === 0) {
    return { ...base, note: "no active enrollments." };
  }

  // 2. the sequences behind them ... only an 'active' sequence ever sends (a paused or
  //    draft campaign holds its enrollments in place, never dead-drops a send).
  const seqIds = [...new Set(enrollments.map((e) => e.sequence_id))];
  const { data: seqRows } = await supabase
    .from("gc_sequences")
    .select("id, status, graph")
    .eq("user_id", userId)
    .in("id", seqIds);
  const seqById = new Map<
    string,
    { status: string; graph: SequenceGraph | null }
  >();
  for (const s of (seqRows ?? []) as {
    id: string;
    status: string;
    graph: SequenceGraph | null;
  }[]) {
    seqById.set(s.id, { status: s.status, graph: s.graph });
  }

  // 3. the contacts ... email (the send target) + the slot source fields.
  const contactIds = [...new Set(enrollments.map((e) => e.contact_id))];
  const { data: contactRows } = await supabase
    .from("gc_contacts")
    .select("id, email, name, title, enrichment_data")
    .eq("user_id", userId)
    .in("id", contactIds);
  const contactById = new Map<string, ContactLite>();
  for (const c of (contactRows ?? []) as ContactLite[]) contactById.set(c.id, c);

  // 4. pinned graph memo ... an enrollment runs on the version it was enrolled on, so
  //    an edit to a live sequence never rewrites a contact's journey mid-flight. fall
  //    back to the live graph only when the snapshot is missing.
  const graphCache = new Map<string, SequenceGraph | null>();
  async function graphFor(
    seqId: string,
    version: number,
  ): Promise<SequenceGraph | null> {
    const key = `${seqId}:${version}`;
    const cached = graphCache.get(key);
    if (cached !== undefined) return cached;
    const { data: snap } = await supabase
      .from("gc_sequence_versions")
      .select("graph")
      .eq("user_id", userId)
      .eq("sequence_id", seqId)
      .eq("version", version)
      .maybeSingle();
    let g = (snap?.graph as SequenceGraph | undefined) ?? null;
    if (!g) g = seqById.get(seqId)?.graph ?? null;
    graphCache.set(key, g);
    return g;
  }

  let sends = 0;
  for (const e of enrollments) {
    if (sends >= MAX_SENDS) {
      base.note = "hit the per-tick send ceiling ... run again to continue.";
      break;
    }
    const seq = seqById.get(e.sequence_id);
    if (!seq || seq.status !== "active") continue;
    const graph = await graphFor(e.sequence_id, e.version);
    if (!graph) continue;
    const contact = contactById.get(e.contact_id);
    const email = contact?.email ?? null;

    const run = compileRun(graph);
    const steps = run.steps;
    if (steps.length === 0) continue;
    const nodeData = new Map(graph.nodes.map((n) => [n.id, n.data ?? {}]));
    const elapsed = now - new Date(e.created_at).getTime();

    // start the cursor at the row's REAL current_node_id (not a default), so the
    // first compare-and-set matches the row exactly.
    let cursor: string | null = e.current_node_id;
    let status: "active" | "completed" | "failed" = "active";
    let moved = false;
    const seed = seedFrom(e.contact_id);
    const slots = contact ? slotValues(contact) : {};

    const due = dueSteps(steps, e.current_node_id, elapsed);
    for (const step of due) {
      if (sends >= MAX_SENDS) break; // don't burst past the per-tick ceiling mid-run

      // claim the step BEFORE any side effect. losing the cas means another tick/tab/
      // worker owns this enrollment ... bail so a send is never double-fired. claiming
      // before the send is what makes delivery at-most-once: nothing after the claim
      // retries, and for cold email a missed follow-up beats a duplicate to a prospect.
      const claimed = await casAdvance(supabase, userId, e.id, cursor, step.nodeId);
      if (!claimed) break; // raced ... someone else has this enrollment this tick
      cursor = step.nodeId;
      moved = true;

      if (step.kind === "send") {
        const data = nodeData.get(step.nodeId) ?? {};
        const channel =
          typeof data.channel === "string" ? data.channel : "email";
        if (channel !== "email") {
          // linkedin/twitter dm nodes aren't wired to a sender ... pass over them
          // (already claimed) and keep walking the email path.
          base.skipped += 1;
          continue;
        }
        if (!email) {
          status = "failed"; // no address ... this contact can't be mailed
          base.failed += 1;
          break;
        }
        // a/b: pick the arm this contact lands in (deterministic off its seed) before
        // rendering, so an authored + validated split actually fires instead of always
        // shipping the primary body. no variants => pickSend returns the primary.
        const chosen = pickSend(
          {
            subject: typeof data.subject === "string" ? data.subject : "",
            body: typeof data.body === "string" ? data.body : "",
          },
          data.variants,
          seed,
        );
        const subject = renderSample(chosen.subject, seed, slots);
        const body = renderSample(chosen.body, seed, slots);
        if (!subject && !body) {
          base.skipped += 1;
          continue;
        }
        sends += 1;
        let res;
        try {
          res = await guardedSend({
            userId,
            contactId: e.contact_id,
            to: email,
            subject,
            body,
            kind: "cold",
            db: opts.db,
          });
        } catch {
          // the step is already claimed, so we do NOT retry ... at-most-once. the
          // dispatch may have gone out before the throw; a duplicate is the worse sin.
          base.skipped += 1;
          continue;
        }
        if (res.sent) {
          base.sent += 1;
          continue;
        }
        if (res.blocked || res.suppressed) {
          // a hard gate (suppressed / jurisdiction / unverified live domain) ... this
          // enrollment can't proceed. stop it cleanly rather than retry forever.
          status = "failed";
          base.failed += 1;
          break;
        }
        // other clean not-sent ... already claimed, so no retry.
        base.skipped += 1;
        continue;
      }

      // wait / condition / branch / start ... claimed, no side effect.
      if (step.kind === "end") {
        status = "completed";
        break;
      }
    }

    if (!moved) continue; // nothing due (or lost the claim on the first step)
    base.advanced += 1;
    if (status !== "active") {
      // the cursor is already persisted per-step by the cas; only the terminal
      // status needs writing now.
      await supabase
        .from("gc_sequence_enrollments")
        .update({ status })
        .eq("id", e.id)
        .eq("user_id", userId);
      if (status === "completed") base.completed += 1;
    }
  }

  return base;
}
