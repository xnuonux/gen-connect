import { generateObject } from "ai";
import { z } from "zod";
import { models } from "@/lib/ai/anthropic";
import { flameScore } from "@/lib/signals/flame";
import type { SignalType } from "@/lib/types/signal";

// score a raw signal hit against the agent's ICP. haiku is the primary judge
// (cheap, ~$0.0025/hit); the flame floor is the FALLBACK when haiku errors or is
// rate-limited, never a suppressive prefilter. the floor also gives a transparent
// number that does not depend on a model call. see docs/06-signals-spec.md.

const ScoreSchema = z.object({
  score: z.number().describe("0.0 to 1.0, how relevant this signal is to the ICP"),
  rationale: z.string().describe("one short line, lowercase, why"),
});

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

export type ScoredSignal = {
  score: number;
  rationale: string;
  scoredBy: "haiku" | "floor";
};

export async function scoreSignalHit(args: {
  signalType: SignalType;
  raw: Record<string, unknown>;
  icp: Record<string, unknown>;
}): Promise<ScoredSignal> {
  const categories = Array.isArray(args.icp.industry)
    ? (args.icp.industry as string[])
    : Array.isArray(args.icp.categories)
      ? (args.icp.categories as string[])
      : [];

  const floor = flameScore({
    signalType: args.signalType,
    raw: args.raw,
    icpCategories: categories,
  });

  try {
    const { object } = await generateObject({
      model: models.scout,
      schema: ScoreSchema,
      system:
        "you score how relevant a buying-intent signal is to an outreach agent's ICP, from 0 to 1. be calibrated: 0.8+ is a strong fit worth a same-day touch, 0.5 is borderline, below 0.4 is off-ICP. lowercase rationale, no em-dashes.",
      prompt: `signal type: ${args.signalType}
the agent's icp: ${JSON.stringify(args.icp)}
the detected hit (normalized payload):
${JSON.stringify(args.raw)}

score this hit 0-1 for ICP relevance + a one-line rationale.`,
      temperature: 0.2,
    });
    return {
      score: clamp01(object.score),
      rationale: object.rationale,
      scoredBy: "haiku",
    };
  } catch {
    // haiku unavailable ... the floor keeps the hit out of 'pending' limbo.
    return {
      score: floor.score,
      rationale: `${floor.rationale} (scored by floor, haiku unavailable)`,
      scoredBy: "floor",
    };
  }
}
