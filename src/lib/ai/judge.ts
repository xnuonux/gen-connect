import { generateObject } from "ai";
import { models } from "@/lib/ai/anthropic";
import {
  ANGLE_TYPES,
  ANGLE_LABELS,
  JudgeResultSchema,
  weightedTotal,
  type FiveAngles,
  type JudgeResult,
  type JudgeAngleScore,
  type AngleType,
} from "@/lib/types/draft";
import type { VoiceProfile } from "@/lib/supabase/voice";

export type JudgedAngles = {
  scores: Record<AngleType, JudgeAngleScore>;
  weighted: Record<AngleType, number>;
  winner: AngleType;
};

// a different prompt frame than the generator ... a forecaster, not a
// copywriter ... to blunt self-enhancement bias. voice_match is scored
// against the user's actual voice (or the dom prior), and weighted x1.5
// downstream by weightedTotal.
function judgeSystem(profile: VoiceProfile | null): string {
  const voiceNote =
    profile && profile.active_for_outreach
      ? `the user has a trained voice. score voice_match against THEIR voice (register ${profile.register ?? "lowercase"}), not a generic ideal.`
      : `score voice_match against the dom prior: lowercase, no em-dashes, punchy, vulnerable-but-confident, no corporate speak.`;
  return `you are a cold-email reply-rate forecaster. you have read thousands
of cold emails and the reply data behind them. you are skeptical and
specific. you do NOT reward clever copy that will not get a reply.

the anatomy that actually earns replies, score against it: the open leads with
THEM, not the sender; one real relevance insight; one TRUE credibility beat if
any; a single low-friction call-to-conversation with an easy out; 50-125 words,
mobile-first. a hard meeting or calendar ask on a cold first touch is a red
flag, not a strength ... the meeting is asked on touch 2-3, not now.

score each candidate on five axes, 0-10:
- relevance: specific to this contact, not generic
- voice_match: sounds like the user, not like AI. ${voiceNote}
- opening_strength: do the first 12 words lead with THEM (not i/we) and pass the mobile scroll test
- ask_clarity: a single low-friction call-to-conversation with an easy no ... dock hard for "book 30 minutes" or a calendar link on a cold open
- expected_reply_rate: your honest bayesian forecast that a human replies

DISQUALIFIER: if a candidate fabricates a signal, a compliment, an event, or
social proof, cap relevance and expected_reply_rate at 2 and say so in the
evidence ... a fake hook is the exact thing that burned the ai-sdr category.

for each candidate, cite evidence ... quote the lines that earned or cost
points. be harsh on anything that smells like AI or a template.`;
}

// fisher-yates, with non-null assertions on the in-bounds indices so it
// satisfies noUncheckedIndexedAccess without a possibly-undefined swap.
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export async function judgeAngles(args: {
  angles: FiveAngles;
  voiceProfile: VoiceProfile | null;
}): Promise<JudgedAngles> {
  const { angles, voiceProfile } = args;

  // shuffle presentation order to blunt primacy/recency bias.
  const order = shuffle(ANGLE_TYPES);
  const presented = order
    .map(
      (t) =>
        `### candidate: ${t} (${ANGLE_LABELS[t]})
subject: ${angles[t].subject}
body:
${angles[t].body}`,
    )
    .join("\n\n");

  const prompt = `score these five candidate cold emails. same offer, same
person, five different angles.

${presented}

return a score object for every angle type.`;

  const { object } = await generateObject({
    model: models.judge,
    schema: JudgeResultSchema,
    system: judgeSystem(voiceProfile),
    prompt,
    temperature: 0.3,
  });

  const scores: JudgeResult = object;
  const weighted = {} as Record<AngleType, number>;
  let winner: AngleType = ANGLE_TYPES[0];
  let best = -Infinity;
  for (const t of ANGLE_TYPES) {
    const w = weightedTotal(scores[t]);
    weighted[t] = w;
    if (w > best) {
      best = w;
      winner = t;
    }
  }

  return { scores, weighted, winner };
}
