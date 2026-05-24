import { Skeleton } from "@/components/ui/skeleton";
import { KanbanSkeleton } from "./KanbanSkeleton";

// shown while the server fetches contacts. the shape matches the real board
// so nothing jumps when the data lands.
export default function PipelineLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="px-8 pb-5 pt-6">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>
      <div className="min-h-0 flex-1 px-8 pb-6">
        <KanbanSkeleton />
      </div>
    </div>
  );
}
