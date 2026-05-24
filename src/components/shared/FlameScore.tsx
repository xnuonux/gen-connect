import { cn } from "@/lib/utils/cn";

// a contact's warmth, 0 to 10 ... a quiet neutral intensity bar.
// burgundy and gold are reserved, so warmth stays neutral here.
export function FlameScore({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const clamped = Math.min(10, Math.max(0, score));
  const label = Math.round(clamped);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="font-mono text-[10px] tabular-nums text-lunari-neutral-400">
        {label}
      </span>
      <div className="h-1 w-14 overflow-hidden rounded-full bg-lunari-surface-elevated">
        <div
          className="planetarium h-full rounded-full bg-lunari-cream/70"
          style={{ width: `${clamped * 10}%` }}
        />
      </div>
    </div>
  );
}
