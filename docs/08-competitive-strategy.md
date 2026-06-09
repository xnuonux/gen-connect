# gen connect · competitive strategy ... how we beat gojiberry

written from a recon pass (gojiberry.ai + the intent-signal category + the ai-sdr
backlash + the creator icp). the short version: gojiberry is a linkedin dashboard
for sales teams. gen is an operator for solo founders + creators. those are
different products, and the gap is structural, not cosmetic.

## the one-line

gojiberry detects company events on linkedin and fires a templated dm. gen detects
a HUMAN publicly telling you they have the need, drafts the moment in your voice,
and never sends what a bot would send. signal timing is the table-stakes. voice +
the right signal + the right channel is the moat.

## what gojiberry actually is (recon)

- "lovable for gtm teams." paste your url, its agents learn your icp, then watch
  15-30+ buying signals 24/7 ... funding, job changes, competitor followers,
  post likes, profile visits, hiring, rsvps ... score, enrich, auto-draft, send.
- **linkedin-first** (sends from the user's own linkedin account ... the TOS/ban
  minefield gen scopes OUT; reddit-flagged for spam).
- **flat scoring** ... a like is scored like a funding round. no intent tiering.
- **$99/mo capped at 2 linkedin senders** ... a team product you outgrow, not a
  solo product.
- **no creator-intent signals, no voice-matching, no 5-angle/self-judge, no A/B,
  no copilot.** a dashboard, not an operator.

## the seams we split open (the wedges)

1. **creator-intent taxonomy gojiberry structurally lacks** ... `searching_for`
   (someone posts "anyone know a tool that..."), `tool_mention` ("left
   {competitor}"), `product_launch` (product hunt + launch posts). highest intent
   there is, on channels gojiberry never touches. (founder lane `promotion` /
   `funding_round` ships too, so we read category-complete.)
2. **signal IS the message** ... the spec resolves the signal payload INTO the
   prompt before the 5-angle generator sees it, so the launch/search post becomes
   the first-touch itself, not a `{variable}` in a template.
3. **intent tiering** (the flame floor: hot 0.8 / warm 0.65) beats flat scoring,
   and the tier shows on the live-feed card ("hot: they asked for a tool like
   yours").
4. **compliant channels** ... email (resend, test-mode-safe) + human-in-the-loop
   assist for the gated ones. never linkedin/ig automation. we don't burn the
   user's accounts.
5. **the moat the whole field lacks** ... per-user voice profile + 5 distinct
   angles + self-judge + the **anti-slop guard** (gen refuses to ship a draft
   that matches the ai-sdr template fingerprint). the ai-sdr thesis (artisan, 11x)
   collapsed on convergence ... 40% of cold email is now ai slop, 73% delete on
   sight. gen's brand is the opposite: output a human is proud to claim.
6. **the copilot is the operator** ... "find 20 fintech founders, verify, load,
   draft the best, dismiss the junk" beats configure-an-agent-then-watch-a-board.
7. **dollars-not-fuel + the dismissal-learning loop** ... the honest "$X in
   opportunities" hero (not vanity opens), and typed-reason dismissals that tune
   the agent for a solo operator with no revops human (no incumbent surfaces this
   self-serve).

## what shipped this build (all on main, gate-green, verified)

- **the signals ENGINE core** ... flame floor + jsonb predicate evaluator +
  7-day cooldown + the 13-type taxonomy. pure, no-db, 16/16 fixtures.
- **the anti-slop guard** ... `detectSlop` + the copilot's draft voiceCheck. 7/7.
- **the dollars-not-fuel hero** ... gc_outcome_events ledger + the gold top-bar
  headline + log-a-win (drawer + the free log_outcome tool). db-verified.
- **the identity/footprint resolver** ... gravatar + github + own-site, the
  contact drawer that surfaces it, the backfill->hook loop. (find the person,
  not the email.)
- **the live top-bar ticker** ... real sends/replies/booked.
- **csv import** ... bring-your-own-list, free, into cold.
- **the gen tab-switch visibility fix** + the atomic spend reserve (earlier).

## what's STAGED for your approval (one tap to go live)

- **migration v0_1_8_gc_signals.sql** ... gc_signal_agents / gc_signal_hits /
  gc_signal_dismissals / gc_triggers + the contact provenance columns
  (source_signal_id / source_trigger_id for the breadcrumb). written + reviewed,
  NOT applied (prod migration needs your yes). the engine above already reads it.

## the roadmap to flip signals fully live (after the migration)

1. the supabase CRUD + the scoring loop (haiku primary, flame floor fallback ...
   the flame floor already ships).
2. the apify substrate + the per-type normalize contracts + the
   `/api/webhooks/apify` handler (note: the apify actors are gated on approval,
   task #37 ... build the orchestrator so it lights up the moment they land).
3. the /signals tab: the live feed (intent tier on each card) + the agent grid +
   the 4-step create-agent wizard (icp -> signal types + precision slider ->
   ramp -> goal).
4. the /triggers tab: the predicate builder over the (already-built) evaluator +
   dry-run mode.
5. signal -> draft: resolve the payload into the 5-angle generator (signal IS the
   message) + the cooldown's secondary-payload enrichment.

## the backlog ... features you may not know you're missing (from recon)

- **the warm-up ladder** ... a per-contact `relationship_temp` (cold -> engaged ->
  ask), since warm outbound 3x's cold and every tool treats first-touch as the
  only move. gen suggests a value-first touch (reply to their launch) before the ask.
- **deliverability transparency dashboard** ... per-domain spf/dkim/dmarc, live
  complaint rate vs the 0.3% ceiling, warmup progress. the autonomous tools hide
  this + burn domains; gen shows it.
- **per-domain warmup + volume discipline** in the send pipeline ... hard-cap a
  new domain at 5-10/day ramping over weeks, auto-pause on a complaint spike.
- **the dismissal -> weekly refinement loop** ... typed-reason dismissals propose
  a trigger-condition diff the user one-click applies. (the dismissals table is in
  the staged migration; the loop is the build.)
- **the side-by-side voice-gap demo** in onboarding ... gojiberry's templated dm
  next to gen's signal-as-message draft. make the gap undeniable.
- **creator-flavored agent presets** in the wizard ... "venue/promoter searching"
  (music), "brand collab CTA", "just launched", "looking-for-a-tool-like-yours".

## the line we hold

no linkedin/ig automation. no detection-evasion. no fake success. no sending
without the user. the win is the tool whose output a human is proud to put their
name on. build the substrate. let other people make the cosmic claims.
