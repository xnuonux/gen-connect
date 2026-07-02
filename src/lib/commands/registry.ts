import type { Route } from "next";

// the command registry ... one flat, serializable list the palette renders +
// filters. the palette is the copilot's keyboard twin now: nav rows jump to a
// tab, an `ask` row opens gen pre-seeded with the query, and `contact` rows are
// live record hits that deep-link to the person. the `kind` discriminator is what
// the registry comment always promised ("add a run kind, no refactor").
export type PaletteCommand = {
  id: string;
  label: string;
  group: "go to" | "do" | "contacts";
  // default 'nav'. 'ask' -> open the copilot with `query`; 'contact' -> open `contactId`.
  kind?: "nav" | "ask" | "contact";
  href?: Route; // nav destination
  query?: string; // ask: the text seeded into the copilot composer
  contactId?: string; // contact: the row to open
  hint?: string;
  // gen-authored surfaces wear the forest-green ring; nav stays neutral.
  gen?: boolean;
  // extra substrings the fuzzy match should catch beyond the label.
  keywords?: string;
};

// a live contact match surfaced in the palette's "contacts" group (name/email).
export type ContactHit = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
};

export const COMMANDS: PaletteCommand[] = [
  { id: "nav-pipeline", label: "pipeline", group: "go to", href: "/pipeline", keywords: "contacts kanban table leads board" },
  { id: "nav-unibox", label: "unibox", group: "go to", href: "/unibox", keywords: "inbox replies threads messages" },
  { id: "nav-signals", label: "signals", group: "go to", href: "/signals", keywords: "intent agents hits feed" },
  { id: "nav-campaigns", label: "campaigns", group: "go to", href: "/campaigns", keywords: "sequences enrolled" },
  { id: "nav-triggers", label: "triggers", group: "go to", href: "/triggers", keywords: "rules automation fire" },
  { id: "nav-sequences", label: "sequences", group: "go to", href: "/sequences", keywords: "editor canvas xyflow steps" },
  // these two need the cast: typedRoutes does not surface them in the Route
  // union yet, the same reason layout + DraftStudio cast them.
  { id: "do-gen", label: "ask gen ...", group: "do", href: "/gen" as Route, hint: "the copilot", gen: true, keywords: "chat copilot find draft send agent" },
  { id: "do-voice", label: "show gen your voice", group: "do", href: "/onboarding/voice" as Route, hint: "onboarding", gen: true, keywords: "corpus samples train tone" },
];

// a forgiving substring match over label + hint + keywords. empty query keeps
// everything (in registry order).
export function filterCommands(query: string): PaletteCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return COMMANDS;
  return COMMANDS.filter((c) =>
    `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""}`.toLowerCase().includes(q),
  );
}
