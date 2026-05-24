# gen connect · signals spec

the polsia-beater. codified before any code touches the signal layer.

## the one-line

gen connect's signal layer fires outreach within hours of the moment that
makes outreach relevant. polsia schedules. gen detects.

## the wedge ... signal IS the message

the move that beats polsia is not "we have signal data and we mention it in
the email." the move is "the signal payload IS the first-touch." the
promotion announcement on linkedin is not context for the model to riff on,
it is the message itself, templated through the user's voice.

a polsia first-touch fired off a scheduled sequence reads:

```
hi {first_name},
i help vp marketing folks at series a fintechs scale gtm. would tuesday
work for a quick call?
```

a gen first-touch fired off a promotion signal reads:

```
saw the move to {signal.company} ... vp marketing is no joke, especially
mid-series a in fintech. you're inheriting the gtm motion right when the
category is being rebuilt from the ground up.

i run outreach at a tool that does the message-feels-like-you thing for
solo gtm folks. tuesday or thursday if you want to see the {signal.new_title}
flow.
```

same person, same offer. one is generic, one is in the moment. time-to-
relevance is the moat. polsia cannot fire on a signal it does not know
exists.

## vs polsia ... the comparison

| dimension | polsia | gen connect |
|---|---|---|
| trigger model | scheduled sequences over imported lists | detected event → predicate match → enrollment |
| time-to-relevance | weeks (sequence cadence) | hours (signal → score → draft) |
| personalization slot | generic icp variables | signal payload metadata |
| draft voice | template + spintax | user voice profile + signal-filled template |
| dismissal feedback | none | per-hit reason → weekly trigger refinement |
| cost discipline | flat per-send | tier-gated opus only above signal_score 0.7 |

if a polsia user gets the signal at all they get it through a separate
sales-nav alert and have to write the email themselves. gen short-circuits
the entire detection-to-draft loop.

## the data flow

```
apify scheduled cron (per signal_agent)
  → apify actor runs (linkedin profile, crunchbase, job board, etc)
  → dataset webhook → /api/webhooks/apify
  → normalize dataset → gc_signal_hits insert (raw jsonb, score null)
  → haiku 4.5 relevance scoring → ai_score 0-1
  → if score ≥ agent.score_threshold → mark actionable
  → trigger predicate eval over gc_signal_hits
  → matched trigger fires action (enroll_in_sequence)
  → draft generated against signal-filled template
       (sonnet 4.6 default, opus 4.7 if signal_score > 0.7 AND user.tier='paid')
  → self-judge on opus 4.7
  → draft surfaces in /signals live feed + /unibox composer
  → user sends, dismisses, or edits
```

every step is observable. every promotion is auditable from apify run id
all the way through to the sent email.

## the tables

four tables, all gc_-prefixed, all on the shared LUNARI substrate.

### gc_signal_agents

one row per running signal source. the agent is the unit a user creates
through the 3-step wizard.

```
id              uuid pk
user_id         uuid not null fk auth.users
name            text not null
signal_type     text not null check (in 'promotion','funding_round','hiring',
                  'product_launch','role_change','content_post','company_news')
icp             jsonb not null     -- industry[], size_range[], geo[], role[],
                                   -- title_includes[], title_excludes[]
ramp            jsonb not null     -- { max_hits_per_day, soft_cap, time_windows }
score_threshold numeric not null default 0.5
apify_actor_id  text not null      -- which actor runs the scrape
apify_run_config jsonb             -- search terms, filters, etc
status          text not null default 'active'
                  check (in 'active','paused','archived')
last_ran_at     timestamptz
created_at      timestamptz not null default now()
updated_at      timestamptz not null default now()
```

rls: own_gc_signal_agents, standard `user_id = (select auth.uid())`.
trigger uses shared `public.tg_set_updated_at()`.

### gc_signal_hits

one row per detected event. raw payload + scored relevance.

```
id              uuid pk
user_id         uuid not null fk auth.users
agent_id        uuid not null fk gc_signal_agents on delete cascade
contact_id      uuid fk gc_contacts on delete set null  -- nullable until matched
signal_type     text not null  -- denormalized from agent for query speed
raw             jsonb not null  -- the apify payload, normalized
ai_score        numeric(3,2)   -- 0.00-1.00, null until haiku scores it
ai_rationale    text           -- one-line why haiku rated it this way
status          text not null default 'pending'
                  check (in 'pending','scored','actioned','dismissed','expired')
detected_at     timestamptz not null  -- when the event happened, per source
scored_at       timestamptz
actioned_at     timestamptz
draft_id        uuid           -- fk to gc_drafts once drafted
created_at      timestamptz not null default now()
```

indexes:
- `(user_id, status)` for the live feed
- `(user_id, ai_score desc)` for ranking
- `(agent_id, detected_at desc)` for per-agent timelines
- partial unique on `(agent_id, raw->>'source_id')` for dedupe within an agent

rls: own_gc_signal_hits, standard.

### gc_signal_dismissals

the feedback loop's ledger. each dismissal carries a reason for the weekly
refinement job to learn from.

```
id              uuid pk
user_id         uuid not null fk auth.users
hit_id          uuid not null fk gc_signal_hits on delete cascade
reason          text not null
                  check (in 'wrong_industry','wrong_role','wrong_timing',
                    'already_contacted','low_quality_data','not_a_fit','other')
notes           text
learned         jsonb  -- the weekly job writes proposed refinements here
created_at      timestamptz not null default now()
```

### gc_triggers

the rule layer. a trigger watches signal hits (or other events) and fires
an action when its predicate matches.

```
id              uuid pk
user_id         uuid not null fk auth.users
name            text not null
kind            text not null
                  check (in 'signal','event','time','manual')
condition       jsonb not null   -- predicate, see "the predicate language"
action          jsonb not null   -- { kind:'enroll_in_sequence', sequence_id, slot_overrides? }
priority        int not null default 100
status          text not null default 'active'
                  check (in 'active','paused','dry_run','archived')
fire_count      int not null default 0
last_fired_at   timestamptz
created_at      timestamptz not null default now()
updated_at      timestamptz not null default now()
```

`dry_run` mode logs would-have-fired matches without firing. used during
trigger authoring to test against real signal history.

## signal types in v1

three to start. the rest land in v1.5 once these are stable.

### v1 (in scope)

- **promotion** ... linkedin profile change detected, new title contains
  seniority keywords (vp, head of, director, chief). apify actor:
  linkedin profile scraper. cron: every 6h. dedupe: profile_url +
  detected_title. ICP filters: industry, company size, geo.
- **funding_round** ... crunchbase + google news. fresh seed / series a /
  series b raises in the last 14 days. apify actor: crunchbase scraper +
  news search. cron: every 12h. dedupe: company_domain + round_type +
  announced_at. ICP filters: industry, round size, geo.
- **hiring** ... company is posting roles in our buyer's function. apify
  actor: linkedin jobs / google jobs / paged.com. cron: daily. dedupe:
  company_domain + role_title. ICP filters: industry, size, role.

### v1.5 (queued)

- product_launch (product hunt / launch posts on x)
- role_change (departures + arrivals at icp companies)
- content_post (prospect posts about a pain point we solve)
- company_news (acquisitions, ipo, layoffs reversed, etc)

each v1.5 type needs its own actor pick and dedupe key. spec extends, not
breaks ... `signal_type` is just a string discriminator.

## the apify substrate

one actor per signal_type. agents pick the actor at creation time via the
wizard. the orchestrator on railway holds:

- a per-user-per-agent pg-boss schedule (the cron)
- the apify token (one shared org token, billing aggregated)
- a normalize layer that maps raw actor output to a stable `raw` jsonb
  shape per signal_type (so trigger predicates can be written against a
  contract, not against actor-specific fields)

normalize contract per signal_type, sketched:

```
promotion: {
  source_id, profile_url, name, prior_title, new_title, company,
  company_domain, industry, company_size_range, geo, detected_at
}

funding_round: {
  source_id, company, company_domain, industry, round_type,
  amount_usd, announced_at, investors[], geo, detected_at
}

hiring: {
  source_id, company, company_domain, industry, role_title,
  role_function, role_seniority, role_geo, posted_at, detected_at
}
```

agents that miss the contract because the actor changed their output are
auto-paused with an alert. the contract is the boundary.

## the predicate language

trigger predicates live in `gc_triggers.condition` as jsonb. jsonb (not a
DSL) keeps them queryable, serializable to the api surface, and editable
through a form ui without a parser. v1 grammar:

```jsonc
{
  // implicit AND across keys at the top level
  "signal_type": "promotion",
  "score_gte": 0.75,
  "detected_within_hours": 72,        // freshness gate
  "raw": {
    // path matchers against the normalized payload
    "new_title_includes_any": ["VP", "Head of", "Director", "Chief"],
    "industry_in": ["fintech", "saas", "developer tools"],
    "company_size_range_in": ["11-50", "51-200", "201-500"]
  },
  "contact": {
    // matchers against gc_contacts for the matched contact_id
    "stage_not_in": ["replied", "booked", "closed", "do_not_contact"],
    "contacted_within_days_lte": null  // null = no recent-contact filter
  },
  "not": {
    // negation block, recursive shape
    "raw": { "industry_in": ["crypto"] }
  }
}
```

evaluator lives in `src/lib/triggers/evaluate.ts` (lands week 4). pure
function over `{ hit, contact, agent, user }` → `boolean`. tested with
fixtures per signal_type.

v1.5 may add a string DSL on top of the jsonb (auto-generated from the
jsonb for display), but the storage shape stays jsonb so the api never
needs a parser on the consumer side.

## the personalization slot system

draft templates carry slot tokens that resolve from the signal payload at
draft-generation time. tokens are namespaced:

- `{signal.*}` ... fields from the normalized signal `raw`
- `{contact.*}` ... fields from gc_contacts
- `{company.*}` ... fields from gc_companies
- `{voice.*}` ... computed bits from the user's voice profile (e.g.,
  `{voice.opening_pattern}` for a salutation matching their cold-email
  habit)

the resolution step runs BEFORE the 5-angle generator sees the prompt.
the model receives a filled string, not a templated string. this is the
hard rule: the model is told "this email is about a real promotion at a
real series a fintech," not "fill in this template." the signal is the
message, not the variable.

example resolution:

```
template:
saw the move to {signal.company} ... {signal.new_title} is no joke,
especially mid-{signal.round_type} in {signal.industry}.

after resolution:
saw the move to Northbound Studio ... VP Marketing is no joke, especially
mid-series a in fintech.

model sees the resolved string + voice profile + 5-angle instruction.
```

a slot that fails to resolve (missing field) blocks draft generation with
a typed error surfaced in the live feed card: "draft skipped ... missing
signal.round_type." the human can override.

## the haiku scoring

every raw signal hit gets scored by claude haiku 4.5 against the agent's
ICP and the signal_type contract. cost ~$0.0025/hit. one call, structured
output:

```json
{ "score": 0.82, "rationale": "vp marketing, series a, fintech, geo match. high relevance." }
```

agents define `score_threshold` (default 0.5). only hits above the
threshold flip to `status='scored'` and become eligible for trigger
evaluation. below-threshold hits stay in the table for the dismissal
learning loop to read but never surface in the live feed.

haiku is cheap enough to run on every raw event. don't pre-filter raw
events with hand-coded regex ... let haiku do the judgment.

## opus tier override

5-angle drafting routing:

- default: sonnet 4.6 for the 5-angle generation, opus 4.7 for the
  self-judge. ~$0.025 + ~$0.03 = ~$0.055/draft.
- override to opus on generation when **both**: `signal_score > 0.7` AND
  `user_profiles.is_paid_tier = true`. ~$0.08 + ~$0.03 = ~$0.11/draft.

the cap is per dom's explicit gate. opus on every prospect blows the BYOK
savings; opus reserved for the moments that warrant the bill (high-quality
signal + paying customer) keeps the wedge sharp without bleeding compute.

`is_paid_tier` field gets added to `user_profiles` later by lunari
strategy ... we read it, never write it. gen-owned signups land as free
tier by default; conversion flips the flag.

## the dismissal learning loop

every dismissal carries a typed reason. a weekly sonnet 4.6 job aggregates
per-trigger:

```
trigger 'fintech promotions' fired 18 times in the last 7 days.
12 dismissed. dismissal reasons:
- wrong_industry: 7 (crypto, defi)
- wrong_role: 3 (head of design, not head of growth)
- already_contacted: 2

proposed refinement:
- add `not.raw.industry_in: ['crypto', 'defi']` to condition
- tighten `raw.new_title_includes_any` to exclude design titles

estimated dismissal reduction: ~75%.
```

the refinement lands in `gc_signal_dismissals.learned` as a structured
diff. ui surfaces it as a card on the trigger detail page: "your trigger
'fintech promotions' looks like it's misfiring ... 7 dismissals in 7 days
for wrong_industry. apply refinement?"

refinements never auto-apply in v1. the user reviews and clicks accept.
that boundary stays human until we trust the loop.

## the ui surface

per the product spec section on `/signals`, three regions:

### live feed (top)

real-time via supabase realtime channel on `gc_signal_hits` insert. each
hit renders as a card:

```
[promotion]  marisol chen → vp marketing at Northbound Studio
  fintech · 11-50 · sf bay
  score 0.84 · detected 2h ago

  [draft outreach]  [dismiss]
```

clicking `draft outreach` fires the matched trigger (or shows a sequence
picker if no auto-trigger applies). clicking `dismiss` opens the reason
dropdown.

### agent grid (middle)

one card per `gc_signal_agent`, showing icp summary, signal type, 7-day
hit count, dismissal rate, status pill. card actions: pause, edit, archive.

### create-agent wizard (modal, 3 steps)

1. **icp** ... industry multi-select, size range, geo, role filters
2. **signal types** ... pick one or more (v1 limits to one per agent)
3. **ramp** ... max_hits_per_day, time windows (e.g., business hours
   only), soft_cap

submit creates the gc_signal_agent row + queues the first apify run.

### trigger detail (separate /triggers tab)

dismissal refinement cards surface here, scoped to triggers of `kind='signal'`.

## the api surface

`/api/gc/v1/signals/*` is part of the broader gen connect public api
(see docs/06-api-surface.md, queued, written after lunari main writes its
contract first). signal-specific endpoints:

```
GET    /api/gc/v1/signals/recent?since=&user_id=
       → list of recent hits scored above threshold
POST   /api/gc/v1/signals/{hit_id}/draft
       → fires the matched trigger or returns the candidates if ambiguous
POST   /api/gc/v1/signals/{hit_id}/dismiss
       → { reason, notes? }
GET    /api/gc/v1/agents?user_id=
       → list of signal_agents
POST   /api/gc/v1/agents
       → { name, icp, signal_type, ramp, apify_actor_id }
PATCH  /api/gc/v1/agents/{id}
       → partial update, including status changes
```

webhooks back to lunari main on:

- `signal.scored` ... fires when a new hit lands above threshold
- `signal.dismissed` ... fires on user dismissal (for learning loop sync)
- `signal.actioned` ... fires when a hit becomes a sent draft

all responses follow the lunari-main agent message format once that
contract lands. designed-not-built ... the endpoints scaffold as 501 with
the eventual shape stubbed in until dom's spec lands.

## the deploy + cron

apify orchestrator runs on railway alongside pg-boss workers.

- pg-boss schedules one cron per `gc_signal_agent` (interval per signal_type)
- cron fires apify run via apify api with `agent.apify_run_config`
- apify webhook on completion → `/api/webhooks/apify` → normalize → insert
  rows into `gc_signal_hits` (one tx per dataset page)
- a follow-up haiku scoring job picks up `status='pending'` rows, scores
  them, transitions to `status='scored'` or expires after 30 days

cron storms get smoothed by pg-boss native concurrency limits. one user
running 20 agents will not stampede the apify token.

## the cost model

| line | unit | rate | volume / month | cost / month |
|---|---|---|---|---|
| apify actors (avg) | run | ~$0.05 | 200 (across 5 agents × 6/day) | ~$10 |
| haiku scoring | hit | ~$0.0025 | 2000 | ~$5 |
| sonnet 5-angle (default) | draft | ~$0.025 | 100 | ~$2.5 |
| opus self-judge | draft | ~$0.03 | 100 | ~$3 |
| opus 5-angle override | draft | ~$0.08 | 20 (signal>0.7 + paid) | ~$1.6 |
| weekly refinement job | week | ~$0.04 | 4 | ~$0.16 |

~$22 / month per active user on signals layer alone, before sends. with
the rest of gen (drafting elsewhere, replies, voice extraction) the brief's
$45 / month / user envelope holds.

## open questions for dom

1. **cooldown policy**: if a contact gets two signals in the same week
   (e.g., promotion + funding), do we fire two separate sequences or
   coalesce into one? lean: coalesce with priority order (highest score
   wins), single sequence, second signal logged for context.
2. **trigger predicate dsl**: jsonb is the v1 storage shape. is there
   appetite for a thin string dsl on top in v1.5 for the trigger editor,
   or do we stay jsonb-only?
3. **ramp semantics**: hard daily cap with overflow drop, or soft target
   with overflow rollover to next day? lean: soft target, log overflow.
4. **dismissal-driven refinement**: weekly job proposes refinements but
   never auto-applies in v1. confirm. v1.5 might auto-apply with high
   confidence and a snooze-able notification.
5. **voice weight on signal-fired drafts**: how hard does the dom prior
   override the contact context? a vp at a series a fintech may warrant
   a slightly more formal register; the voice keeper says lowercase
   always. lean: hold the voice rule firm, signal payload modulates
   content not register.
6. **signal_type taxonomy for v1**: my pick is promotion, funding_round,
   hiring. confirm or swap one for product_launch.

## what this spec does not cover

deferred to their own specs:

- `docs/06-api-surface.md` ... the broader `/api/gc/v1/*` contract,
  written after lunari main writes its agent message contract first
- xyflow sequence editor (see `.claude/skills/xyflow-sequences/SKILL.md`)
- deliverability dashboard (week 4 in parallel)
- voice extraction onboarding (week 2 priority #1, the next chunk)

the signal layer reads contact + voice data through the supabase queries
in `src/lib/supabase/`. it writes drafts through `src/lib/ai/` (drafting
engine, lands with voice extraction). every cross-layer boundary stays
typed and rls'd.
