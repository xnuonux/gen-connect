import { type SignalType } from "@/lib/types/signal";

// the flame floor: a pure, no-cost, deterministic score. NEVER a suppressive
// prefilter ... haiku is the primary judge. the floor exists for (1) resilience
// (when haiku is rate-limited or errors, a hit still gets a usable score instead
// of stranding in 'pending'), and (2) transparency (a debuggable number that does
// not depend on a model call; haiku overrides it whenever haiku runs). lifted
// from outreach v2's scoreSignalHit. see docs/06-signals-spec.md.
//
// the hot/warm classes are keyed to the taxonomy ... any NEW signal_type actor
// MUST add its type to a class here or the floor scores it flat at base 0.5.

// creator-intent HOT: a stated need or a competitor exit. highest intent.
const HOT: ReadonlySet<SignalType> = new Set<SignalType>([
  "searching_for",
  "tool_mention",
  "competitor_switch",
]);

// WARM: a real moment (a launch, an engagement, a mention) ... lower intent than
// a stated need, still worth a timely touch.
const WARM: ReadonlySet<SignalType> = new Set<SignalType>([
  "product_launch",
  "engaged_with_content",
  "mentioned_you",
  "competitor_follow",
]);

const SENIOR_TITLE =
  /\b(vp|vice president|head of|director|chief|c[teofml]o|founder|owner|partner|principal)\b/i;

export type FlameInput = {
  signalType: SignalType;
  // the normalized hit payload; we read a few common fields when present.
  raw?: Record<string, unknown>;
  // the agent's icp categories, for the exact-category lift.
  icpCategories?: string[];
};

export type FlameScore = { score: number; rationale: string };

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// base 0.5, lifted by intent class (hot 0.8 / warm 0.65), +0.1 for a senior
// title, +0.1 for an exact icp-category match, capped at 1.0.
export function flameScore(input: FlameInput): FlameScore {
  const { signalType, raw = {}, icpCategories = [] } = input;

  let score = 0.5;
  let band = "base";
  if (HOT.has(signalType)) {
    score = 0.8;
    band = "hot";
  } else if (WARM.has(signalType)) {
    score = 0.65;
    band = "warm";
  }

  const title = str(raw.new_title) || str(raw.title) || str(raw.headline);
  const senior = SENIOR_TITLE.test(title);

  const category = str(raw.category).trim().toLowerCase();
  const catMatch =
    category.length > 0 &&
    icpCategories.some((c) => c.trim().toLowerCase() === category);

  const lifts: string[] = [];
  if (senior) {
    score += 0.1;
    lifts.push("senior title");
  }
  if (catMatch) {
    score += 0.1;
    lifts.push("exact category");
  }
  score = Math.min(1, Math.round(score * 100) / 100);

  const rationale =
    `${band} signal (${signalType})` +
    (lifts.length ? ` + ${lifts.join(" + ")}` : "") +
    ` ... floor ${score.toFixed(2)}`;

  return { score, rationale };
}
