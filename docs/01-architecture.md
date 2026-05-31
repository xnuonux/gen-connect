# gen connect · architecture

## the module map

```
src/
├── app/                          # next.js 15 app router
│   ├── (marketing)/              # public landing, /pricing, /docs
│   ├── (auth)/                   # magic link signup/login
│   ├── (app)/                    # authed workspace shell
│   │   ├── pipeline/
│   │   ├── unibox/
│   │   ├── signals/
│   │   ├── campaigns/
│   │   ├── triggers/
│   │   └── sequences/            # xyflow editor canvas
│   ├── api/
│   │   ├── webhooks/             # resend, apify, calcom, stripe
│   │   ├── auth/                 # magic link callback
│   │   └── health/               # uptime probe
│   └── actions/                  # server actions (mutations)
├── components/
│   ├── ui/                       # shadcn primitives
│   └── shared/                   # gen-specific composed components
├── lib/
│   ├── supabase/                 # db helpers, typed queries
│   ├── ai/                       # anthropic clients, drafting, judge, voice scrub
│   ├── enrichment/               # apify orchestrator, fallback chain
│   ├── signals/                  # flame floor, normalize contracts
│   ├── triggers/                 # predicate eval, cooldown/coalesce
│   ├── sequences/                # graph compiler, pg-boss adapter
│   ├── deliverability/           # send pipeline, suppression, bounce
│   ├── unibox/                   # inbound parser, threading
│   ├── webhooks/                 # verify, dedupe, queue
│   └── utils/
└── design/
    └── tokens.css                # lunari + gen accent
```

## the data flow

### cold outreach flow
```
user → /pipeline → import csv or paste url
     → enrichment orchestrator (path B for bulk, path A for hot)
     → contacts table populated with enrichment_data jsonb
     → user clicks contact → side drawer
     → "draft outreach" → claude opus 4.7 (5-angle gen + self-judge)
     → drafts table + draft_angles + draft_judge_scores
     → user picks angle → enroll in sequence
     → pg-boss schedules send jobs per sequence node
     → resend sends, deliverability_events log on send/bounce/open
```

### inbound + reply flow
```
recipient replies → resend inbound webhook
                 → /api/webhooks/resend (signature verified, deduped)
                 → mailparser → thread by Message-ID
                 → unibox_messages insert, unibox_threads update
                 → contact pipeline_stage → 'replied'
                 → user opens unibox → composer
                 → claude sonnet 4.6 streams draft
                 → user sends → resend → loop
                 → if cal embed clicked → calcom webhook → opportunities table
```

### signal flow
```
signal_agents (icp + signal_type + ramp) → pg-boss cron
                                        → apify actor invoked
                                        → /api/webhooks/apify on completion
                                        → normalize dataset → signal_hits
                                        → claude haiku scores relevance
                                        → if score ≥ threshold → draft queued
                                        → user sees in signals tab live feed
```

## the supabase schema (sketch)

every table has: `id uuid pk`, `user_id uuid not null references auth.users`, `created_at`, `updated_at`. every table has RLS enabled: `using (user_id = auth.uid())`.

### core tables (v1)
- `user_profiles` (voice_corpus jsonb, voice_profile_features jsonb, plan, onboarded_at)
- `contacts` (the spine: email, linkedin_url, title, company_id, ai_score, warmth, stage, enrichment_data, source, tags, source_signal_id, source_trigger_id) ... the two source_* columns carry provenance so the pipeline card + contact rail can show "why they're here" (the breadcrumb fold from outreach v2)
- `companies` (domain, name, industry, size, tech_stack)
- `enrichment_traces` (source, cost_cents, fields_returned, raw_payload, status)
- `sequences` (name, status, graph jsonb, version, enrolled_count, reply_count)
- `sequence_versions` (sequence_id, version, graph_snapshot)
- `sequence_enrollments` (sequence_id, contact_id, current_node_id, status)
- `triggers` (kind, condition jsonb, action jsonb, priority, status)
- `drafts` (contact_id, sequence_id?, winning_angle_id, generated_at)
- `draft_angles` (draft_id, angle_type, subject, body, confidence_self_rated)
- `draft_judge_scores` (draft_id, angle_id, scores jsonb, winner_angle_id, user_override_angle_id)
- `draft_outcomes` (draft_id, sent_at, opened, clicked, replied, booked)
- `voice_corpus` (user_id, sample_text, source, extracted_features)
- `user_drafting_profiles` (preferences jsonb, last_trained_at)
- `signal_agents` (icp jsonb, signal_type, objective jsonb, ramp jsonb, score_threshold, max_cost_cents_per_day, status) ... `objective` is the wizard goal step (the 5-angle anchor); `max_cost_cents_per_day` caps the shared apify spend per agent
- `signal_hits` (agent_id, contact_id, score, raw jsonb, dismissed)
- `signal_dismissals` (hit_id, reason, learned jsonb)
- `unibox_threads` (contact_id, channel, last_message_at, unread_count, status)
- `unibox_messages` (thread_id, direction, body, message_id_header, in_reply_to, sent_at)
- `sending_domains` (domain, dkim_verified, spf_verified, dmarc_verified, daily_cap, warmup_started_at)
- `deliverability_events` (event_type, contact_id, sending_domain_id, external_id, occurred_at)
- `suppression_list` (email, reason, added_at)
- `opportunities` (contact_id, source_draft_id, value_usd, stage, closed_at)
- `outcome_events` (the dollars-not-fuel ledger: event_type [gig_booked, subscriber_acquired, stream_revenue, merch_sale, lead_qualified, meeting_booked, deal_closed], dollar_value, attributed_agent, source_signal_id fk, campaign_id fk, source_draft_id fk, occurred_at) ... powers the "$X in opportunities since launch" hero stat + per-source revenue attribution. note the event_type taxonomy is creator-flavored on purpose (gig/stream/merch), it tells you who the icp is. folded from outreach v2.
- `comment_triggers` (platform, post_url, trigger_word, trigger_word_match, dm_template, lead_magnet_url, capture_email, max_responses, status) ... the "drop COWORK and i'll send the playbook" lead-capture mechanic. scoped to email + reddit + owned channels only (no linkedin/ig comment scraping ... TOS). its own feature, NOT a `triggers.kind`. designed-not-built, post-v1.
- `comment_captures` (trigger_id, commenter_handle, comment_text, dm_status, contact_id fk, thread_id fk, email) ... one row per captured commenter, flows into the pipeline as a sourced contact.
- `billing_subscriptions` (stripe_customer_id, stripe_sub_id, plan, status)
- `usage_events` (kind, units, cost_cents)
- `agent_actions` (audit log: actor, action, target, payload, occurred_at)

## the external services

| service | purpose | env var |
|---|---|---|
| supabase | auth + postgres + RLS | `SUPABASE_*` `DATABASE_URL` |
| anthropic | claude opus 4.7 + sonnet 4.6 + haiku 4.5 | `ANTHROPIC_API_KEY` |
| resend | sending + inbound parsing | `RESEND_API_KEY` |
| sendgrid | failover sender (or primary on scale) | `SENDGRID_API_KEY` |
| apify | scraping + signal substrate | `APIFY_TOKEN` |
| apollo | apollo single-lead lookup (path A fallback) | `APOLLO_API_KEY` |
| perplexity | sonar enrichment (path A primary) | `PERPLEXITY_API_KEY` |
| crawl4ai | self-hosted scraping sidecar | `CRAWL4AI_API_URL` |
| cal.com | booking embed | `CAL_COM_API_KEY` |
| stripe | billing (post-launch) | `STRIPE_*` |
| upstash redis | rate limiting + caches | `UPSTASH_REDIS_REST_*` |
| sentry | error tracking | `SENTRY_DSN` |
| posthog | product analytics | `POSTHOG_KEY` |

## the deploy topology

- **frontend** → netlify (next.js 15 ssr + edge functions)
- **workers** → railway (pg-boss workers, apify orchestrator, sendgrid webhook processor)
- **crawl sidecar** → railway (python crawl4ai service)
- **database** → supabase managed postgres + auth + storage + realtime

env vars: netlify deploy contexts for prod vs preview vs branch. railway has the same layered system. never put secrets in `.env.local` that's committed (gitignored).

## the AI model routing

| call | model | tokens in/out | cost/call | latency |
|---|---|---|---|---|
| 5-angle generation | opus 4.7 | 3500/1200 | ~$0.08 | 8-12s |
| self-judge | opus 4.7 | 2000/600 | ~$0.03 | 5-8s |
| inline reply | sonnet 4.6 | 2000/400 | ~$0.012 | 1-2s stream |
| voice profile extraction | sonnet 4.6 | 5000/800 | ~$0.027 | 10s (one-time) |
| weekly learning loop | sonnet 4.6 | 8000/1000 | ~$0.039 | batch (offline) |
| signal scoring | haiku 4.5 | 1500/200 | ~$0.0025 | <1s |
| ICP exploration | haiku 4.5 | 2000/500 | ~$0.0045 | 1-2s |

cost per active user per month at 500 drafts: ~$45 AI cost. priced at $79-149/mo plan ⇒ ~60-70% AI gross margin before infra.

## the voice scrub boundary

voice enforcement is defense in depth, not a single prompt. the system prompt
asks for lowercase + no em-dashes, but we never trust the model to hold the
line every time. so a pure `scrubVoice()` helper in `src/lib/ai/` runs on
EVERY model output and every saved template before it touches the db:

- replaces the em-dash + en-dash characters with "..." (collapsing runs of
  four or more dots back to three)
- flags forbidden phrases ("just wanted to", "circle back", "synergy", etc)
- optionally (behind a flag) lowercases a draft that came back title-cased

this is the mechanism behind "never ship a draft that hasn't passed
voice-keeper." prompt asks, scrub guarantees. lifted straight from outreach
v2's `scrubEmDashes()`, which ran in prod ... cheapest, most reliable voice
enforcement there is. it sits at the persistence boundary so nothing reaches a
contact, a saved template, or the unibox composer un-scrubbed.
