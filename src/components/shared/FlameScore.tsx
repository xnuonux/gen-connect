import { Flame } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// a contact's warmth (or a draft's heat), 0 to 10 ... rendered as a flame whose
// fill + opacity track the score. burgundy and gold stay reserved, so warmth
// reads in neutral cream intensity, not color. a 7+ score fills the glyph solid.
export function FlameScore({
  score,
  loading,
  className,
}: {
  score: number;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <div className="h-3.5 w-3.5 animate-pulse rounded-full bg-lunari-surface-elevated" />
        <div className="h-2.5 w-4 animate-pulse rounded bg-lunari-surface-elevated" />
      </div>
    );
  }

  const clamped = Math.min(10, Math.max(0, score));
  const label = Math.round(clamped);
  // 0.25 at cold, full at hot ... a quiet intensity ramp, never color-coded.
  const intensity = 0.25 + (clamped / 10) * 0.75;
  const filled = clamped >= 7;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Flame
        className="h-3.5 w-3.5 stroke-[1.5] text-lunari-cream"
        style={{ opacity: intensity, fill: filled ? "currentColor" : "none" }}
      />
      <span className="font-mono text-[10px] tabular-nums text-lunari-neutral-400">
        {label}
      </span>
    </div>
  );
}
