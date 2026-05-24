// gen connect ... contact + company domain types.
// hand-written for chunk 1. regenerate from the supabase schema once it settles.

// the seven pipeline stages, in board order. these are the kanban columns.
export const KANBAN_STAGES = [
  "cold",
  "enriched",
  "drafted",
  "sequenced",
  "replied",
  "booked",
  "closed",
] as const;

export type KanbanStage = (typeof KANBAN_STAGES)[number];

// the full stage set adds the soft-delete sink, which is never a board column.
export type ContactStage = KanbanStage | "do_not_contact";

export function isKanbanStage(value: string): value is KanbanStage {
  return (KANBAN_STAGES as readonly string[]).includes(value);
}

export type Company = {
  name: string | null;
  domain: string | null;
};

// the shape the pipeline reads ... a deliberate subset of the contacts table.
// the side panel and table view widen this in later chunks.
export type Contact = {
  id: string;
  name: string | null;
  email: string | null;
  title: string | null;
  stage: ContactStage;
  aiScore: number;
  warmthScore: number;
  company: Company | null;
  lastActionAt: string | null;
  createdAt: string;
};
