import { z } from "zod";

// shape extracted by sonnet 4.6 from the user's outreach samples. matches
// the base columns of public.voice_profiles on the shared LUNARI substrate
// (column ownership: gen connect can write any of these on extraction, last
// writer wins per the substrate convention).
//
// opening_patterns + closing_patterns are flat string arrays here because
// the shared columns are jsonb arrays (default '[]'). the qualitative
// salutation_style + signoff_style the model also surfaces get persisted
// into the gen-owned outreach_overrides column by the supabase layer, not
// the shared array columns.
//
// outreach_samples_count + active_for_outreach are derived by the supabase
// layer, not produced by the model.
export const VoiceFeaturesSchema = z.object({
  register: z
    .enum(["lowercase", "mixedcase", "formal"])
    .describe(
      "the case + capitalization habit. lowercase means the user types in lowercase by default.",
    ),
  punctuation_style: z
    .object({
      uses_em_dashes: z.boolean(),
      pause_marker: z
        .string()
        .describe(
          "what the user reaches for to mark a pause. typically '...', a comma, or an em-dash.",
        ),
      exclamation_use: z.enum(["rare", "occasional", "frequent"]),
    })
    .describe("how the user punctuates pauses, emphasis, and stops."),
  sentence_length_avg: z
    .number()
    .int()
    .min(3)
    .max(60)
    .describe("average words per sentence across the samples."),
  sentence_length_variance: z
    .number()
    .min(0)
    .describe(
      "spread around the avg. low variance means uniform rhythm; high variance means cadence.",
    ),
  vocabulary_signature: z
    .string()
    .min(20)
    .max(280)
    .describe(
      "one-line summary of the user's vocabulary character. specific words, register, the feel.",
    ),
  formality_score: z
    .number()
    .min(0)
    .max(10)
    .describe(
      "0 = pure friend-text, 5 = peer-to-peer casual, 10 = formal business letter.",
    ),
  opening_patterns: z
    .array(z.string())
    .max(5)
    .describe(
      "how the user actually starts a cold email. example opener lines, not abstract categories. flat array ... maps straight to the shared voice_profiles.opening_patterns jsonb array column.",
    ),
  salutation_style: z
    .string()
    .describe(
      "e.g., 'no salutation, open with the observation', 'hi {name}', 'lowercase first name + comma'. persisted into outreach_overrides, not the shared array column.",
    ),
  closing_patterns: z
    .array(z.string())
    .max(5)
    .describe(
      "how the user closes ... example closer lines, not categories. flat array ... maps straight to the shared voice_profiles.closing_patterns jsonb array column.",
    ),
  signoff_style: z
    .string()
    .describe(
      "e.g., 'no sign-off', 'lowercase first name only', 'best, {name}'. persisted into outreach_overrides, not the shared array column.",
    ),
  avoided_phrases: z
    .array(z.string())
    .max(15)
    .describe(
      "phrases that DON'T appear in the corpus and read as off-voice if added. negative constraints are powerful.",
    ),
  idiosyncratic_phrases: z
    .array(z.string())
    .max(10)
    .describe(
      "top phrases the user reaches for. signatures, tics, the bits that make it sound like them. no floor ... a thin or flat corpus may only surface one or two, and a hard minimum would throw on a valid extraction.",
    ),
  emoji_signature: z
    .object({
      frequency: z
        .number()
        .min(0)
        .max(1)
        .describe("0 = never uses emoji, 1 = every message has them."),
      top_used: z
        .array(z.string())
        .max(5)
        .describe(
          "which emoji actually appear. include even if frequency is low.",
        ),
    })
    .describe("emoji use across the corpus."),
});

export type VoiceFeatures = z.infer<typeof VoiceFeaturesSchema>;

// the raw input ... a single sample of outreach copy. subject is optional
// since some users paste body-only.
export const VoiceSampleSchema = z.object({
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(20).max(4000),
});

export type VoiceSample = z.infer<typeof VoiceSampleSchema>;

// the input to extractVoice ... a small array of outreach samples.
export const ExtractVoiceInputSchema = z.object({
  samples: z.array(VoiceSampleSchema).min(3).max(15),
});

export type ExtractVoiceInput = z.infer<typeof ExtractVoiceInputSchema>;

// activation threshold per the spec: 10 outreach samples for per-user
// voice match. below threshold, the dom prior fallback kicks in.
export const VOICE_ACTIVATION_THRESHOLD = 10;

// minimum samples we accept for a first extraction. below this the
// extraction won't have enough signal to be sharp.
export const VOICE_MIN_SAMPLES = 3;

// what gen connect tells the substrate about which product wrote a given
// extraction history entry. matches the convention in
// voice_profiles.last_extracted_by + extraction_history[].product.
export const GEN_CONNECT_EXTRACTOR = "gen_connect" as const;

// the model used for extraction. surfaces in extraction_history for audit.
export const VOICE_EXTRACTION_MODEL = "claude-sonnet-4.6" as const;
