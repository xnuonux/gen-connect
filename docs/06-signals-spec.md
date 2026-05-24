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
- **product_launch** ... product hunt launches + launch posts on x for
  prospects matching the creator/indie-hacker/micro-saas profile.
  highest-converting signal type for creator outreach ... "saw you just
  launched X" reply rates beat nearly every other cold opening. apify
  actors: product hunt scraper + x search. cron: every 6h. dedupe:
  launch_url + launched_at. ICP filters: category (creator tools, dev
  tools, b2b saas, etc.), audience size, geo.

### v1.5 (queued)

- hiring ... company posting roles in buyer's function. dropped from v1
  because density is high but noise is too. wait for conversion data on
  the cleaner three before scaling its volume.
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

product_launch: {
  source_id, launch_url, product_name, tagline, category, maker_name,
  maker_handle, maker_profile_url, company, company_domain,
  audience_size, geo, launched_at, detected_at
}
```

agents that miss the contract because the actor changed their output are
auto-paused with an alert. the contract is the boundary.

## ramp semantics

`gc_signal_agents.ramp` is a **soft target with bounded overflow
rollover**. specifically:

- the ramp specifies a `max_hits_per_day` target. it is a target, not a
  hard cap.
- if a day's scoring finds more than `max_hits_per_day` actionable hits,
  the overflow rolls forward to the next day only. overflow from day N
  is queued for day N+1.
- if a hit hasn't fired by the end of day N+1, it transitions to
  `status='aged_out'`.
- aged-out hits do **not** auto-fire on day N+2 or later. they stay in
  the live feed under a "you missed these" affordance, one-click-
  fireable by the user.
- no silent drop. no infinite compounding.

ramp jsonb shape:

```jsonc
{
  "max_hits_per_day": 30,
  "soft_cap": 50,           // upper bound including rollover
  "time_windows": [
    { "tz": "America/New_York", "days": ["mon","tue","wed","thu","fri"],
      "from": "08:00", "to": "18:00" }
  ]
}
```

`soft_cap` is the safety: if rollover would push the day's queue above
`soft_cap`, the surplus ages out immediately rather than rolling. this
prevents a high-volume burst from monopolizing the agent's quota for
days.

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

v1.5 ships a **visual condition builder** (dropdowns + chip inputs + a
tree view for nesting) that emits jsonb directly, plus a "raw jsonb"
toggle for power users who want to edit the truth without the form. one
source of truth, two surfaces over it. **no string dsl, ever** ...
parsing a string dsl creates a second source of truth and a class of
bugs that compound over years. the storage shape is the contract.

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

## voice on signal drafts

voice is **invariant**. register stays lowercase regardless of contact
seniority. holding the lowercase line IS the moat ... a vp who can't read
lowercase isn't the customer. the voice keeper rules apply identically
on every signal-fired draft: lowercase, no em-dashes, "..." for pauses,
dom register / user register depending on whose voice profile is loaded.

what modulates per contact, given the signal payload:

1. **which of the 5 angles fires** ... a series-a vp gets the "operator
   who's been in your seat" angle, not the "fellow builder at 0" angle.
   angle selection reads the signal payload + voice profile + recipient
   seniority. the self-judge weighs `recipient_fit` as one of its 5 axes.
2. **specific signal language** ... `{signal.new_title}`,
   `{signal.product_name}`, `{signal.round_type}` get resolved before
   generation. the model receives the resolved string, not a template.
3. **credentialing p.s.** ... a senior recipient may warrant an optional
   credentialing line (e.g., "p.s. ran growth at {prior_company}"). the
   generator decides whether to include it based on
   `signal_payload.recipient_seniority` and the user's voice corpus
   conventions (does the user use p.s. signatures?). never forced, never
   sycophantic.

what does **not** modulate:

- the register. lowercase always.
- the punctuation rules. no em-dashes, ever.
- the voice profile baseline. the dom prior or the user's per-user
  voice profile holds firm regardless of who the recipient is.

if the model output drifts toward title-case formal because a recipient
"feels senior," the voice-keeper layer catches it before the draft lands
in the unibox. drift kills the brand.

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

## cooldown policy

contacts get hit by more than one signal. promotion + funding inside the
same week is common. v1 policy: **coalesce on a 7-day rolling window
keyed on `contact_id`**.

mechanics:

- when a hit lands, check `gc_signal_hits` for any `actioned` hit in the
  last 7 days for the same `contact_id`. if one exists, **do not fire a
  separate sequence**.
- the higher-scored signal wins as the **primary angle**. its
  `{signal.*}` payload drives the first-touch.
- the lower-scored signal joins as a **secondary payload** to the
  5-angle generator ... not just logged for context, actively used to
  enrich the angles. example: a vp who got promoted at a fintech that
  just raised series a should hear about both, with the higher-scored
  signal in the lead and the second one as the credentialing crossbar.
- one sequence sent per contact per 7-day window. period.

the cooldown lives in `src/lib/triggers/cooldown.ts`. pure function:
`shouldCoalesce(newHit, history) -> { coalesce: bool, primary?: hit,
secondary?: hit }`. tested with fixtures.

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
the accepted refinement writes to `gc_triggers.condition` jsonb. that
boundary stays human until we trust the loop.

### v1.5 auto-apply

once we have conversion data and dismissal-classifier confidence to
trust, v1.5 introduces gated auto-apply. all three conditions must hold:

1. **>50 dismissals on the same trigger** ... statistical floor before
   any refinement runs unattended.
2. **refinement classifier confidence > 0.9** ... the sonnet job emits
   a confidence score on its proposed refinement; only the high-
   confidence ones qualify.
3. **user opted in** ... per-trigger opt-in toggle in the trigger
   detail ui, default off.

even when auto-applied, every refinement comes with a **14-day rollback
window** via a snooze-able notification: "we tightened your 'fintech
promotions' trigger 3 days ago. dismissal rate dropped 71%. keep it, or
roll back?" if the user rolls back, the change reverts and the
classifier learns that this refinement was wrong for this user.

the human stays in the loop. auto-apply is a convenience for the
high-volume + high-confidence case, never an abdication.

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

## decisions

the six questions from the first draft of this spec, resolved by dom.
the rest of this doc reflects these decisions; this section is the
ledger.

1. **cooldown policy** ... coalesce on a 7-day rolling window keyed on
   `contact_id`. higher-scored signal wins as primary angle; lower-scored
   signal joins as a secondary payload that actively enriches the
   5-angle generator (not just context). one sequence per contact per
   7-day window. see "cooldown policy" section.
2. **predicate dsl** ... jsonb storage forever. no string dsl, ever.
   v1.5 ships a visual condition builder ui that emits jsonb directly,
   plus a "raw jsonb" toggle for power users. one source of truth, two
   surfaces over it. see "the predicate language" section.
3. **ramp semantics** ... soft target with bounded overflow rollover.
   overflow from day N rolls to day N+1 only. unfired by end of N+1 →
   `status='aged_out'`. aged-out hits stay one-click-fireable in the ui
   as "you missed these." `soft_cap` is the safety ceiling. see "ramp
   semantics" section.
4. **dismissal-driven refinement** ... never auto-apply in v1. weekly
   sonnet job → proposed refinement card → user one-click apply →
   write to `gc_triggers.condition`. v1.5 introduces gated auto-apply
   requiring (a) >50 dismissals same trigger, (b) refinement classifier
   confidence > 0.9, (c) user opted in. 14-day rollback window via
   snooze-able notification. see "the dismissal learning loop"
   section.
5. **voice on signal-fired drafts** ... voice is invariant. register
   stays lowercase regardless of contact seniority. what modulates per
   contact: which of the 5 angles fires, specific signal language,
   whether to include a credentialing p.s. holding the lowercase line
   IS the moat. see "voice on signal drafts" section.
6. **signal_type taxonomy for v1** ... swap. v1 ships promotion,
   funding_round, product_launch. hiring drops to v1.5 because density
   is high but noise is too. product_launch lands in v1 because
   "saw you just launched X on product hunt" is the highest-converting
   opening for the creator / indie-hacker / micro-saas icp gen connect
   actually targets. see "signal types in v1" section.

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
