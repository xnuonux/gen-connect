# gen connect · product spec

## the one-line

AI outreach with closer instinct. voice-matched cold drafts, signal-driven triggers, relationship intelligence, unibox that doesn't suck. for solo founders and creators who need to open doors without sounding like a SaaS template.

## the 5 tabs

shared shell: left icon rail (240px, collapsible to 56), top bar with live ticker (sends today, replies, booked, momentum), main pane, right contextual rail (contact details on hover, draft confidence in composer, deliverability pulse always-on). 5 tabs swap the main pane.

### pipeline
twenty-grade record table OR plane-style kanban (toggle in top bar). kanban columns: cold, enriched, drafted, sequenced, replied, booked, closed. drag a card across stages fires the matching gen tool. row click opens side panel: full enrichment, sequence history, win timeline, draft history. inline edit every cell. multi-select for bulk enroll.

### unibox
three-pane: thread list (left, react-virtuoso), thread view (center), contact rail (right). every inbound parsed in. gen-drafted reply lives in the composer with a confidence chip (1-10 flame + the angle used + `cmd+enter` to send). cal.com embed inserts a booking link in one click.

### signals
live feed of signal hits at top (real-time, ws or 6-hour poll). each hit is a card: signal type, contact preview, ai_score, "draft outreach" + "dismiss" actions. below the feed: agent grid showing each running signal agent with icp filter, hit count last 7d, status. "create agent" opens a 3-step wizard (icp → signal types → ramp).

### campaigns
two-column: campaign list (left), selected campaign detail (right). list shows sequence name, enrolled count, replies, booked, status. detail shows the xyflow canvas + step-level stats + spintax preview + variant breakdown. "create campaign" opens the xyflow editor full-screen.

### triggers
mautic-style trigger trees. left: trigger library (event-based, time-based, signal-based, manual). right: trigger detail editor. example payload: "when contact moves to enriched AND ai_score ≥ 7 → enroll in sequence X with 4-hour delay." each trigger has status, fire count, dry-run mode, one-click test against a sample contact.

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

## the ship definition

flawless user experience, magical underneath, functional, visually aesthetically pleasing. feature parity with category leader (instantly) plus the differentiating wedge (voice + signals + 5-angle) live and obvious.
