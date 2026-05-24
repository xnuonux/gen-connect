"use client";

import { useMemo, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KanbanColumn } from "./KanbanColumn";
import { ContactCard } from "@/components/shared/ContactCard";
import { fetchContacts, moveContactToStage } from "@/app/actions/contacts";
import {
  isKanbanStage,
  KANBAN_STAGES,
  type Contact,
  type KanbanStage,
} from "@/lib/types/contact";

const CONTACTS_KEY = ["contacts"] as const;

type Board = Record<KanbanStage, Contact[]>;

function emptyBoard(): Board {
  return {
    cold: [],
    enriched: [],
    drafted: [],
    sequenced: [],
    replied: [],
    booked: [],
    closed: [],
  };
}

// flatten the contact list into seven ordered columns. order inside a column
// follows the query order ... newest first.
function groupByStage(contacts: Contact[]): Board {
  const board = emptyBoard();
  for (const contact of contacts) {
    if (isKanbanStage(contact.stage)) {
      board[contact.stage].push(contact);
    }
  }
  return board;
}

export function PipelineKanban({
  initialContacts,
}: {
  initialContacts: Contact[];
}) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // the board's source of truth. seeded by the server fetch, so the first
  // paint is real data ... no loading flash.
  const { data: contacts } = useQuery({
    queryKey: CONTACTS_KEY,
    queryFn: fetchContacts,
    initialData: initialContacts,
  });

  const board = useMemo(() => groupByStage(contacts), [contacts]);

  // the optimistic move. the card jumps on drop, then we reconcile against the
  // database ... if the write fails, the card snaps back and a toast fires.
  const move = useMutation({
    mutationFn: async (vars: { contactId: string; stage: KanbanStage }) => {
      const result = await moveContactToStage(vars);
      // a server action returning { ok: false } does not reject the promise.
      // throw here so react-query runs onError and the snap-back.
      if (!result.ok) throw new Error(result.error);
    },
    onMutate: async (vars) => {
      // stop any in-flight refetch so it cannot clobber the optimistic move.
      await queryClient.cancelQueries({ queryKey: CONTACTS_KEY });
      const previous = queryClient.getQueryData<Contact[]>(CONTACTS_KEY);
      queryClient.setQueryData<Contact[]>(CONTACTS_KEY, (old) =>
        (old ?? []).map((contact) =>
          contact.id === vars.contactId
            ? { ...contact, stage: vars.stage }
            : contact,
        ),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(CONTACTS_KEY, context.previous);
      }
      toast.error(
        error instanceof Error
          ? error.message
          : "that didn't land ... the move didn't save.",
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
    },
  });

  const sensors = useSensors(
    // a small drag threshold ... a plain click still selects the card.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // keyboard drag ... space to lift, arrows to move, space to drop.
    useSensor(KeyboardSensor),
  );

  const activeContact =
    activeId !== null
      ? (contacts.find((contact) => contact.id === activeId) ?? null)
      : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const destination = String(over.id);
    if (!isKanbanStage(destination)) return;

    const contactId = String(active.id);
    const contact = contacts.find((item) => item.id === contactId);
    if (!contact || contact.stage === destination) return;

    move.mutate({ contactId, stage: destination });
  }

  return (
    <div className="min-h-0 flex-1 px-8 pb-6">
      <DndContext
        id="pipeline-kanban"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex h-full gap-4 overflow-x-auto overflow-y-hidden pb-2">
          {KANBAN_STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              contacts={board[stage]}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ))}
        </div>

        {/* the floating card under the cursor. instant drop ... the optimistic
            re-render already places the card in its new column. */}
        <DragOverlay dropAnimation={null}>
          {activeContact ? (
            <ContactCard contact={activeContact} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
