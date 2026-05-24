import { KANBAN_STAGES } from "@/lib/types/contact";
import { Skeleton } from "@/components/ui/skeleton";

// the board's loading state ... seven columns of shimmer that match the real
// layout so nothing jumps when the data lands.
export function KanbanSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {KANBAN_STAGES.map((stage, columnIndex) => (
        <div key={stage} className="flex w-[300px] shrink-0 flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          {Array.from({ length: 3 - (columnIndex % 3) }).map((_, cardIndex) => (
            <Skeleton key={cardIndex} className="h-[104px] w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}
