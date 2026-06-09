import { type SignalHit } from "@/lib/types/signal";

// the cooldown / coalesce policy: one sequence per contact per 7-day rolling
// window. when a new actionable hit lands for a contact who already had an
// actioned hit in the last 7 days, coalesce instead of firing a second sequence.
// the higher-scored signal leads as the PRIMARY angle; the lower joins as a
// SECONDARY payload that actively enriches the 5-angle draft (not just context).
// pure function, tested with fixtures, `nowMs` injected for determinism. see
// docs/06-signals-spec.md "cooldown policy".

const WINDOW_MS = 7 * 24 * 36e5;

export type CoalesceResult = {
  coalesce: boolean;
  primary: SignalHit;
  secondary?: SignalHit;
};

export function shouldCoalesce(
  newHit: SignalHit,
  // prior ACTIONED hits for the SAME contact, any order.
  history: SignalHit[],
  nowMs: number = Date.now(),
): CoalesceResult {
  const recent = history.filter((h) => {
    const t = new Date(h.detectedAt).getTime();
    return !Number.isNaN(t) && nowMs - t <= WINDOW_MS && nowMs - t >= 0;
  });

  if (recent.length === 0) {
    return { coalesce: false, primary: newHit };
  }

  // the highest-scored prior hit in the window is the incumbent.
  const incumbent = recent.reduce((best, h) =>
    (h.aiScore ?? 0) > (best.aiScore ?? 0) ? h : best,
  );

  const newScore = newHit.aiScore ?? 0;
  const incScore = incumbent.aiScore ?? 0;
  const primary = newScore >= incScore ? newHit : incumbent;
  const secondary = newScore >= incScore ? incumbent : newHit;

  return { coalesce: true, primary, secondary };
}
