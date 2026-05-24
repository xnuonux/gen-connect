# GEN connect agents file

this file is read by claude code, cursor, copilot, codex, aider. it codifies the agent rules for this repo.

## stack

next.js 15 (app router, src dir, react 19) ... tailwind v4 ... shadcn ... supabase (auth + postgres + RLS) ... vercel AI SDK + anthropic ... pg-boss ... resend ... apify ... cal.com embed.

## conventions

- typescript strict, `noUncheckedIndexedAccess` on
- server components by default. `"use client"` only when needed for interactivity
- server actions for mutations. route handlers only for webhooks + streaming
- supabase queries go through `src/lib/supabase/` ... never inline in components
- every table has RLS enabled. policy: `using (user_id = auth.uid())`
- zod schemas are the contract. validate every external boundary
- never use em-dashes. use `...` for pauses
- gen burgundy `#7a1528` reserved for gen-authored content only

## ai model routing

- planning, architectural decisions, 5-angle drafting + self-judge ... claude opus 4.7
- inline reply drafting, voice extraction, learning loop ... claude sonnet 4.6
- signal scoring, exploration ... claude haiku 4.5

## file layout

```
src/app/(app)/<tab>/page.tsx       ... 5 workspace tabs
src/app/api/webhooks/<provider>/   ... resend, apify, calcom, stripe
src/components/ui/                  ... shadcn primitives
src/components/shared/              ... gen-specific composed components
src/lib/supabase/                   ... db helpers, typed queries
src/lib/ai/                         ... claude clients, drafting, judge
src/design/tokens.css               ... lunari + gen accent
docs/                               ... product spec, architecture, design
.claude/                            ... agents, hooks, skills, commands
```

## quality gates

- `pnpm typecheck` passes
- no em-dashes in source (`scripts/check-em-dash.sh`)
- no raw hex colors outside `src/design/tokens.css`
- every new table ships with RLS migration

## voice contract

if you are writing user-facing copy, UI strings, error messages, gen-drafted email templates, or anything that will ship to the user, you write in dom voice: lowercase, no em-dashes, punchy, vulnerable-but-confident.

drift kills the brand.
