import { generateObject } from "ai";
import { models } from "@/lib/ai/anthropic";
import { scrubVoice, findForbiddenPhrases } from "@/lib/ai/scrub";
import {
  ANGLE_TYPES,
  ANGLE_BRIEFS,
  FORBIDDEN_PHRASES,
  MAX_SUBJECT_CHARS,
  MIN_BODY_WORDS,
  BODY_TARGET_WORDS,
  MAX_BODY_WORDS,
  FiveAnglesSchema,
  type FiveAngles,
  type DraftContact,
} from "@/lib/types/draft";
import type { VoiceProfile } from "@/lib/supabase/voice";

// the wizard goal step (gc_signal_agents.objective) or a manual ask. the
// anchor the generator needs ... without it the drafter is guessing the CTA.
export type DraftObjective = {
  goal?: string | null;
  pain_points?: string[] | null;
  tone?: string | null;
};

export type GenerateAnglesArgs = {
  contact: DraftContact;
  voiceProfile: VoiceProfile | null;
  objective?: DraftObjective | null;
};

// the dom voice prior ... the fallback until a user has an active voice
// profile (10+ samples). lowercase, no em-dashes, punchy,
// vulnerable-but-confident, closer instinct. solo creator, not SDR.
const DOM_VOICE_PRIOR = `the user has no trained voice profile yet, so write
in the dom prior: all lowercase, no em-dashes (use "..." for pauses), short
punchy sentences with the occasional longer one for rhythm, vulnerable but
confident, zero corporate speak. sounds like a sharp solo founder texting a
peer, not an SDR running a play.`;

export function voiceBlock(profile: VoiceProfile | null): string {
  if (!profile || !profile.active_for_outreach) {
    return DOM_VOICE_PRIOR;
  }
  const lines: string[] = [];
  lines.push(`register: ${profile.register ?? "lowercase"}`);
  if (profile.vocabulary_signature) {
    lines.push(`vocabulary: ${profile.vocabulary_signature}`);
  }
  if (profile.formality_score != null) {
    lines.push(`formality (0-10): ${profile.formality_score}`);
  }
  if (profile.sentence_length_avg != null) {
    lines.push(`avg sentence length: ${profile.sentence_length_avg} words`);
  }
  const openers = Array.isArray(profile.opening_patterns)
    ? profile.opening_patterns
    : [];
  if (openers.length) {
    lines.push(`how they open: ${openers.map((o) => `"${o}"`).join(", ")}`);
  }
  const closers = Array.isArray(profile.closing_patterns)
    ? profile.closing_patterns
    : [];
  if (closers.length) {
    lines.push(`how they close: ${closers.map((c) => `"${c}"`).join(", ")}`);
  }
  // salutation_style + signoff_style live in the gen-owned outreach_overrides
  // jsonb (the voice extraction splits them off the shared array columns).
  const overrides = profile.outreach_overrides as Record<string, unknown> | null;
  if (overrides && typeof overrides.salutation_style === "string") {
    lines.push(`how they greet: ${overrides.salutation_style}`);
  }
  if (overrides && typeof overrides.signoff_style === "string") {
    lines.push(`how they sign off: ${overrides.signoff_style}`);
  }
  const idio = Array.isArray(profile.idiosyncratic_phrases)
    ? profile.idiosyncratic_phrases
    : [];
  if (idio.length) {
    lines.push(`phrases they reach for: ${idio.join(", ")}`);
  }
  const avoided = Array.isArray(profile.avoided_phrases)
    ? profile.avoided_phrases
    : [];
  if (avoided.length) {
    lines.push(`phrases that are off-voice (never use): ${avoided.join(", ")}`);
  }
  const punct = profile.punctuation_style as Record<string, unknown> | null;
  if (punct && typeof punct.pause_marker === "string") {
    lines.push(`pause marker: ${punct.pause_marker}`);
  }
  const emoji = profile.emoji_signature as Record<string, unknown> | null;
  if (emoji && typeof emoji.frequency === "number") {
    lines.push(
      `emoji use: ${emoji.frequency === 0 ? "never" : `~${Math.round(emoji.frequency * 100)}% of messages`}`,
    );
  }
  return `the user has a trained voice profile. match it exactly:\n${lines
    .map((l) => `- ${l}`)
    .join("\n")}`;
}

function contactBlock(contact: DraftContact): string {
  const parts: string[] = [`name: ${contact.name ?? "unknown"}`];
  if (contact.title) parts.push(`title: ${contact.title}`);
  if (contact.company_name) parts.push(`company: ${contact.company_name}`);
  if (contact.company_domain) {
    parts.push(`company domain: ${contact.company_domain}`);
  }
  if (contact.enrichment_hook) {
    parts.push(`personalization hook: ${contact.enrichment_hook}`);
  }
  return parts.map((p) => `- ${p}`).join("\n");
}

function objectiveBlock(objective?: DraftObjective | null): string {
  if (!objective || (!objective.goal && !objective.pain_points?.length)) {
    return `- goal: open a genuine conversation that could lead to a call. one clear ask.`;
  }
  const parts: string[] = [];
  if (objective.goal) parts.push(`goal: ${objective.goal}`);
  if (objective.pain_points?.length) {
    parts.push(`pain points to speak to: ${objective.pain_points.join(", ")}`);
  }
  if (objective.tone) parts.push(`tone note: ${objective.tone}`);
  return parts.map((p) => `- ${p}`).join("\n");
}

function systemPrompt(): string {
  return `you are gen, a cold outreach copywriter with closer instinct. you
write like the user, never like AI. you open doors, you don't spray templates.
relevance and timing beat volume ... every line earns the next one.

CONSTRAINTS (non-negotiable):
- lowercase only, except proper nouns
- never use em-dashes ... use "..." for pauses
- never use these phrases: ${FORBIDDEN_PHRASES.join(", ")}
- no exclamation marks unless the voice profile shows them
- subject line ${MAX_SUBJECT_CHARS} characters or fewer
- body ${MIN_BODY_WORDS}-${MAX_BODY_WORDS} words (target ${BODY_TARGET_WORDS}), mobile-first, one idea per short paragraph
- exactly one ask, and on a cold first touch it is a call-to-conversation (an interest check, an easy question), NEVER "book 30 minutes" or a calendar link ... the meeting ask comes on touch 2 or 3, not now
- always leave an easy "no" ... a low-friction out lifts real replies, it does not cost them
- no generic personalization tokens, no "your team is awesome" filler

THE ANATOMY (shape every angle this way):
1. open with THEM ... an observation about their world, a signal, something specific you actually saw. never open with "i" or "we".
2. one insight or relevance line that ties their moment to a problem you solve.
3. one TRUE credibility beat if it earns its place ... a real, relevant result. never a number you can't stand behind.
4. a single low-friction call-to-conversation, plus the easy out.

HONESTY (a hard line, not a style note): never fabricate a signal, a
compliment, an event, or social proof. an invented "congrats on the raise" that
never happened is the exact move that torched the ai-sdr category in 2025. no
real hook? lead with honest relevance, not a fake one.

generate FIVE distinct angles for the same contact, one per type. each is a
complete draft: subject + body + a one-line rationale + your own 0-10
confidence. the five must feel genuinely different, not five rewrites of one
idea:

${ANGLE_TYPES.map((t) => `- ${t}: ${ANGLE_BRIEFS[t]}`).join("\n")}`;
}

export async function generateFiveAngles(
  args: GenerateAnglesArgs,
): Promise<FiveAngles> {
  const { contact, voiceProfile, objective } = args;

  const prompt = `here is the contact:
${contactBlock(contact)}

the objective:
${objectiveBlock(objective)}

the voice to write in:
${voiceBlock(voiceProfile)}

write all five angles now. return strict structured output.`;

  const { object } = await generateObject({
    model: models.planner,
    schema: FiveAnglesSchema,
    system: systemPrompt(),
    prompt,
    temperature: 0.7,
  });

  // scrub the voice boundary on every angle before it leaves the engine.
  const scrubbed: FiveAngles = { ...object };
  for (const t of ANGLE_TYPES) {
    scrubbed[t] = {
      ...object[t],
      subject: scrubVoice(object[t].subject),
      body: scrubVoice(object[t].body),
    };
  }
  return scrubbed;
}

// which angles still trip a forbidden phrase after scrubbing (dashes are
// already fixed by scrubVoice). surfaced so the caller can flag or regen.
export function flaggedAngles(
  angles: FiveAngles,
): Partial<Record<keyof FiveAngles, string[]>> {
  const out: Partial<Record<keyof FiveAngles, string[]>> = {};
  for (const t of ANGLE_TYPES) {
    const hits = Array.from(
      new Set([
        ...findForbiddenPhrases(angles[t].subject),
        ...findForbiddenPhrases(angles[t].body),
      ]),
    );
    if (hits.length) out[t] = hits;
  }
  return out;
}
