import { cn } from "@/lib/utils/cn";

// a shimmer placeholder block ... surface-elevated pulsing over the surface.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-lunari-surface-elevated",
        className,
      )}
    />
  );
}
