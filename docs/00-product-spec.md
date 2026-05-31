# gen connect · product spec

## the one-line

AI outreach with closer instinct. voice-matched cold drafts, signal-driven triggers, relationship intelligence, unibox that doesn't suck. for solo founders and creators who need to open doors without sounding like a SaaS template.

## the 5 tabs

shared shell: left icon rail (240px, collapsible to 56), top bar led by the hero stat ... "$X in opportunities since launch" (closed + pipeline value, sourced from `outcome_events`), with a secondary live ticker (sends today, replies, booked, momentum), main pane, right contextual rail (contact details on hover, draft confidence in composer, deliverability pulse always-on). 5 tabs swap the main pane. the headline number is dollars, not fuel ... the reframe that beats instantly's open-rate vanity. it makes the tool feel like it prints money, not burns credits. folded from outreach v2.

### pipeline
twenty-grade record table OR plane-style kanban (toggle in top bar). kanban columns: cold, enriched, drafted, sequenced, replied, booked, closed. drag a card across stages fires the matching gen tool. row click opens side panel: full enrichment, sequence history, win timeline, draft history. inline edit every cell. multi-select for bulk enroll. each card carries a provenance breadcrumb ("↳ searching for a tool like yours", "↳ just launched on product hunt") so you see WHY a contact is in the pipeline at a glance, not just that they are ... reads from `contacts.source_signal_id` / `source_trigger_id`. the contact rail shows the full chain: signal ... company ... industry ... geo ... profile ... deal value ... stage. this is how the wedge proves itself in the UI, not just in the email. folded from outreach v2.

### unibox
three-pane: thread list (left, react-virtuoso), thread view (center), contact rail (right). every inbound parsed in. gen-drafted reply lives in the composer with a confidence chip (1-10 flame + the angle used + `cmd+enter` to send). cal.com embed inserts a booking link in one click. v1 threads email + linkedin + twitter, but the channel enum is widened to the full 10-platform set (instagram, tiktok, reddit, telegram, facebook, threads, bluesky) so inbound reply ingestion can light up per platform without a migration ... reading replies in is not automation and not a TOS landmine, it's the literal "unibox that doesn't suck" wedge. the reply drafter feeds the model the last ~10 messages as a them:/me: transcript and asks for a 1-3 sentence reply in the user's voice (the tested prompt from outreach v2, swapped onto the gen voice profile + 5-axis confidence).

### signals
live feed of signal hits at top (real-time, ws or 6-hour poll). each hit is a card: signal type, contact preview, ai_score (flame), "draft outreach" + "dismiss" actions. below the feed: agent grid showing each running signal agent with icp filter, hit count last 7d, status. "create agent" opens a 4-step wizard (icp → signal types + precision slider → ramp → goal). the goal step anchors the 5-angle drafter. v1 builds the creator-intent core (searching_for, tool_mention, product_launch) plus the founder lane (promotion, funding_round) ... see docs/06-signals-spec.md for the full taxonomy.

### campaigns
two-column: campaign list (left), selected campaign detail (right). list shows sequence name, enrolled count, replies, booked, status. detail shows the xyflow canvas + step-level stats + spintax preview + variant breakdown. "create campaign" opens the xyflow editor full-screen.

### triggers
mautic-style trigger trees. left: trigger library (event-based, time-based, signal-based, manual). right: trigger detail editor. example payload: "when contact moves to enriched AND ai_score ≥ 7 → enroll in sequence X with 4-hour delay." each trigger has status, fire count, dry-run mode, one-click test against a sample contact.

this tab is the rules engine (event/time/signal predicate → action). it is a different thing from **comment-trigger lead capture** ... the "drop COWORK and i'll send the playbook" mechanic that watches a post, auto-DMs the lead magnet on a trigger word, and captures the commenter as a sourced contact. that's its own surface + tables (`comment_triggers` / `comment_captures`), scoped to email + reddit + owned channels only (no linkedin/ig comment scraping ... TOS), and lands post-v1. same word "trigger", two features ... don't conflate them. folded from outreach v2, where dom flagged the comment mechanic as the highest-ROI lead-gen move.

### gen (the copilot)

the surface that ties the other five together: a chat at `/gen` where you talk to gen in plain language and it runs the loop ... find leads, verify emails, load them into the pipeline, enrich, draft the 5 angles + self-judge, triage/tag/move stages, summarize the pipeline, and send (test-mode-safe). it declares its steps as a live checklist (✔ / ◼ / ◻) so you watch it work, confirms before it writes to your pipeline or sends a single email, and acts as you (every tool RLS-scoped). gen is the operator, not a dashboard ... everything the tabs do, you can do by asking. example: "find 20 fintech founders, verify, load the good ones, tag them fintech, enrich the top 5, draft the best, dismiss the junk." built this session ... the wedge taken all the way. see docs/01-architecture.md "the gen copilot" for the agent loop + tool belt.

## the enrichment waterfall

two paths, two cost ceilings.

### path A ... signal-driven (single lead, hot, low-latency, $0.30 ceiling)
1. **perplexity sonar** (~$0.005/query) ... role context, recent activity
2. **crawl4ai sidecar** (~$0.01/lead compute) ... company website scrape
3. **apify linkedin profile + email** (~$0.05/lead) ... email of last resort
4. cumulative ceiling $0.30/lead. flag `needs_manual` if cold.

### path B ... ICP discovery (bulk, cold, async, $0.01 ceiling)
1. **apify leads finder** ($1.50/1k = ~$0.0015/lead) ... primary bulk source
2. **email verifier** (~$0.001-0.004/email) ... never send unverified
3. **crawl4ai backfill** ... top-N contacts by ai_score after bulk pull
4. ceiling $0.01/lead. 5000-lead pulls cost ~$50 not ~$500.

required data points before drafting fires: name, email OR linkedin url, company, title, one personalization hook.

## the 5-angle drafting + self-judge loop

every cold first-touch produces 5 distinct angles:
1. shared context
2. outcome promise
3. provocation
4. utility offer
5. curiosity hook

**generation**: claude opus 4.7, single call, structured output. ~3,500 tokens in, ~1,200 out, ~$0.08/contact.

**self-judge**: claude opus 4.7, second pass. shuffles angles, uses different prompt frame, scores each on 5 axes (relevance, voice_match, opening_strength, ask_clarity, expected_reply_rate). winner = weighted sum with voice_match × 1.5.

**per-user learning loop**: `draft_outcomes` writes on every send/reply/book. weekly cron with sonnet reads last 30d, updates `user_drafting_profiles.preferences` jsonb. next generation biases by the profile.

**cold start**: dom voice prior until user has 10+ samples and 50+ sent.

## the visual sequence editor

xyflow canvas. node types:
- **send** (email | linkedin dm | twitter dm) ... payload, spintax, up to 3 a/b variants, schedule window, tracking flags
- **wait** ... hours/days/weeks or "wait until" mode (next tuesday 9am, business hours only)
- **condition** ... boolean on contact state, signal events, prior outcomes
- **branch** ... weighted n-way split
- **end** ... terminal, marks completed | move_stage | pause | add_tag

compile: graph → `sequence_graph` jsonb → pg-boss job tree. each node is a queued job with idempotency keys, retry policy, cancellation hook. crashes resume from the last successful node.

versioning: live sequences pin to a snapshot. edits create a new version. enrolled contacts finish on their version, new enrollments use latest.

## the unibox + inline reply drafting

**inbound parsing**: resend inbound webhook → mailparser → thread by Message-ID + References + In-Reply-To. dedupe.

**draft surface**: composer is textarea + "gen draft" button. claude sonnet 4.6 streams a draft. confidence chip self-rates 1-10 on voice match, thread-context fit, likelihood of advancing.

**ux flow**: send (`cmd+enter`) / edit (type over) / regenerate (prior draft saved to dropdown). discard is implicit.

**cal.com**: button in composer inserts a `<Cal>` widget link. webhook on book creates an `opportunities` row, kanban moves contact to "booked", win animation fires.

## open questions for dom

1. **deliverability stack** ... lean sendgrid dedicated + mailreach warmup. confirm before handoff #1 ships.
2. **own-domain-per-user dns wizard** vs bring-your-own with a doc? lean: dns wizard, 2 days of build.
3. **voice corpus minimum** ... 10 samples is my gut. dom voice prior below threshold.
4. **5-angle compute** ... opus single call (~$0.08/lead) vs parallel sonnet (~$0.025/lead). lean opus for first 1000 users.
5. **win celebration trigger** ... booked? closed? both? lean: both, gold pulse + one-line gen quote.
6. **gen.lunari.pro vs independent domain at launch** ... brief says deferred. confirming domain-agnostic build.

## folded from the precursor

outreach v2 (reference/LUNARI-OUTREACH-V2-BUNDLE.md) is the working prototype
gen connect productizes ... the same 5 tabs, built inside the lunari monolith.
gojiberry is the competitor whose persistent-signal-agent mechanic it
reverse-engineered. a synthesis pass against both folded these in:

- **dollars-not-fuel hero stat** ... the top-bar headline reframe (above).
- **creator-intent signal taxonomy** ... searching_for + tool_mention join the
  v1 build; the full taxonomy is locked into the CHECK constraint now so it
  never needs a migration. see docs/06-signals-spec.md.
- **goal step in the agent wizard** ... the 5-angle anchor (above + signals).
- **comment-trigger lead capture** ... its own surface, scoped to compliant
  channels, post-v1.
- **provenance breadcrumb + contact-rail chain** ... why-they're-here in the
  pipeline UI (above).
- **server-side voice scrub-on-write** ... see docs/01-architecture.md.
- **flame floor + precision slider + per-agent cost ceiling** ... see signals.

deferred (dom): the **reddit playbook** (subreddit-by-icp master + warmup
state machine) is a someday, not v1. the source docs live in `reference/`.

## the ship definition

flawless user experience, magical underneath, functional, visually aesthetically pleasing. feature parity with category leader (instantly) plus the differentiating wedge (voice + signals + 5-angle) live and obvious.
