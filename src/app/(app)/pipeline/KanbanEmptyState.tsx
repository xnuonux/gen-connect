import type { KanbanStage } from "@/lib/types/contact";

// the cold column gets the real call to action ... that is where leads enter
// the pipeline. every other column just gets a quiet line.
const COPY: Partial<Record<KanbanStage, string>> = {
  cold: "no leads yet ... import a list or paste a linkedin url to get started.",
};

export function KanbanEmptyState({ stage }: { stage: KanbanStage }) {
  const message = COPY[stage] ?? "nothing here yet.";

  return (
    <div className="rounded-md border border-dashed border-lunari-surface-elevated px-3 py-6 text-center text-xs leading-relaxed text-lunari-neutral-500">
      {message}
    </div>
  );
}
