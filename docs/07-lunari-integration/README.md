# gen connect -> lunari ... integration handoff

the complete artifact set for folding gen connect into lunari as a native sector that
replaces the existing `outreach` tab. built from two verified multi-agent sweeps: one
mapping every gen surface, one mapping lunari's real node backend (router contract,
call layer, SSE, fuel/entitlement, the outreach_contacts write sites). every shape is
cited to a real file; the adversarial verify pass caught the table-name + signature
slips before they reached these docs. hand this folder to the lunari cc; dom relays.

## read in this order

**the plan**
1. **`PORT-PLAN.md`** ... the spine. the one-line mount point (App.tsx:767), the
   thin-client / fat-backend split, the per-surface data map (supabase-direct read vs
   a `/api/gen` node route), the three reconciliations, the next->react-router rewire
   catalog, the fold sequencing.

**the frontend half**
2. **`tailwind-alias-block.js`** ... paste-ready. the `lunari-*`/`gen-accent` color
   aliases + the `global.css` var-aliases + gen's custom classes/keyframes, so gen's
   components render unchanged. with the honest slash-opacity caveat.
3. **`ConnectSector.template.tsx`** ... the sector scaffold, mirroring `ResearchPage`
   (the atlas sector): internal sub-nav, `useAuth()` userId, the `genApi()` route-fetch
   pattern + the supabase-direct read pattern.

**the backend half**
4. **`04-BACKEND-ROUTES.md`** ... the `app/routes/gen.js` route family. the real
   route-module skeleton + body-claim helper + addDomain registration, wired onto the
   actual `callClaude`/`callClaudeStreaming` + `deductFuelWithAudit` signatures, three
   full endpoint stubs, the streaming-copilot decision (keep-gen-api v1 vs raw-SSE v2),
   and the full endpoint catalog.
5. **`05-CONTACTS-BRIDGE.md`** ... the `outreach_contacts` -> `gc_contacts`
   reconciliation. all 12 crew write sites (file:line), the column + 2-axis stage
   mapping, the shared `saveGenContact` helper, and repoint-vs-mirror with a
   recommendation.

## the headline

the hard part is already done. gen + lunari share one supabase project, one login,
one design system, one `voice_profiles` voiceprint ... and the gc_* tables are already
live on the shared substrate. so the fold is a thin-client sector + a `/api/gen` node
route family + the contacts reconciliation. **no data migration.** per the Hearthstone
law, gen folds second, after nova.

## what the verify passes corrected (so you can trust the rest)
- voice reads the shared `voice_profiles` table, NOT `gc_user_profiles`/`gc_voice_corpus`.
- `markBooked` writes `gc_outcome_events`, NOT a phantom `gc_opportunities`.
- the sending-domain check is live-mode-only.
- there is NO `getUserTier` in lunari ... the tier is the `user_credits.plan` column.
- the anthropic key is `CONFIG.ANTHROPIC_KEY`, NOT `ANTHROPIC_API_KEY`.

## the decisions that are dom's, not the cc's
- contacts: repoint the crew's discovery inserts at `gc_contacts` vs mirror (05).
- wallet: gen's spend reconciles into the one fuel ledger (`deductFuelWithAudit`),
  creator tier is lunari's $39/80, not gen's standalone $79 (04 + PORT-PLAN).
- the streaming copilot: keep gen's next deployment for that one surface (v1) vs the
  full raw-SSE re-home (v2) (04).
