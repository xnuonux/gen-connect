"use client";

import { useDroppable } from "@dnd-kit/core";
import { KanbanCard } from "./KanbanCard";
import { KanbanEmptyState } from "./KanbanEmptyState";
import { StageChip } from "@/components/shared/StageChip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import type { Contact, KanbanStage } from "@/lib/types/contact";

type KanbanColumnProps = {
  stage: KanbanStage;
  contacts: Contact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

// one pipeline stage. the body is the drop target ... a card released here
// moves to this stage. the body stays droppable even when empty, so cold can
// catch its first lead.
export function KanbanColumn({
  stage,
  contacts,
  selectedId,
  onSelect,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <section className="flex h-full w-[300px] shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1.5 pb-3">
        <StageChip stage={stage} />
        <Badge>{contacts.length}</Badge>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "planetarium flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto",
          "rounded-lg border border-transparent p-1.5",
          isOver && "border-lunari-surface-elevated bg-lunari-surface-elevated/40",
        )}
      >
        {contacts.length === 0 ? (
          <KanbanEmptyState stage={stage} />
        ) : (
          contacts.map((contact) => (
            <KanbanCard
              key={contact.id}
              contact={contact}
              selected={contact.id === selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </section>
  );
}
