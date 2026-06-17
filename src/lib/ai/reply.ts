import { generateObject } from "ai";
import { z } from "zod";
import { models } from "@/lib/ai/anthropic";
import { scrubVoice } from "@/lib/ai/scrub";
import { voiceBlock } from "@/lib/ai/drafting";
import type { VoiceProfile } from "@/lib/supabase/voice";

// the unibox reply drafter. given the last ~10 messages as a them:/me: transcript
// it writes the user's next reply in their voice ... 1-3 sentences, one clear
// next step, a self-rated 1-10 confidence + a short label for the move it makes.
// the tested outreach-v2 prompt, swapped onto the gen voice profile.
export type ReplyTranscriptLine = { who: "them" | "me"; body: string };

export type DraftedReply = {
  reply: string;
  angle: string;
  confidence: number;
};

const ReplySchema = z.object({
  reply: z
    .string()
    .describe("the reply body, 1-3 sentences, in the user's voice, ready to send"),
  angle: z
    .string()
    .describe(
      "a 2-4 word label for the move this reply makes, e.g. book the call, answer + nudge, handle the objection",
    ),
  confidence: z
    .number()
    .describe("1-10, how likely this reply advances the thread toward a yes"),
});

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.min(10, Math.max(1, Math.round(n)));
}

function systemPrompt(): string {
  return `you are gen, replying inside the user's inbox with closer instinct. you
write the user's next message in a live thread, sounding like them, never like AI.

CONSTRAINTS (non-negotiable):
- lowercase only, except proper nouns
- never use em-dashes ... use "..." for pauses
- 1 to 3 sentences, tight ... this is a reply, not an essay
- exactly one ask or one clear next step
- no filler openers (no "just following up", "circle back", "hope this finds you")
- read the room: if they are warm, move toward the call. if they raised an
  objection, handle it honestly in one beat, then nudge. if they said no, be
  gracious and leave the door open.`;
}

export async function draftReply(args: {
  transcript: ReplyTranscriptLine[];
  voiceProfile: VoiceProfile | null;
  contactName: string | null;
}): Promise<DraftedReply> {
  const convo = args.transcript
    .slice(-10)
    .map((l) => `${l.who}: ${l.body}`)
    .join("\n");

  const prompt = `the contact: ${args.contactName ?? "unknown"}

the thread so far (oldest first):
${convo || "(no messages yet ... open warm)"}

write the user's next reply now.

the voice to write in:
${voiceBlock(args.voiceProfile)}

return strict structured output.`;

  const { object } = await generateObject({
    model: models.drafter,
    schema: ReplySchema,
    system: systemPrompt(),
    prompt,
    temperature: 0.6,
  });

  return {
    reply: scrubVoice(object.reply),
    angle: object.angle.toLowerCase(),
    confidence: clampConfidence(object.confidence),
  };
}
