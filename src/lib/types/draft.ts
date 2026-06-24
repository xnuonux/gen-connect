import { z } from "zod";

// the closer-instinct 5-angle pattern. every cold first-touch produces all
// five, one complete draft per angle. order + names match the
// gc_draft_angles.angle_type check constraint.
export const ANGLE_TYPES = [
  "shared_context",
  "outcome_promise",
  "provocation",
  "utility_offer",
  "curiosity_hook",
] as const;

export type AngleType = (typeof ANGLE_TYPES)[number];

// human-facing labels for the angle cards (mono, tracked uppercase in the ui).
export const ANGLE_LABELS: Record<AngleType, string> = {
  shared_context: "shared context",
  outcome_promise: "outcome promise",
  provocation: "provocation",
  utility_offer: "utility offer",
  curiosity_hook: "curiosity hook",
};

// what each angle is, fed to the generator so it keeps them distinct.
export const ANGLE_BRIEFS: Record<AngleType, string> = {
  shared_context:
    "reference something specific in their world ... a post, a hire, a launch, a mutual connection. proof you actually looked.",
  outcome_promise:
    "name a concrete result they want ... booked shoots, deals closed, slots filled. lead with the outcome, not the feature.",
  provocation:
    "a contrarian take that earns attention without being rude. challenge an assumption they hold.",
  utility_offer:
    "give first ... a template, an audit, an intro, a free resource. then a soft ask.",
  curiosity_hook:
    "tease a specific insight that requires a reply to unlock. open a loop their brain wants closed.",
};

// the voice rule, enforced post-generation. anything here gets the angle
// flagged and (optionally) regenerated. mirrors the closer-instinct skill.
export const FORBIDDEN_PHRASES = [
  "hope this finds you well",
  "circling back",
  "circle back",
  "just following up",
  "touching base",
  "synergy",
  "leverage", // as a verb, flagged for a human look
  "reach out",
  "pick your brain",
  "quick question",
  "to whom it may concern",
] as const;

// soft targets communicated to the model. NOT hard zod bounds ... a hard
// max throws generateObject on a one-character overage, which would kill a
// perfectly good draft. the ui flags overages, the model is told the target.
export const MAX_SUBJECT_CHARS = 60;
// the lavender 50-125 word band for cold b2b email (mobile-first). under ~50
// reads thin, over ~125 gets skimmed. target the middle.
export const MIN_BODY_WORDS = 50;
export const BODY_TARGET_WORDS = 80;
export const MAX_BODY_WORDS = 125;

// a single angle's content. generous schema bounds so the model never
// throws on a near-miss; the real caps live in the prompt + the ui flag.
const AngleBodySchema = z.object({
  subject: z
    .string()
    .min(1)
    .max(240)
    .describe(
      `the subject line. target ${MAX_SUBJECT_CHARS} chars or fewer, lowercase, no clickbait.`,
    ),
  body: z
    .string()
    .min(1)
    .max(2400)
    .describe(
      `the email body. ${MIN_BODY_WORDS}-${MAX_BODY_WORDS} words (target ${BODY_TARGET_WORDS}), lowercase, no em-dashes. open with THEM, one insight, a single low-friction call-to-conversation with an easy no.`,
    ),
  rationale: z
    .string()
    .max(600)
    .describe("one line on why this angle fits this contact. not shown to the recipient."),
  confidence_self_rated: z
    .number()
    .min(0)
    .max(10)
    .describe("the generator's own 0-10 read on this angle for this contact."),
});

export type AngleBody = z.infer<typeof AngleBodySchema>;

// the full 5-angle set, keyed by angle type. keying (not an array) guarantees
// exactly five distinct angles without a fragile .length(5) that throws when
// the model returns four.
export const FiveAnglesSchema = z.object({
  shared_context: AngleBodySchema,
  outcome_promise: AngleBodySchema,
  provocation: AngleBodySchema,
  utility_offer: AngleBodySchema,
  curiosity_hook: AngleBodySchema,
});

export type FiveAngles = z.infer<typeof FiveAnglesSchema>;

// self-judge: per-angle scores on the five axes plus an evidence line.
const score = z.number().min(0).max(10);

const JudgeAngleScoreSchema = z.object({
  relevance: score.describe("specific to this contact, not generic."),
  voice_match: score.describe("sounds like the user, not like AI."),
  opening_strength: score.describe("the first 12 words lead with THEM, not i/we, and pass the mobile scroll test."),
  ask_clarity: score.describe("a single low-friction call-to-conversation with an easy no ... NOT a hard meeting or calendar demand on a cold open."),
  expected_reply_rate: score.describe("your bayesian forecast of a reply."),
  evidence: z
    .string()
    .max(800)
    .describe(
      "cite specifics for the scores ... quote the lines that earned or cost points on each axis.",
    ),
});

export type JudgeAngleScore = z.infer<typeof JudgeAngleScoreSchema>;

export const JudgeResultSchema = z.object({
  shared_context: JudgeAngleScoreSchema,
  outcome_promise: JudgeAngleScoreSchema,
  provocation: JudgeAngleScoreSchema,
  utility_offer: JudgeAngleScoreSchema,
  curiosity_hook: JudgeAngleScoreSchema,
});

export type JudgeResult = z.infer<typeof JudgeResultSchema>;

// the judge weights voice_match heavier ... holding the voice IS the moat.
export const AXIS_WEIGHTS = {
  relevance: 1,
  voice_match: 1.5,
  opening_strength: 1,
  ask_clarity: 1,
  expected_reply_rate: 1,
} as const;

// weighted sum for an angle's scores. max = 10*(1+1.5+1+1+1) = 55.
export function weightedTotal(s: JudgeAngleScore): number {
  return (
    s.relevance * AXIS_WEIGHTS.relevance +
    s.voice_match * AXIS_WEIGHTS.voice_match +
    s.opening_strength * AXIS_WEIGHTS.opening_strength +
    s.ask_clarity * AXIS_WEIGHTS.ask_clarity +
    s.expected_reply_rate * AXIS_WEIGHTS.expected_reply_rate
  );
}

// the input the drafting engine needs about a contact. assembled from
// gc_contacts + gc_companies, kept loose so a thin contact still drafts.
export const DraftContactSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  company_domain: z.string().nullable().optional(),
  enrichment_hook: z.string().nullable().optional(),
});

export type DraftContact = z.infer<typeof DraftContactSchema>;

// the generation model per closer-instinct + CLAUDE.md model routing.
export const DRAFT_GENERATION_MODEL = "claude-opus-4.7" as const;
export const DRAFT_JUDGE_MODEL = "claude-opus-4.7" as const;
