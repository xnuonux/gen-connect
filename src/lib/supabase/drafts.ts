import { createClient } from "@/lib/supabase/server";
import { ANGLE_TYPES, type AngleType } from "@/lib/types/draft";
import type { FiveAngles } from "@/lib/types/draft";
import type { JudgedAngles } from "@/lib/ai/judge";

// gc_drafts + gc_draft_angles + gc_draft_judge_scores live on the shared
// LUNARI substrate (v0_1_1 migration). all gen-owned, all RLS'd to the
// caller. this module is the only place that touches them.

// postgrest returns numeric columns as strings ... coerce for the ui.
function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type DraftAngleScore = {
  relevance: number;
  voice_match: number;
  opening_strength: number;
  ask_clarity: number;
  expected_reply_rate: number;
  weighted_total: number;
  evidence: string;
  is_winner: boolean;
};

export type DraftAngleRecord = {
  id: string;
  angle_type: AngleType;
  position: number;
  subject: string;
  body: string;
  rationale: string | null;
  confidence_self_rated: number;
  score: DraftAngleScore | null;
};

export type DraftRecord = {
  id: string;
  contact_id: string;
  status: string;
  winning_angle_id: string | null;
  user_override_angle_id: string | null;
  generated_at: string | null;
  created_at: string;
  angles: DraftAngleRecord[];
};

type CreateArgs = {
  userId: string;
  contactId: string;
  objective: Record<string, unknown> | null;
  angles: FiveAngles;
  judged: JudgedAngles;
  generationModel: string;
  judgeModel: string;
  costCents: number;
};

// persist a full generation: the draft, its five angles, the five judge
// score rows, and the winning-angle pointer. four writes ... supabase has no
// client-side transaction, so the draft is inserted as status 'generating'
// and only flips to 'judged' on the final write. on a mid-sequence failure we
// throw, the draft stays 'generating', and getLatestDraftForContact (which
// filters to judged/sent) never surfaces the half-built row. the orphan rows
// are owned + RLS'd and just sit unreferenced ... a clean regenerate writes a
// fresh judged draft that wins the latest-by-created_at read.
export async function createDraftFromGeneration(
  args: CreateArgs,
): Promise<DraftRecord> {
  const { userId, contactId, objective, angles, judged } = args;
  const supabase = await createClient();

  const { data: draft, error: draftError } = await supabase
    .from("gc_drafts")
    .insert({
      user_id: userId,
      contact_id: contactId,
      objective: objective ?? {},
      status: "generating",
      generation_model: args.generationModel,
      judge_model: args.judgeModel,
      cost_cents: args.costCents,
    })
    .select("id")
    .single();

  if (draftError || !draft) {
    throw new Error(`could not save draft ... ${draftError?.message ?? "no row"}`);
  }
  const draftId = draft.id as string;

  const angleRows = ANGLE_TYPES.map((t, i) => ({
    user_id: userId,
    draft_id: draftId,
    angle_type: t,
    position: i,
    subject: angles[t].subject,
    body: angles[t].body,
    rationale: angles[t].rationale,
    confidence_self_rated: angles[t].confidence_self_rated,
  }));

  const { data: insertedAngles, error: angleError } = await supabase
    .from("gc_draft_angles")
    .insert(angleRows)
    .select("id, angle_type");

  if (angleError || !insertedAngles) {
    throw new Error(
      `could not save angles ... ${angleError?.message ?? "no rows"}`,
    );
  }

  const angleIdByType = {} as Record<AngleType, string>;
  for (const row of insertedAngles as { id: string; angle_type: AngleType }[]) {
    angleIdByType[row.angle_type] = row.id;
  }

  const scoreRows = ANGLE_TYPES.map((t) => {
    const angleId = angleIdByType[t];
    if (!angleId) {
      throw new Error(`could not save scores ... missing angle ${t}`);
    }
    const s = judged.scores[t];
    return {
      user_id: userId,
      draft_id: draftId,
      angle_id: angleId,
      relevance: s.relevance,
      voice_match: s.voice_match,
      opening_strength: s.opening_strength,
      ask_clarity: s.ask_clarity,
      expected_reply_rate: s.expected_reply_rate,
      weighted_total: judged.weighted[t],
      evidence: { summary: s.evidence },
      is_winner: t === judged.winner,
      judge_model: args.judgeModel,
    };
  });

  const { error: scoreError } = await supabase
    .from("gc_draft_judge_scores")
    .insert(scoreRows);

  if (scoreError) {
    throw new Error(`could not save scores ... ${scoreError.message}`);
  }

  // final write: set the winner AND flip status to 'judged' + stamp
  // generated_at. only now does the draft become visible to getLatest.
  const winnerAngleId = angleIdByType[judged.winner];
  const { error: winnerError } = await supabase
    .from("gc_drafts")
    .update({
      winning_angle_id: winnerAngleId,
      status: "judged",
      generated_at: new Date().toISOString(),
    })
    .eq("id", draftId);

  if (winnerError) {
    throw new Error(`could not set winner ... ${winnerError.message}`);
  }

  const assembled = await getDraftWithAngles(draftId);
  if (!assembled) {
    throw new Error("could not read back the saved draft ...");
  }
  return assembled;
}

type DraftRow = {
  id: string;
  contact_id: string;
  status: string;
  winning_angle_id: string | null;
  user_override_angle_id: string | null;
  generated_at: string | null;
  created_at: string;
};

type AngleRow = {
  id: string;
  angle_type: string;
  position: number;
  subject: string;
  body: string;
  rationale: string | null;
  confidence_self_rated: number | string | null;
};

type ScoreRow = {
  angle_id: string;
  relevance: number | string | null;
  voice_match: number | string | null;
  opening_strength: number | string | null;
  ask_clarity: number | string | null;
  expected_reply_rate: number | string | null;
  weighted_total: number | string | null;
  evidence: { summary?: string } | null;
  is_winner: boolean;
};

// load one draft with its angles + scores, assembled. null if not found
// (or not the caller's, per RLS).
export async function getDraftWithAngles(
  draftId: string,
): Promise<DraftRecord | null> {
  const supabase = await createClient();

  const { data: draft, error: draftError } = await supabase
    .from("gc_drafts")
    .select(
      "id, contact_id, status, winning_angle_id, user_override_angle_id, generated_at, created_at",
    )
    .eq("id", draftId)
    .maybeSingle();

  if (draftError) {
    throw new Error(`could not load draft ... ${draftError.message}`);
  }
  if (!draft) return null;

  const [{ data: angleData, error: angleError }, { data: scoreData, error: scoreError }] =
    await Promise.all([
      supabase
        .from("gc_draft_angles")
        .select(
          "id, angle_type, position, subject, body, rationale, confidence_self_rated",
        )
        .eq("draft_id", draftId)
        .order("position", { ascending: true }),
      supabase
        .from("gc_draft_judge_scores")
        .select(
          "angle_id, relevance, voice_match, opening_strength, ask_clarity, expected_reply_rate, weighted_total, evidence, is_winner",
        )
        .eq("draft_id", draftId),
    ]);

  if (angleError) {
    throw new Error(`could not load angles ... ${angleError.message}`);
  }
  if (scoreError) {
    throw new Error(`could not load scores ... ${scoreError.message}`);
  }

  const scoreByAngle = new Map<string, ScoreRow>();
  for (const s of (scoreData ?? []) as ScoreRow[]) {
    scoreByAngle.set(s.angle_id, s);
  }

  const angles: DraftAngleRecord[] = ((angleData ?? []) as AngleRow[]).map(
    (a) => {
      const s = scoreByAngle.get(a.id);
      return {
        id: a.id,
        angle_type: a.angle_type as AngleType,
        position: a.position,
        subject: a.subject,
        body: a.body,
        rationale: a.rationale,
        confidence_self_rated: toNumber(a.confidence_self_rated),
        score: s
          ? {
              relevance: toNumber(s.relevance),
              voice_match: toNumber(s.voice_match),
              opening_strength: toNumber(s.opening_strength),
              ask_clarity: toNumber(s.ask_clarity),
              expected_reply_rate: toNumber(s.expected_reply_rate),
              weighted_total: toNumber(s.weighted_total),
              evidence: s.evidence?.summary ?? "",
              is_winner: s.is_winner,
            }
          : null,
      };
    },
  );

  const row = draft as DraftRow;
  return {
    id: row.id,
    contact_id: row.contact_id,
    status: row.status,
    winning_angle_id: row.winning_angle_id,
    user_override_angle_id: row.user_override_angle_id,
    generated_at: row.generated_at,
    created_at: row.created_at,
    angles,
  };
}

// the most recent draft for a contact, or null if none yet.
export async function getLatestDraftForContact(
  contactId: string,
): Promise<DraftRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_drafts")
    .select("id")
    .eq("contact_id", contactId)
    .in("status", ["judged", "sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`could not load latest draft ... ${error.message}`);
  }
  if (!data) return null;
  return getDraftWithAngles(data.id as string);
}

// claim a judged draft for sending ... a compare-and-set (only from 'judged' to
// 'sent') so two concurrent first-touches can never both win: exactly one flips the
// row and proceeds, every other attempt loses the cas and is refused. this is the
// SERVER-side idempotency behind the studio's send-lock (which is only client state
// and resets on reload), so the same cold email can't be double-sent to a real
// prospect. RLS scopes the update to the caller's draft. returns true if this call
// won the claim.
export async function claimDraftForSend(draftId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_drafts")
    .update({ status: "sent" })
    .eq("id", draftId)
    .eq("status", "judged")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`could not claim that draft ... ${error.message}`);
  return !!data;
}

// release a claim back to 'judged' ... ONLY when the send was cleanly gated before
// any dispatch (blocked / suppressed), so the user can fix the gate and retry. never
// called after a throw (a throw may mean the email already went out, so we keep the
// claim and refuse a retry ... at-most-once beats a double-send).
export async function releaseDraftClaim(draftId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("gc_drafts")
    .update({ status: "judged" })
    .eq("id", draftId)
    .eq("status", "sent");
}

// record the user picking an angle other than the judge's winner. feeds the
// learning loop later. RLS scopes the update to the caller's draft.
export async function setUserOverride(
  draftId: string,
  angleId: string,
): Promise<void> {
  const supabase = await createClient();

  // the angle pointer has no hard fk (it would be circular with the draft),
  // so guard it application-side: confirm the angle is actually part of this
  // draft. RLS scopes the read to the caller, so a foreign or bogus angle id
  // returns null and the override is rejected ... no junk pointer lands in
  // the row the learning loop will read.
  const { data: angle, error: angleError } = await supabase
    .from("gc_draft_angles")
    .select("id")
    .eq("id", angleId)
    .eq("draft_id", draftId)
    .maybeSingle();

  if (angleError) {
    throw new Error(`could not check that angle ... ${angleError.message}`);
  }
  if (!angle) {
    throw new Error("that angle isn't part of this draft ...");
  }

  const { error } = await supabase
    .from("gc_drafts")
    .update({ user_override_angle_id: angleId })
    .eq("id", draftId);

  if (error) {
    throw new Error(`could not save your pick ... ${error.message}`);
  }
}
