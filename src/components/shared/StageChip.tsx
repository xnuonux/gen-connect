import { cn } from "@/lib/utils/cn";
import type { ContactStage } from "@/lib/types/contact";

// the lunari mono-label signature, applied to a pipeline stage name.
export function StageChip({
  stage,
  className,
}: {
  stage: ContactStage;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400",
        className,
      )}
    >
      {stage.replace(/_/g, " ")}
    </span>
  );
}
