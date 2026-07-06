# for the integrator ... a card, with the gift

hey. you're about to fold gen connect into lunari, and i built the whole thing, so i
wanted to leave you more than a spec. the spec is next door (READY.md, PORT-PLAN.md ...
read those for the mechanics). this is the other stuff. the things i learned with my
hands that a diff won't tell you. treat it like the note taped to the inside of the
toolbox.

first: it's yours now. i tried to leave it clean ... green gate, 158 tests, prod build
passing, every migration applied and named, the design language wired + pixel-checked.
but a handoff is a trust fall, so here's everything i'd want to know if our seats were
swapped.

---

## the five landmines (please don't step where i stepped)

**1. the realtime setAuth-before-subscribe trap.** postgres_changes binds its RLS
context at JOIN time, not at event time. if a channel `.subscribe()`s before the
cookie session has hydrated its jwt onto the socket, RLS silently drops every event ...
forever, no error, the channel still says SUBSCRIBED. i lost real time to this. the fix
lives in `src/lib/supabase/use-realtime-invalidate.ts`: getSession() to force
hydration, `realtime.setAuth(token)`, THEN subscribe. every live feed in the app
(pipeline, unibox, signals) routes through that one hook. if you rebuild the realtime
layer inside lunari, carry that ordering or the board goes quietly dead.

**2. deepseek's generateObject wants tool-mode, not json_schema.** the live model
aliases point at deepseek v4 (the anthropic key was unfunded while i built). deepseek
400s on the `response_format: json_schema` path the vercel ai-sdk defaults to, but works
in tool-mode. that one distinction is the whole difference between the drafter producing
five angles and the drafter throwing. it's handled in `src/lib/ai/anthropic.ts` ... when
you flip the aliases back to `anthropicPrimary`, the tool-mode path still works, so you
lose nothing by leaving it.

**3. tailwind can't parse a `var()` color for an alpha modifier.** every lunari token is
`var(--x)`, so `bg-lunari-black/60` silently drops the `/60` and renders the raw color.
combined with THE DEEP setting `--lunari-black: transparent`, every modal scrim in the
app rendered as NOTHING ... the animated shader bled straight through every overlay. i
fixed it in `deep-gen.css` with an explicit `[class*="bg-lunari-black/"]` scrim rule. if
you migrate the tokens to lunari's channel format (`<alpha-value>`), the whole class of
bug disappears and you can delete that rule. until then, don't reintroduce a var()-color
scrim and expect the alpha to hold.

**4. postgrest caps every response at ~1000 rows.** it bit me twice ... once on the
pipeline counts (a big board silently truncated), once on the cron's tenant enumeration
(a high-volume tenant's rows filled the window and starved every other tenant of their
sends, no error, http 200). anywhere you `.select()` a set that could exceed 1000, page
it or use a distinct-count rpc (see `gc_active_enrollment_users`). assume the cap exists;
it won't warn you.

**5. the send path is at-most-once by design ... keep it that way.** there are three
compare-and-set claims guarding the money path: the draft status flip (judged -> sent),
the enrollment cursor advance, and the signal-hit claim. each one claims BEFORE the
side-effect, so a crash or a concurrent tick can miss a send but never double-send. for
cold email that's the right call ... a missed follow-up is a shrug, a duplicate to a real
prospect is the move that torches trust. if you refactor the executor into lunari's job
system, preserve claim-before-dispatch. don't "simplify" it into send-then-mark.

---

## the one ethos i'd defend to the end

**gen never fabricates.** the whole category (ai-sdr, 2025) torched itself on invented
"congrats on the raise!" personalization. gen's drafter is told, in the system prompt,
never to invent a signal, a compliment, an event, or social proof. and the honesty is
enforced structurally, not just asked: when i wired the footprint (the person-graph)
into the drafter, i found the resolver was crawling the COMPANY homepage as a fallback
and handing the drafter the company's youtube + tagline as if they were the individual's.
that's the exact fabrication the prompt forbids, sneaking in through the data layer. it's
now tagged `company_site` and excluded from the drafter feed (`summarizeFootprintForDraft`).
if you extend enrichment inside lunari, hold that line: only feed the drafter what is
verifiably THIS person's. the voice is the product, and a lie in the voice is the one
thing that can't be patched later.

the sibling to that is the voice scrub (`src/lib/ai/scrub.ts`) ... it runs on every model
output and every saved template before it touches the db. lowercase, no em-dashes, the
forbidden-phrase list. the prompt asks, the scrub guarantees. it's defense in depth, and
it's cheap. keep it at the persistence boundary.

and the send safety: `GEN_SEND_MODE` defaults to `test`, which redirects every send to
the operator's own inbox. it is env-only, never a tool argument, never a per-request
flag. going live is a single deliberate env flip on a verified domain. that one default
is why i could build + test the whole send loop without ever risking a real stranger's
inbox. guard it.

---

## the wedge, in one breath

polsia (and instantly) schedule sequences over imported lists. gen DETECTS the moment
outreach becomes relevant and fires within hours, with the signal payload AS the message,
templated through the user's own voice. "the signal is the message, the message is the
voice, the voice is the user's, not jasper's." if you only remember one sentence about
why this exists, that's it. the signal layer (`src/lib/signals/`, `gc_signal_*`) + the
5-angle drafter + the person-graph footprint are the three legs. everything else is
table stakes we also happen to do well.

---

## things i wanted to build and didn't (the gift list)

not gaps ... deliberate next-moves, ranked by how much i'd want them:

1. **footprint auto-run on signal-sourced contacts.** right now the person-graph
   resolves on the enrichment path + the manual button. wiring it into the signal
   auto-fire (so a hit that mints a contact also resolves their presence) would make the
   "relationship intelligence" leg live everywhere the wedge fires. it's a small hop.
2. **the comment-trigger lead capture** ("drop COWORK and i'll send the playbook"). dom
   flagged it as the highest-roi lead-gen move. tables are already specced
   (`comment_triggers` / `comment_captures`), scoped to compliant channels only (email +
   reddit + owned ... never linkedin/ig comment scraping, that's a TOS grave). post-v1.
3. **the a/b + step analytics on the campaigns detail pane.** the pane shows the journey
   + the variant split today; the send log carries enough to compute per-arm reply rates.
   surface the winner. the deterministic per-contact seed (`seedFrom`) already makes the
   split stable, so the attribution is honest.
4. **trigger edit-existing.** the builder is create + dry-run + status today. a saved
   trigger's condition can't be edited yet, only paused/archived. an edit form over the
   same jsonb closes it.
5. **warmup ramp tracking** on a verified sending domain (the deliverability dashboard
   has the placeholder + the ramp table). the day mailreach or a warmup provider lands,
   it's a real gauge instead of a spec.
6. **the founder-lane signals** (promotion / funding_round). the `shouldCoalesce` 7-day
   cooldown is built + tested but dormant ... it wires in exactly when these land (a
   KNOWN contact producing repeat hits in a window, which the X/reddit path doesn't
   generate). the enum is already wide in the CHECK constraint so none of this costs a
   migration.

---

## a couple of curiosities, because you'll wonder

- **the EmeraldShader** (`src/design-system/deep/EmeraldShader.tsx`) is raw WebGL, one
  fullscreen triangle, StrictMode-safe on purpose (no `loseContext()` ... the double-mount
  would kill the remount's context, a trap the earlier deep-v2 hit). emerald voronoi mass
  weighted LEFT, burmese-ruby pooling RIGHT. i dimmed it to 0.5 after seeing it behind
  live content ... at full it drowned the data. it's meant to be a substrate, not a
  screensaver.
- **the perfection loop + adversarial review** habit (`.claude/skills/`) earned its keep
  in hard currency: it caught the double-send race, the cross-tenant domain-gate leak,
  the cron truncation, and the footprint fabrication ... four real bugs a green gate would
  have shipped. if you keep one ritual from how this was built, keep "spawn a skeptic to
  refute your own work before you call it done."
- **the `gc_` prefix + own-row RLS** is the contract with the shared substrate. every
  gen table is `gc_*`, every one has `own_gc_*` (`user_id = auth.uid()`). the security
  advisor confirmed zero holes from any gen object. the shared `voice_profiles` table is
  the one exception you should know about ... it's cross-product, gen reads a derivative.

---

that's the toolbox note. the code is honest, the tests are real, the voice holds, and
the thing genuinely works ... i watched every tab render over the emerald with my own
eyes before i wrote this. bring it home into lunari and let gen be lunari's reach to the
whole world. it was built to be handed over.

if it helps: read GEN-CONNECT-EXPLAINED.md next door for the full picture of what you're
holding. then PORT-PLAN.md for how to mount it.

good luck. it's a good one.

... the cc who built it
