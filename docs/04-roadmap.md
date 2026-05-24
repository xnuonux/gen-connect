# gen connect · roadmap

4 weeks from cold start to a functional MVP that competes with instantly on feature parity and beats it on voice + signals.

## week 1 ... pipeline + unibox shells

shipped by sunday:
- supabase project + migrations for contacts, companies, unibox_threads, unibox_messages
- magic link auth + middleware
- pipeline kanban (7 columns, dnd-kit, optimistic updates)
- pipeline table view toggle (@tanstack/react-table)
- contact side drawer (placeholder tabs: enrichment, sequences, drafts, warmth, signals, notes)
- csv import flow (column mapper, dedup)
- unibox 3-pane shell (thread list, thread view, contact context)
- /api/health endpoint live
- netlify preview deploys working
- railway workers project created, env vars loaded

parallel claude code sessions:
- `gen-main` ... pipeline + unibox
- `gen-design` ... lunari token enforcement + shadcn customization
- `gen-spike` ... resend inbound parsing prototype

## week 2 ... enrichment waterfall + drafting engine

shipped by sunday:
- apify orchestrator service (path B bulk + path A signal-driven)
- enrichment_traces audit log
- cost ceiling enforcement per user per day
- voice corpus ingestion UI (paste, .eml upload, gmail oauth)
- voice profile extraction (sonnet 4.6 one-time per user)
- /api/drafts endpoint (opus 4.7 5-angle generation, structured output)
- self-judge loop (opus second pass, scores 5 axes)
- drafts + draft_angles + draft_judge_scores tables
- UI: 5-angle card view, winner badged in burgundy, user override flow
- draft_outcomes writes on send/open/reply/book
- anti-pattern regex check (no em-dashes, no forbidden phrases)

parallel sessions:
- `gen-main` ... drafting engine end-to-end
- `gen-spike` ... apify actor wrappers (linkedin profile + email, leads finder, google maps)
- `gen-design` ... drafting UI polish + confidence chip animation

## week 3 ... sequence editor + sending

shipped by sunday:
- xyflow canvas with 5 node types (send, wait, condition, branch, end)
- node config panels (send: subject/body/variants; condition: predicate builder; wait: duration or until)
- graph validation (no cycles, all paths terminate, send nodes have body)
- spintax engine + 5-render preview
- graph → pg-boss job tree compiler
- sequence_enrollments table + execution flow
- sendgrid (or resend) dedicated IP + DNS wizard (DKIM, SPF, DMARC for cloudflare/godaddy/route53/namecheap)
- mailreach warmup integration
- send pipeline: pre-send checklist → resend → log to deliverability_events
- list-unsubscribe header on every send
- suppression list global per user

parallel sessions:
- `gen-main` ... sequence editor + executor
- `gen-spike` ... deliverability dashboard prototype
- `gen-design` ... DNS wizard ux polish

## week 4 ... signals + triggers + deliverability dashboard

shipped by sunday:
- signal_agents CRUD + 3-step wizard (icp → signal type → ramp)
- signal_hits ingestion from apify webhooks
- claude haiku 4.5 signal scoring
- signals tab live feed (real-time via supabase channels)
- agent grid with hit counts + status
- dismissal feedback loop
- triggers CRUD + rules engine (event-based, time-based, signal-based)
- trigger dry-run mode + logs
- deliverability dashboard (listmonk-tier): bounce rate, complaint rate, reputation per domain, recent events stream, warmup progress
- bounce/complaint webhook handling + auto-pause logic
- cal.com embed in unibox composer
- win celebration animations (booked + closed)

parallel sessions:
- `gen-main` ... signals + triggers
- `gen-spike` ... apify webhook hardening
- `gen-design` ... deliverability dashboard + celebration UX

## beyond week 4 ... launch prep + first users

- onboarding wizard (3 min target)
- stripe billing (4 tiers)
- sentry + posthog instrumented
- privacy policy + gdpr data deletion endpoint
- dogfood: dom uses gen to send first 50 cold emails
- first 10 beta users hand-picked
- product hunt + indie hackers launch
