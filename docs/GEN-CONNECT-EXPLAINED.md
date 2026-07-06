# gen connect ... the whole thing

*ai outreach with closer instinct. voice-matched cold drafts, signal-driven triggers,
relationship intelligence, and a unibox that doesn't suck. for solo founders and
creators who need to open doors without sounding like a saas template.*

this is the full picture ... what gen connect is, who it's for, and how every piece
actually works. written by the cc who built it, so it's the ground truth, not the
brochure.

---

## 1. what it is

gen connect is an outreach tool that acts like a closer, not a mail-merge. you point it
at a person (or it finds the person for you), and it writes a cold email that sounds
like YOU wrote it ... in your voice, off a real reason to reach out, with one honest
ask. then it sends it compliantly, threads the reply into one inbox, and tells you what
to do next.

the difference from everything else is the order of operations. most tools start with a
list and a template and optimize the open rate. gen starts with a MOMENT (someone just
launched, someone is asking for a tool like yours, someone got promoted into the seat
that buys what you sell) and writes the message that moment deserves, in the voice that
makes it land. the move is the message, the message is the voice, the voice is the
user's.

it is one product with six surfaces + an operator that ties them together. it runs on a
shared substrate with the rest of lunari, so it was always built to be folded in.

## 2. who it's for (and who it's against)

**for:** solo founders and creators. the person who is their own sdr, who can't sound
like a bot because their name is on the email, who needs to open a door this week, not
run a 5,000-lead sequence next quarter. the signal taxonomy is creator-flavored on
purpose ... "searching for a tool like yours," "just launched on product hunt," "left a
competitor." the outcome ledger tracks gigs and streams and subscribers, not just
"meetings booked." that tells you who the icp really is.

**against:**
- **clay** charges enterprise money for enrichment but has no opinion about the message.
- **apollo** is a database with templates bolted on.
- **instantly** optimizes deliverability and forgets a human reads the email.
- **gojiberry / polsia** have the persistent-signal idea but treat the signal as context
  for a template, and schedule sends over imported lists. gen makes the signal the
  message and fires within hours of the moment, in your voice.

gen's whole bet: the tool that feels like it PRINTS MONEY (the hero stat is dollars in
opportunities, not fuel burned) and sounds like a person beats the tool that optimizes a
vanity metric and sounds like jasper.

## 3. the six surfaces

the shell is a left icon rail, a top bar led by the "$X in opportunities since launch"
hero, and a main pane that swaps between five tabs. plus gen, the copilot, which can do
everything the tabs do by conversation.

- **pipeline** ... the spine. a twenty-grade record table OR a plane-style kanban (cold
  -> enriched -> drafted -> sequenced -> replied -> booked -> closed). drag a card, the
  stage persists. every card carries a provenance breadcrumb ("why they're here") and a
  presence chip (how many public channels their footprint resolved). click a card, a
  drawer opens with the full enrichment, the why-they're-here chain, and their
  person-graph.
- **unibox** ... a gmail-style three-pane reply surface. every inbound reply is parsed +
  threaded. gen drafts a reply in your voice with a confidence chip; cmd+enter sends. the
  channel enum is widened to the full 10-platform set so reply ingestion can light up per
  platform without a migration.
- **signals** ... the gojiberry-beater. a live feed of detected moments, each scored, each
  a card with "draft outreach" / "dismiss." below it, the agent grid: each running signal
  agent watching one signal type for your icp. a 4-step wizard builds one (icp ->
  signal + precision slider -> ramp -> goal). the goal step is the anchor the drafter
  reads.
- **campaigns** ... sequences as instruments. a two-column console: the ledger on the
  left, a live detail pane on the right showing the compiled journey (every step + its
  offset), the per-send a/b + spintax breakdown, the enrolled/reply counts, and a
  per-campaign "run due sends."
- **triggers** ... the rules engine. when a signal fits a predicate (a jsonb condition,
  never a string dsl), the right thing fires: draft the angles, or enroll the sourced
  contact into a sequence. dry-run mode tests a trigger against the hits already in.
- **gen (the copilot)** ... the operator. a chat where you say "find 20 fintech founders,
  verify, load the good ones, tag them fintech, enrich the top 5, draft the best, dismiss
  the junk" and it runs the loop, declaring its steps as a live checklist, confirming
  before it writes to your pipeline or sends a single email, acting as you (every tool
  rls-scoped). everything the tabs do, you can do by asking.

## 4. how it actually works

### the cold-outreach flow

1. **you get a contact** ... paste a url, import a csv, ask gen to find leads, or a signal
   surfaces one.
2. **enrichment** runs one of two waterfalls. path A (single lead, hot, ~$0.30 ceiling):
   perplexity -> crawl4ai -> apify, plus a free footprint resolve (gravatar + github +
   the person's own site) that also fills the person-graph. path B (bulk, cold, ~$0.01
   ceiling): apify leads-finder -> email verifier -> crawl4ai backfill. a pure planner
   (`waterfall.ts`) decides the next provider and stops the moment the contact is
   draft-ready or the budget's spent. nothing is trusted from the client but the id.
3. **the 5-angle draft.** the drafter (opus-tier, one structured call) writes five
   genuinely different angles for the same person: shared context, outcome promise,
   provocation, utility offer, curiosity hook. each follows an anatomy ... open with THEM
   (a real observation), one relevance line, one true credibility beat if it earns its
   place, one low-friction ask with an easy out. it's fed the contact, the objective (the
   signal agent's goal), the person's voice profile, and their real public presence.
4. **the self-judge.** a second pass shuffles the angles, scores each on five axes
   (relevance, voice_match x1.5, opening_strength, ask_clarity, expected_reply_rate), and
   picks a winner. you can override.
5. **the send.** everything routes through one guarded path: suppression gate ->
   jurisdiction gate (gdpr/eprivacy on cold first-touches) -> rfc-8058 one-click
   unsubscribe -> can-spam footer -> thread routing -> the outbound log + the deliverability
   ledger. test-mode-safe by default. idempotent by a compare-and-set claim so the same
   cold email can never be double-sent.
6. **the sequence.** enroll the contact into a visual sequence; the executor advances due
   sends (in-app "run due sends," or the autonomous cron) over the same compiled graph +
   the same guarded send. a/b variants fire deterministically per contact.

### the drafter, deeper

the voice is the product. a per-user voice profile (extracted from 10+ samples of the
user's real cold writing) feeds the drafter as structured constraints + raw samples;
below threshold it falls back to the dom voice prior baked into the system prompt.
lowercase, no em-dashes, punchy, vulnerable-but-confident. and the hard line: the drafter
NEVER fabricates a signal, a compliment, an event, or social proof. no real hook means
lead with honest relevance, not a fake one. that rule is why anyone can trust the
output enough to put their name on it.

### the signal layer (the wedge)

a signal agent watches one signal type (searching_for, tool_mention, product_launch, and
the founder-lane promotion / funding_round) for an icp. apify actors run on a cadence,
hits land in `gc_signal_hits`, haiku scores each 0-1 against the icp (with a
deterministic "flame floor" fallback when the model is rate-limited), and a hit above
threshold becomes eligible for a trigger. the trigger's predicate matches, and the
sourced contact enters the pipeline with full provenance (source_signal_id +
source_trigger_id) ... so the pipeline card can show WHY they're here, and the drafter can
open on the real moment. the signal payload is resolved into the message before the model
ever sees it: the model gets "this email is about a real product-hunt launch by this
maker," not a template with a `{signal}` token.

### the relationship-intelligence footprint

"find the person, not just the email." `resolveFootprint` builds a person-graph from
their email + handle: their verified social accounts (gravatar), their github + site,
their real bio. it's fed to the drafter as relationship context ("their public presence:
github @dom, personal site ...") so an angle can open where they actually live online ...
and it's FACTUAL only, never the company's channels dressed up as theirs. it shows as a
presence chip on the pipeline card. this is the third leg of the wedge, and the one that
makes gen feel like it knows the person.

### the unibox + inbound

the resend inbound webhook (signature-verified, replay-windowed, deduped) parses a reply,
threads it by reply-to token / references / message-id, writes it to `gc_unibox_messages`,
and moves the contact to "replied." the unibox shows it live (realtime). you draft a reply
(gen feeds the model the last ~10 messages as a them:/me: transcript, asks for a 1-3
sentence reply in your voice, self-rates confidence), and send it back through the same
guarded path.

### deliverability

listmonk-tier visibility from day one: send mode, live volume, bounce/complaint/suppression
rates off the events ledger, the recent-events stream, a dns wizard that verifies spf +
dkim + mx before a live send is allowed, and auto-pause when bounces or complaints cross
the line. the inbox is the product; this is the layer that protects it.

## 5. the design language ... THE DEEP

gen wears lunari's v2 language, "THE DEEP." a WebGL substrate ... an emerald crystalline
mass on the left (gen's stone, forest green), burmese-ruby / oxblood pooling on the right
... sits behind everything as a quiet, dimmed ground. content floats above it on
emerald-glass panels (backdrop-blur, a whisper of forest-green border). gold is reserved,
one moment per screen (the money stat, the win pulse). forest green is gen's signature,
only ever on gen-authored content, the primary cta, the confidence chip, the win
celebration, the selected sequence node. the mono-label signature (10px, wide-tracked,
uppercase) marks every divider. planetarium easing, 300ms, follow-through reveals. it's
cinematic and enterprise-tier without being corporate ... bond, aladdin, linear, attio,
not dribbble.

## 6. the stack + the substrate

next.js 16 + react 19 (app router, server actions, react compiler). tailwind v4 + lunari
tokens. shadcn primitives, xyflow for the sequence canvas, tanstack-table for the
pipeline. supabase (auth + postgres + rls) on a SHARED lunari substrate ... every gen
table is `gc_`-prefixed with own-row rls (`user_id = auth.uid()`). vercel ai-sdk routing
opus (5-angle + judge), sonnet (replies + voice), haiku (signal scoring); aliases
currently point at deepseek v4 while the anthropic key is funded. resend for send +
inbound. apify for signals + enrichment. pg-boss is the intended home for the autonomous
executor. the whole thing is server-action-first; mutations don't go through api routes
unless they need to stream (the gen copilot does).

## 7. the principles (the non-negotiables)

- **voice or nothing.** every string, every draft, every error message is lowercase, no
  em-dashes, dom register. a scrub enforces it at the persistence boundary. drift kills
  the brand.
- **never fabricate.** the drafter invents nothing. honesty is enforced in the data layer,
  not just the prompt.
- **test-mode-safe by default.** no real stranger is emailed until a deliberate env flip
  on a verified domain. at-most-once send, always.
- **rls everywhere.** every table own-row, every tool acts as the signed-in user, service
  role only in trusted server contexts with explicit user_id scoping.
- **the dollar, not the fuel.** the hero number is opportunity value, because the tool
  should feel like it prints money, not burns credits.

## 8. where it stands

feature-complete and integration-ready. all six surfaces real + wired, three core flows
(outbound, inbound, signals) end-to-end, three idempotency guards on the money path, the
compliant send-spine, the signal layer, the person-graph, the sequence executor + a
test-mode-safe autonomous cron, THE DEEP theme wired + pixel-verified. green gate (158
tests + production build), prod substrate in sync, zero security advisories from any gen
object. what's deliberately left for the lunari merge: auth via lunari's shell, removing
the dev-login backdoor, a typed supabase client generated from the owned schema, and
scheduling the crons. the handoff for all of that lives in
`docs/07-lunari-integration/` (READY.md, PORT-PLAN.md, and the builder's card).

that's gen connect. a closer, in software, that sounds like you. built to open doors.
