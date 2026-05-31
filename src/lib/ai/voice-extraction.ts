import { generateObject } from "ai";
import { models } from "@/lib/ai/anthropic";
import {
  VoiceFeaturesSchema,
  type VoiceFeatures,
  type VoiceSample,
} from "@/lib/types/voice";

// extract a structured VoiceFeatures profile from a handful of the user's
// own outreach samples. sonnet 4.6 via openrouter. ~$0.027 / extraction.
//
// the system prompt is opinionated on purpose ... we want sonnet picking
// up on the bits that compound into the moat (negative constraints,
// idiosyncratic phrases, opening pattern), not generic stylistic guesses.

const SYSTEM_PROMPT = `you read short cold-outreach samples and extract a
structured voice profile. you are NOT a copy editor. you are a voice
archaeologist ... your job is to surface the specific, idiosyncratic bits
that make this person sound like themselves.

rules:
- read every sample. do not skim.
- favor specificity over abstraction. concrete phrases beat categories.
- avoided_phrases is the negative space. list things that are NOTABLY
  missing for a cold-email corpus (e.g., "just wanted to", "circle back",
  "synergy") because their absence is part of the signature.
- idiosyncratic_phrases is the positive space. the tics, the openers, the
  bits that repeat across samples and would tip you off that a future
  email is by the same person.
- if the user is consistently lowercase, mark register: 'lowercase'. do not
  upcase the examples you cite in opening_patterns or closing_patterns.
- emoji_signature should be empirical. if the corpus has zero emoji,
  frequency is 0 and top_used is [].
- vocabulary_signature is one tight sentence. specific. no filler.
- formality_score 0-10: 0 = friend text, 5 = peer casual, 10 = formal
  business letter.

return ONLY a structured object matching the schema.`;

function formatSamples(samples: VoiceSample[]): string {
  return samples
    .map((sample, i) => {
      const header = `--- sample ${i + 1}`;
      const subject = sample.subject
        ? `\nsubject: ${sample.subject}`
        : "";
      return `${header}${subject}\nbody:\n${sample.body}`;
    })
    .join("\n\n");
}

export async function extractVoice(
  samples: VoiceSample[],
): Promise<VoiceFeatures> {
  const corpus = formatSamples(samples);

  const { object } = await generateObject({
    model: models.voiceExtractor,
    schema: VoiceFeaturesSchema,
    system: SYSTEM_PROMPT,
    prompt: `here are ${samples.length} outreach samples from a single user. extract their voice profile.\n\n${corpus}`,
    temperature: 0.2,
  });

  return object;
}
