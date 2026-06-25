# gen connect -> lunari sector ... the port plan

*the handoff for folding gen connect into lunari as a native sector, replacing the
existing `outreach` tab. built from a verified map of every gen surface (17-agent
sweep, each spec adversarially checked against the real files). hand this to the
lunari cc; dom is the merge layer.*

last mapped: 25 june 2026. gen connect side: `C:\Users\xnuon\Desktop\gen connect\gen-connect-titan-init`. lunari side: `C:\Users\xnuon\OneDrive\Desktop\lunari`.

---

## the shape of it

gen connect is next 16 (app-router, server actions, RSC, vercel ai-sdk, supabase
ssr). lunari is a vite + react-router SPA with a SEPARATE railway node backend
(plain http handler, no next). you cannot file-merge those. but you do not need to
... the substrate is already shared (same supabase project `fpposmirumtbocqtxued`,
same login, same design tokens, same `voice_profiles` voiceprint). the gc_* tables
gen uses are ALREADY live on that project. so the fold is: a thin client sector +
a fat backend route family + three reconciliations. no data migration.

**the mount point is one line.** `lunari/frontend/src/App.tsx` line 767:
```
{showOutreach && <OutreachPage />}   ->   {showOutreach && <ConnectSector onTakeIntoChat={handleResiduePrompt} />}
```
keep the `outreach` view key (or rename to `connect` in `VIEW_PATHS` + the nav).
mirror the atlas-research sector (`ResearchPage`, line 771): a self-contained
component that takes an optional callback prop and reads its own `userId` from
`useAuth()`. the old `OutreachPage` (a thin pipeline kanban over `outreach_contacts`)
gets retired ... gen connect supersedes it.

**the two halves:**

1. **thin client** ... gen's react views become one `ConnectSector` with its own
   internal sub-nav (pipeline / unibox / signals / campaigns / triggers / copilot),
   mounted in lunari's `<main>`. the views are already `"use client"` react +
   tailwind; the rewire is routing + data access + tokens (below).

2. **fat backend** ... everything that holds a secret, sends, costs money, or runs
   an llm re-homes onto the railway node backend as a new `/api/gen*` route family
   (`app/routes/gen.js`, registered via `addDomain`), using `sbAdmin` for db and
   `callClaude` / `callClaudeStreaming` for ai. this mirrors how atlas research goes
   through the node backend via `researchApi.ts`.

---

## the data-access rule (read this before porting any surface)

the SPA's house pattern is **node-backend fetch** ... every sector hits
`${API_URL}/api/...?userId=` (`API_URL` from `frontend/src/lib/api.ts`, do NOT
re-hardcode it). it never reads contacts directly through supabase.

so, the split, applied per surface below:

- **privileged / ai / send / enrichment / cost / entitlement / signing** -> a
  `/api/gen*` route on the node backend. NON-NEGOTIABLE. provider keys, the resend
  send-mode flag, the spend ceiling, and the gate ORDER must never reach the
  browser. these are marked **[route]** below.
- **read-heavy lists + trivial RLS writes** -> two valid options. **[direct]**
  means it CAN run as a supabase-js call against the gc_* tables with the anon key
  under RLS (the tables already have RLS). that ships the sector fastest with zero
  backend work. matching the house pattern (routing reads through the node backend
  too) is more consistent but more work. **recommendation: ship reads [direct]
  first, route the privileged paths always; migrate reads to routes later if the
  lunari cc wants one boundary.**

the supabase browser client already exists at `frontend/src/lib/supabase.ts`
(singleton, anon key, RLS-scoped to the session) ... reuse it, do not make a new one.

---

## per-surface port map (verified)

### pipeline
- **[direct]** `listContacts` / `fetchContacts` (gc_contacts + gc_companies; PORT
  THE `.range()` 1000-row paging loop verbatim or the board truncates), the
  contact ops `updateContactStage` / `moveContactsStage` / `addContactTags`,
  `getContactDetail` (parses `enrichment_data` + footprint jsonb client-side),
  `listSequences` (gc_sequences, the enroll picker), `recordOutcome` (gc_outcome_events,
  server-set user_id), `loadLeads` (csv import dedupe-insert; parse is already
  client-safe in `utils/csv.ts`), `getVoiceProfile` (reads the shared
  **`voice_profiles`** table ... the `active_for_outreach` flag for the nudge banner).
- **[route]** `resolveFootprint` (gravatar + github + homepage crawl, provider
  creds), `enrollContacts` (advances gc_contacts.stage + seeds the pg-boss send
  tree, executor deferred).
- rewires: `next/link` voice-nudge -> react-router `Link`; per-card "draft outreach"
  -> `useNavigate('/draft/:id')`; `useRouter().refresh()` + every `revalidatePath`
  -> react-query `invalidateQueries`; the async RSC `page.tsx` loader -> a
  react-router loader / react-query `initialData`.

### unibox
- **[direct]** `listThreads` / `fetchThreads` (gc_unibox_threads + messages +
  contacts + companies), `getThreadMessages`, `markThreadRead`, and the realtime
  channel `useRealtimeInvalidate` on gc_unibox_messages ... this PORTS UNCHANGED,
  it is framework-agnostic, but it carries the load-bearing
  `getSession -> realtime.setAuth -> subscribe` ordering (the fix that makes rls
  actually deliver live). hand it the SPA browser client and keep that order.
- **[route]** `draftReply` (ai generateObject + scrubVoice + voice_profiles read),
  `guardedSend` (the WHOLE compliant send-spine: suppression gate / jurisdiction
  gate / RFC-8058 headers / CAN-SPAM footer / test-mode redirect / then the outbound
  + 'sent'-ledger writes), `markBooked` (atomic: gc_contacts stage 'booked' +
  gc_outcome_events 'meeting_booked' ... NOT gc_opportunities; that table does not
  exist).
- rewires: `next/link` /draft/:id, drop revalidatePath, swap the supabase client.

### signals
- **[direct]** `listAgents` / `listHits` (gc_signal_agents / gc_signal_hits), the
  agent-crud `createAgent` / `setAgentStatus` / `dismissHit` (gc_signal_dismissals),
  the gc_signal_hits realtime channel, `listHitsForDryRun`.
- **[route]** `runAgentNowAction` ... the whole live pull: apify key pool
  (searchX/searchReddit) + `scoreSignalHit` (deepseek/haiku + flame floor) + the
  cost/entitlement reserve + the trigger auto-fire loop (`evaluateTrigger` +
  `incrementTriggerFire` + `enrollContacts`) + the gated 5-angle auto-draft.
  `draftFromHitAction` is also a route (kept server-side for its atomic
  claim-create-link rollback correctness, even though it holds no secret).
- rewires: `useRouter()` + `Route` push -> `useNavigate('/draft/:id')`.

### campaigns + sequences (the xyflow editor + the ledger)
- **[direct]** `listSequences` / `getSequence` (gc_sequences).
- **[route]** `createSequenceAction` (server-side template resolution ... never
  trust a client graph), `saveSequenceAction` (server-authoritative `validateGraph`
  publish-gate + the optimistic-concurrency CAS loop + the gc_sequence_versions
  snapshot), `enrollContactsAction` (multi-table + advances gc_contacts.stage).
- ports AS-IS (pure, no server imports): `validate.ts`, `compile.ts`, `spintax.ts`,
  `templates.ts`, `types/sequence.ts`, and the xyflow editor client.
- rewires: `next/link` + typed-route href -> react-router `Link` / `useSearchParams`.

### triggers
- **[direct]** the entire surface is CRUD over the gc_triggers jsonb: `fetchTriggers`,
  `createTriggerAction`, `setTriggerStatusAction`, `testTriggerAction` (dry-run count
  over gc_signal_hits), `fetchSequences`. `evaluateTrigger` + the summary helpers are
  pure. no next/link, no ai. the zod schemas move into the browser bundle.
- the FIRE path (executing 'enroll'/'draft', `incrementTriggerFire`, the cooldown
  coalesce) is the apify-webhook-gated future path ... NOT wired in this surface
  today; it becomes a **[route]** only when it lands.

### gen copilot
- **[route]** the whole `/api/gen` streaming loop: `streamText(models.planner)` +
  `buildGenTools(userId, tier)` (all 16 tools) + the `voiceScrubTransform` on every
  delta + `stopWhen stepCountIs(12)` + `onFinish` persist/compact. plus the cost +
  entitlement + ratelimit spine (`getUserTier` over gc_user_entitlements,
  `reserveCost -> reserveUsage` the atomic gc_reserve_usage RPC, `checkGenRateLimit`
  upstash) and `persistMessage` / `maybeCompact` (gc_gen_conversations / gc_gen_messages).
  re-home as a streaming endpoint on `callClaudeStreaming`, OR keep-as-api (call
  gen's deployment) for v1.
- **[direct]** `fetchGenThread` / `loadRecentMessages` (gc_gen_conversations /
  gc_gen_messages, RLS reads).
- client: `GenChat.tsx` is `useChat` + `DefaultChatTransport({api})` ... repoint
  `api` from `/api/gen` to the lunari backend, swap the `fetchGenThread` import for
  a direct read or a fetch.

### drafting + enrichment + send core (the server brains)
re-home as discrete routes (each re-reads the row under the caller's jwt; the client
only passes an id/body):
- **POST /api/gen/draft/generate** ... `generateFiveAngles(models.planner)` +
  `judgeAngles(models.judge)` + persist (gc_drafts / gc_draft_angles /
  gc_draft_judge_scores) + `updateContactStage('drafted')`. reads `voice_profiles`.
- **POST /api/gen/enrich/contact** ... `runPathA` + the PROVIDERS adapters
  (perplexity / apollo / apify / crawl4ai / millionverifier / neverbounce, all
  secret-keyed) + the apify key-rotation pool + `writeTraces` (gc_enrichment_traces)
  + `applyEnrichmentToContact`. (`waterfall.ts` planNext/mergeFields is pure, reuse.)
- **POST /api/gen/unibox/draft-reply** ... `draftReply` (models.drafter + scrubVoice).
- **POST /api/gen/unibox/send** ... `guardedSend` + the compliance HMAC stack:
  `compliance.ts` + `thread-token.ts` + **`secret.ts`** (the signing-secret helper,
  `signingSecret` / `secretIsTrustworthy`, fails closed in prod ... it is part of
  the trust boundary, re-home it too). the matching `/api/unsubscribe` verify
  endpoint re-homes alongside.
- `models` / `anthropic.ts` (the alias table + keys) lives server-only, maps 1:1
  onto `callClaude` / `callClaudeStreaming` (swap the vercel-ai-sdk
  `generateObject`/`streamText` for the node https wrappers).
- `scrubVoice` runs server-side INSIDE every generate/send route ... the
  persistence-boundary voice guarantee, never trusted to the client.

### deliverability + the spf/dkim/dmarc wizard
- **[direct]** `deliverabilitySummary` (gc_deliverability_events + gc_suppression
  counts; it also reads `GEN_SEND_MODE` / `GEN_SEND_FROM` env ... serve those from
  the backend or as build-time public config), `listSendingDomains` (gc_sending_domains).
- **[route]** `addDomainAction`, `checkDomainAction` (the `RESEND_API_KEY` secret
  in `fetchResendDomain` + the DoH verify + `saveDomainVerification`).

---

## the three reconciliations (the real decisions)

### 1. contacts: `outreach_contacts` (crew) vs `gc_contacts` (gen)
lunari's crew (atlas scouts, nova drafts) writes the lunari-native
**`outreach_contacts`** table (6 stages: lead/contacted/replied/booked/paid/lost),
via `sbAdmin` in `app/engines/outreach.js`, read by the old outreach tab through
`app/routes/pipeline.js`. gen connect uses **`gc_contacts`** (7 stages:
cold/enriched/drafted/sequenced/replied/booked/closed) + the whole gc_* family,
all already live on the shared substrate.

**recommendation: gen's sector reads gc_*; reconcile the crew flow onto it.** gen
connect is the upgrade ... gc_contacts is far richer (enrichment_data, ai_score,
provenance, footprint). so re-point the crew's scout/draft writes from
`outreach_contacts` to `gc_contacts` (map the 6 stages onto gen's 7), OR keep a
thin bridge that mirrors new `outreach_contacts` rows into `gc_contacts`. this is
the one piece that needs the lunari cc to move on their side. stage mapping:
`lead->cold`, `contacted->sequenced`, `replied->replied`, `booked->booked`,
`paid->closed`, `lost->do_not_contact`.

### 2. the wallet: gen's ceiling vs lunari's one fuel ledger
gen's standalone cost layer (`gc_reserve_usage` RPC + `gc_usage_events`, the atomic
per-user/day spend reserve) and gen's standalone billing (`gc_billing` tables, the
$79 creator tier i built) are the STANDALONE's. lunari's law is **one wallet**:
dollar-denominated fuel via `deductFuelWithAudit` -> `vendor_cost_ledger`, tiers set
by `assignPlan` (creator is **$39 / 80 fuel** in lunari, not $79), the existing
`STRIPE_PRICE_*` envs. in the fold: gen's per-call spend reconciles into
`deductFuelWithAudit` instead of `gc_usage_events`, and `getUserTier` re-points at
lunari's plan source. the seam is already built for this ... `getUserTier`'s own
comment says "when integrated into LUNARI, re-point this one helper." env-flag gen's
standalone billing OFF in the integral build.

### 3. the voiceprint: already shared
good news ... gen ALREADY reads the shared **`voice_profiles`** table (the
`active_for_outreach` column, the v17_8_6 lunari migration), not a gen-private copy.
so the "one voice" law is already half-wired. the drafter routes read `voice_profiles`
server-side; nothing to reconcile here beyond confirming the column ownership.

auth needs nothing: the sector runs inside the SPA, so `useAuth()` already has the
user. no SSO, no cookie-domain work.

---

## the next -> react-router rewire catalog

mechanical, applies across every surface:
- `import Link from 'next/link'` + `import type { Route } from 'next'` -> react-router
  `<Link to=...>` (drop the Route cast).
- `useRouter().push('/x')` / `.refresh()` -> `useNavigate()` / react-query
  `invalidateQueries`.
- `revalidatePath(...)` (next/cache) -> react-query `invalidateQueries` ... no SPA
  equivalent, it just drops out.
- async RSC `page.tsx` (`await` data at the top) -> a react-router route element with
  a loader, or react-query `initialData` from a client fetch on mount (the pattern
  `ResearchPage` uses: `useEffect` -> `refreshAll()` -> `Promise.all` the reads).
- server-action imports (`@/app/actions/*`) -> either a supabase-js call [direct] or
  a `fetch(${API_URL}/api/gen/...)` [route].
- `@/lib/supabase/server` createClient -> the SPA browser client `frontend/src/lib/supabase.ts`.
- the views already use react-query + sonner ... wrap the sector in a
  `QueryClientProvider` (or reuse the app's) and sonner's `<Toaster>` if not present.

## styling
gen's components use tailwind classes (`bg-lunari-surface`, `text-gen-accent`, ...);
lunari's sectors use inline `var(--token)` styles, but tailwind IS wired. two moves:
1. add the **tailwind-alias-block.js** (in this folder) to lunari's `tailwind.config.js`
   `colors` ... maps gen's `lunari-*` / `gen-accent` classes to lunari's live css vars
   (`--gen` #2d5f3f is already a token). caveat inside that file re: `/opacity`
   modifiers.
2. copy gen's custom utility classes + keyframes (`planetarium`, `reveal-up`,
   `gen-verify-pulse`, `surface-raised`, `text-glow-gold`, `lunari-canvas`, and the
   `gen-reveal-up` / `gen-verify-pulse` keyframes) from gen's `src/app/globals.css`
   into lunari's `frontend/src/styles/global.css` (NOT design-system/tokens.css ...
   that file is stale and not imported).

## gotchas (from the lunari map)
- `API_URL` is hardcoded in `frontend/src/lib/api.ts` AND duplicated in the old
  `OutreachPage.tsx` ... reuse the `api.ts` export, never re-hardcode.
- supabase url + anon key are hardcoded in `frontend/src/lib/supabase.ts` (no env).
  reuse the singleton.
- `frontend/src/design-system/tokens.css` is STALE / not imported ... the live
  `:root` is `frontend/src/styles/global.css`. edit that one.
- the SPA never reads contacts via supabase directly today ... if you go [direct],
  you are introducing that boundary on purpose; it is fine under RLS, just know it
  is new for this codebase.

## sequencing (per the Hearthstone law: gen folds second, after nova)
1. **shell + reads** ... add `ConnectSector` (template in this folder), the tailwind
   aliases + the custom css classes, mount it at App.tsx 767, wire the [direct]
   read-only surfaces (pipeline board, unibox threads, signals feed, triggers list,
   deliverability summary) against the live gc_* tables. this alone gives a working,
   styled gen sector reading real data.
2. **the backend route family** ... stand up `app/routes/gen.js` (addDomain) and
   re-home the [route] paths: draft/generate, enrich/contact, unibox/draft-reply,
   unibox/send (+ the compliance HMAC + secret.ts + /api/unsubscribe), runAgentNow,
   the sequence write paths, and the streaming /api/gen copilot. wire each on
   `callClaude` / `callClaudeStreaming` + `sbAdmin`.
3. **the reconciliations** ... contacts (crew -> gc_contacts), wallet (-> deductFuelWithAudit
   + getUserTier re-point), confirm voice_profiles ownership. flip gen's standalone
   billing off.

after step 1 the sector is visible + reading live data; after step 2 it can draft +
send + run agents; after step 3 it is a true citizen of the one mind, one wallet.
