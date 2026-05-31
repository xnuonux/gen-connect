import { createClient } from "@/lib/supabase/server";
import {
  GEN_CONNECT_EXTRACTOR,
  VOICE_ACTIVATION_THRESHOLD,
  VOICE_EXTRACTION_MODEL,
  type VoiceFeatures,
  type VoiceSample,
} from "@/lib/types/voice";

// public.voice_profiles lives on the shared LUNARI substrate (defined in
// the v17_8_6 migration). gen connect column ownership:
//
//   gen writes: outreach_overrides, outreach_samples_count,
//               active_for_outreach + base columns (last writer wins on
//               extraction)
//   gen reads:  everything
//   gen never touches: writing_overrides, writing_samples_count,
//                      active_for_writing (nova press owns those)
//
// extraction_history is append-only by both products, trimmed to last 5.

// the read shape gen connect cares about. base columns + the gen-owned
// derived fields. ignores nova-only columns.
type VoiceProfileReadRow = {
  user_id: string;
  register: string | null;
  punctuation_style: Record<string, unknown> | null;
  sentence_length_avg: number | null;
  sentence_length_variance: number | null;
  vocabulary_signature: string | null;
  formality_score: number | string | null;
  opening_patterns: string[] | null;
  closing_patterns: string[] | null;
  avoided_phrases: string[] | null;
  idiosyncratic_phrases: string[] | null;
  emoji_signature: Record<string, unknown> | null;
  outreach_overrides: Record<string, unknown> | null;
  outreach_samples_count: number;
  active_for_outreach: boolean;
  last_extracted_at: string | null;
  last_extracted_by: string | null;
  extraction_model: string | null;
  extraction_confidence: number | string | null;
};

export type VoiceProfile = VoiceProfileReadRow;

// load the signed-in user's voice profile. returns null if no row exists
// yet (extraction never happened). RLS scopes the lookup ... no user_id
// filter needed.
export async function getVoiceProfile(): Promise<VoiceProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("voice_profiles")
    .select(
      "user_id, register, punctuation_style, sentence_length_avg, sentence_length_variance, vocabulary_signature, formality_score, opening_patterns, closing_patterns, avoided_phrases, idiosyncratic_phrases, emoji_signature, outreach_overrides, outreach_samples_count, active_for_outreach, last_extracted_at, last_extracted_by, extraction_model, extraction_confidence",
    )
    .maybeSingle();

  if (error) {
    throw new Error(`could not load voice profile ... ${error.message}`);
  }

  return data as VoiceProfile | null;
}

// trim a jsonb extraction_history array to the last N entries. matches the
// app-level convention from the substrate brief.
function trimHistory(
  history: unknown,
  next: Record<string, unknown>,
  keep = 5,
): Record<string, unknown>[] {
  const prior = Array.isArray(history)
    ? (history as Record<string, unknown>[])
    : [];
  return [...prior, next].slice(-keep);
}

// write a fresh extraction to voice_profiles. on first run this inserts;
// on a re-extract it updates. either way the substrate's tg_set_updated_at
// trigger touches updated_at for us.
//
// only gen-owned + base columns are written ... we never touch
// writing_overrides, writing_samples_count, or active_for_writing.
export async function upsertVoiceProfileFromExtraction(args: {
  userId: string;
  features: VoiceFeatures;
  samples: VoiceSample[];
}): Promise<VoiceProfile> {
  const { userId, features, samples } = args;
  const supabase = await createClient();

  // grab the prior row so we can append source_samples + extraction_history
  // without overwriting. one extra round trip ... fine for v1, the
  // onboarding flow is not hot path.
  //
  // note: this is a read-modify-write, not atomic. two concurrent saves for
  // the same user (double-submit, re-onboarding in two tabs) could both read
  // the same prior and last-writer-wins would drop one batch's appended
  // samples + understate the count. low likelihood on this single-user
  // onboarding path and the UI unmounts the confirm button on 'saving', so
  // v1 accepts it. v1.5 moves the increment + array append into an atomic
  // postgres rpc on the shared substrate.
  const { data: prior, error: priorError } = await supabase
    .from("voice_profiles")
    .select(
      "source_samples, extraction_history, outreach_samples_count, outreach_overrides",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (priorError) {
    throw new Error(
      `could not read prior voice profile ... ${priorError.message}`,
    );
  }

  const priorSamples = Array.isArray(prior?.source_samples)
    ? (prior.source_samples as Record<string, unknown>[])
    : [];

  // dedupe on normalized body so re-pasting the same emails on a re-extract
  // doesn't inflate the count or duplicate the corpus. only genuinely-new
  // samples append and count toward the activation threshold.
  const priorBodies = new Set(
    priorSamples
      .map((s) => (typeof s.body === "string" ? s.body.trim() : ""))
      .filter(Boolean),
  );
  const freshSamples = samples.filter(
    (sample) => !priorBodies.has(sample.body.trim()),
  );

  const newSampleEntries = freshSamples.map((sample, i) => ({
    source: "gen_connect",
    added_at: new Date().toISOString(),
    sequence: priorSamples.length + i + 1,
    subject: sample.subject ?? null,
    body: sample.body,
  }));

  const allSamples = [...priorSamples, ...newSampleEntries];
  const outreachSamplesCount =
    (prior?.outreach_samples_count ?? 0) + freshSamples.length;

  // salutation_style + signoff_style are gen's outreach-specific style
  // tweaks ... they belong in the gen-owned outreach_overrides jsonb, not
  // the shared opening_patterns/closing_patterns array columns. merge so we
  // don't clobber any other override (subject line style, cta style) a later
  // chunk writes here.
  const priorOverrides =
    prior?.outreach_overrides && typeof prior.outreach_overrides === "object"
      ? (prior.outreach_overrides as Record<string, unknown>)
      : {};
  const outreachOverrides = {
    ...priorOverrides,
    salutation_style: features.salutation_style,
    signoff_style: features.signoff_style,
  };

  const extractionHistoryEntry = {
    at: new Date().toISOString(),
    product: GEN_CONNECT_EXTRACTOR,
    model: VOICE_EXTRACTION_MODEL,
    sample_count: samples.length,
    snapshot: {
      register: features.register,
      sentence_length_avg: features.sentence_length_avg,
      formality_score: features.formality_score,
      idiosyncratic_phrases: features.idiosyncratic_phrases,
    },
  };

  const nextHistory = trimHistory(
    prior?.extraction_history,
    extractionHistoryEntry,
  );

  const row = {
    user_id: userId,
    // base columns ... last writer wins, gen owns this write
    register: features.register,
    punctuation_style: features.punctuation_style,
    sentence_length_avg: features.sentence_length_avg,
    sentence_length_variance: features.sentence_length_variance,
    vocabulary_signature: features.vocabulary_signature,
    formality_score: features.formality_score,
    opening_patterns: features.opening_patterns,
    closing_patterns: features.closing_patterns,
    avoided_phrases: features.avoided_phrases,
    idiosyncratic_phrases: features.idiosyncratic_phrases,
    emoji_signature: features.emoji_signature,
    source_samples: allSamples,
    last_extracted_at: new Date().toISOString(),
    last_extracted_by: GEN_CONNECT_EXTRACTOR,
    extraction_model: VOICE_EXTRACTION_MODEL,
    extraction_confidence: 1.0,
    extraction_history: nextHistory,
    // gen-only columns
    outreach_overrides: outreachOverrides,
    outreach_samples_count: outreachSamplesCount,
    active_for_outreach: outreachSamplesCount >= VOICE_ACTIVATION_THRESHOLD,
  };

  const { data, error } = await supabase
    .from("voice_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select(
      "user_id, register, punctuation_style, sentence_length_avg, sentence_length_variance, vocabulary_signature, formality_score, opening_patterns, closing_patterns, avoided_phrases, idiosyncratic_phrases, emoji_signature, outreach_overrides, outreach_samples_count, active_for_outreach, last_extracted_at, last_extracted_by, extraction_model, extraction_confidence",
    )
    .single();

  if (error || !data) {
    throw new Error(
      `could not save voice profile ... ${error?.message ?? "unknown error"}`,
    );
  }

  return data as VoiceProfile;
}
