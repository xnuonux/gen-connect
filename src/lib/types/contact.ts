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
// the table view widens this in a later chunk.
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

// a resolved public-presence link, presentational shape (structurally a
// superset-compatible view of lib/enrichment/footprint.FootprintLink, kept here
// so client components never import the server-only resolver module).
export type ContactPresenceLink = {
  platform: string;
  url: string;
  handle?: string;
  verified: boolean;
  source?: string;
};

export type ContactPresence = {
  name?: string;
  bio?: string;
  avatarUrl?: string;
  location?: string;
  jobTitle?: string;
  company?: string;
  website?: string;
  links: ContactPresenceLink[];
  sources: string[];
};

// the full contact the side drawer reads ... lazy-loaded per contact on open
// (never folded into the board query, which stays lean across 1000+ cards).
export type ContactDetail = {
  id: string;
  name: string | null;
  email: string | null;
  title: string | null;
  stage: ContactStage;
  aiScore: number;
  warmthScore: number;
  company: Company | null;
  linkedinUrl: string | null;
  location: string | null;
  // the personalization hook the 5-angle drafter opens with.
  hook: string | null;
  // the public-footprint person-graph, null until resolve_footprint runs.
  presence: ContactPresence | null;
  createdAt: string;
  lastActionAt: string | null;
};
