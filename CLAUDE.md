# GEN connect

## what

GEN connect is AI outreach with closer instinct. voice-matched cold drafts, signal-driven triggers, relationship intelligence, a unibox that doesn't suck. for solo founders and creators who need to open doors without sounding like a SaaS template.

## why

clay charges enterprise money for enrichment but has no opinion. apollo is a database with templates bolted on. instantly optimizes deliverability and forgets that humans read the emails. GEN exists because the move is the message, the message is the voice, and the voice is the user's, not jasper's.

## how

next.js 15 + react 19 app. shadcn for UI, xyflow for the visual sequence editor, twentyhq/twenty patterns for the record table, makeplane/plane patterns for kanban. lunari design tokens with GEN's burgundy ambition accent `#7a1528`. supabase for contacts, sequences, replies, signals. crawl4ai for scraping. resend or sendgrid for sending (deliverability call lives in the spec). claude sonnet for drafting, opus for 5-angle synthesis. pg-boss for sequence orchestration. cal.com embed for booking conversion.

## scope in

- 5 tabs ... pipeline, unibox, signals, campaigns, triggers
- enrichment waterfall (apify primary, apollo fallback, crawl4ai sidecar)
- 5-angle drafting + self-judge loop
- spintax + variant testing
- visual sequence editor (xyflow)
- unibox with inline drafted replies + confidence scoring
- live signal feed with apify signal substrate
- deliverability dashboard (listmonk-tier visibility)
- cal.com embed for booking conversion
- win celebration animations

## scope out

- linkedin automation (TOS, see heyreach for what happens)
- instagram DM automation (TOS)
- cold calling / dialer / voicemail drops
- paid ad management
- CRM-grade pipeline forecasting in v1

## workflow

- never commit to main. branch per feature.
- run `pnpm typecheck` after every change.
- prefer server actions over api routes for mutations.
- supabase queries go through `src/lib/supabase/` ... never inline.
- gen accent (burgundy `#7a1528`) only for gen-authored content.
- never ship a draft that hasn't passed voice-keeper
- never bypass the self-judge loop on 5-angle generation
- always show confidence scores on inline replies in the unibox
- deliverability dashboard is non-negotiable, listmonk-tier visibility from day 1

## voice rule (non-negotiable)

lowercase energy. NO em-dashes EVER, use `...` for pauses. punchy, vulnerable-but-confident. sounds like dom wrote it. applies to every spec, system prompt, UI string, gen-drafted email template, error message. drift kills the brand.

GEN's drafting tone is a human closer who wants the meeting, not a SaaS template that wants the open rate.

## stack

- next.js 15 + react 19 (app router, src dir)
- tailwind v4 + lunari tokens + GEN burgundy accent
- shadcn (table, button, input, dialog, dropdown, popover, sheet, card, badge, tabs)
- @xyflow/react for the sequence editor
- @tanstack/react-table for pipeline view
- supabase (auth + postgres + RLS)
- vercel AI SDK + @ai-sdk/anthropic (sonnet 4.6 for drafting, opus 4.7 for 5-angle synthesis)
- pg-boss for sequence orchestration
- resend for sending (default, swappable to sendgrid)
- apify for signal scraping + enrichment
- cal.com embed
- zod for schemas
- date-fns for time math
- lucide-react for icons

## additional docs

- architecture: @docs/01-architecture.md
- product spec: @docs/00-product-spec.md
- design system: @docs/02-design-system.md
- voice corpus: @docs/03-voice-corpus-placeholder.md
- roadmap: @docs/04-roadmap.md
- claude code handoff: @docs/05-claude-code-handoff.md

## skills loaded

- `.claude/skills/voice-keeper` ... lint output against voice rules before ship
- `.claude/skills/lunari-design-tokens` ... enforce token usage, no raw hex
- `.claude/skills/ship-discipline` ... typecheck + lint + voice-check before commit
- `.claude/skills/closer-instinct` ... 5-angle generation pattern
- `.claude/skills/deliverability` ... SPF/DKIM/DMARC + warmup + bounce rules
- `.claude/skills/xyflow-sequences` ... sequence editor node patterns

## slash commands

- `/spec <feature>` ... interview me, produce spec.md, ask clarifying questions
- `/implement` ... read active spec, scaffold files, tests first
- `/ship` ... typecheck + lint + voice-check + prepare pr description

## models

- planning + 5-angle synthesis: claude opus 4.7
- inline drafting + reply composition: claude sonnet 4.6
- signal scoring + exploration: claude haiku 4.5
