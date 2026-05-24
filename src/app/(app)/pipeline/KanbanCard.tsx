"use client";

import { useDraggable } from "@dnd-kit/core";
import { ContactCard } from "@/components/shared/ContactCard";
import { cn } from "@/lib/utils/cn";
import type { Contact } from "@/lib/types/contact";

type KanbanCardProps = {
  contact: Contact;
  selected: boolean;
  onSelect: (id: string) => void;
};

// one draggable contact on the board. the drag wiring lives here ... the look
// is ContactCard, reused untouched by the drag overlay and the side panel.
export function KanbanCard({ contact, selected, onSelect }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: contact.id,
  });

  return (
    <ContactCard
      ref={setNodeRef}
      contact={contact}
      selected={selected}
      onClick={() => onSelect(contact.id)}
      className={cn(
        "cursor-grab outline-none active:cursor-grabbing",
        "focus-visible:ring-1 focus-visible:ring-lunari-cream/40",
        // the source card dims while its overlay floats. no transform here ...
        // the DragOverlay owns the moving visual.
        isDragging && "opacity-40",
      )}
      {...attributes}
      {...listeners}
    />
  );
}
