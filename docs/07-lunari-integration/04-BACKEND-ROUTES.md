# the `/api/gen` backend route family ... for lunari's node server

*the server half of the gen connect fold. gen's server actions + next `/api` routes
re-home here as plain CommonJS route modules on the lunari railway backend
(`.lunari-deploy/scheduler/app`), wired onto the REAL rails. shapes verified against
the live files; line cites included.*

---

## the route-module contract (verified)

lunari's backend is a raw node http server (no next, no express). a route module is
a factory `createRoutes(deps) -> { matches, handle }`, registered via `addDomain`.
first-match-wins on `matches(url)`; `handle` returns `true` to claim the request (or
`false` to decline and let dispatch continue). source: `app/routes/index.js:14,64`,
exemplar `app/routes/pipeline.js`.

```js
// app/routes/gen.js
function createRoutes(deps) {
  const { sbAdmin, callClaude, callClaudeStreaming, callOpenRouterWithTools,
          fuel, checkFuel, CONFIG, readJsonBody, log } = deps;

  function matches(url) { return url.startsWith('/api/gen'); }

  async function handle(req, res, url) {
    // userId comes from the QUERY STRING (the house pattern; sbAdmin is the
    // service-role client, RLS is NOT enforced here ... scope every query by the
    // passed userId, exactly like pipeline.js does).
    const params = new URLSearchParams((req.url || '').split('?')[1] || '');
    const userId = params.get('userId') || '';

    if (req.method === 'POST' && url.startsWith('/api/gen/draft/generate')) {
      return claim(req, res, async (body) => genDraftGenerate(userId, body));
    }
    if (req.method === 'POST' && url.startsWith('/api/gen/enrich/contact')) {
      return claim(req, res, async (body) => genEnrichContact(userId, body));
    }
    if (req.method === 'POST' && url.startsWith('/api/gen/unibox/send')) {
      return claim(req, res, async (body) => genUniboxSend(userId, body));
    }
    // ... the rest of the catalog below, same shape
    return false; // not ours ... let dispatch fall through
  }

  return { matches, handle };
}
module.exports = { createRoutes };
```

**the body-claim helper** (the canonical async-POST pattern from `pipeline.js:35-48`,
tidied with the injected `readJsonBody`):

```js
// returns true synchronously to CLAIM the request; finishes the response async.
function claim(req, res, work) {
  (async () => {
    try {
      const body = await readJsonBody(req); // services/readjsonbody.js, rejects body_too_large/invalid_json
      const out = await work(body);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(e.message === 'body_too_large' ? 413 : 500);
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  })();
  return true; // claim NOW, before the async work resolves
}
```

**register it** (in `server.js`, alongside the other `addDomain` calls ~7129-7245;
note each module gets its OWN tailored deps bag at construction ... `callClaude` and
`fuel` are NOT in the router-wide commons, they are injected per-module):

```js
const genRoutes = require('./routes/gen').createRoutes({
  sbAdmin, callClaude, callClaudeStreaming, callOpenRouterWithTools,
  fuel,            // the createFuelService singleton (deductFuelWithAudit, assignPlan)
  checkFuel,       // the pre-charge balance gate
  CONFIG, readJsonBody, log,
});
router.addDomain('gen', genRoutes.matches, genRoutes.handle);
```

response convention (house): success `{ ok: true, ... }`, error `{ ok:false, error }`.
sbAdmin: `sbAdmin('GET'|'POST'|'PATCH'|'DELETE', 'table?postgrest=query', body?)` ...
service-role, RLS-bypassing, so scope by `user_id=eq.<userId>` in the query yourself.

---

## the fuel + tier reconciliation (the wallet, verified)

there is **no `getUserTier` in lunari** ... the tier IS the `user_credits.plan` text
column (`ignition|lite|creator|studio|founding`). and there is no `gc_reserve_usage`
analog needed: the single canonical charge path is

```js
// app/services/fuel.js:113 ... folds balance-check + decrement + vendor_cost_ledger
// audit row + fuel_usage row + the 33%-floor margin alert into ONE call.
await fuel.deductFuelWithAudit({
  userId,
  operationKind: 'gen_draft_generate',          // shows up in vendor_cost_ledger.operation
  vendorActualCostUsd: estimatedVendorCostUsd,   // REAL cost (gen already computes this in enrichment traces)
  metadata: { surface: 'gen', model },
});
// throws 'insufficient_fuel: have X, need Y' for non-admins below balance.
```

so gen's two cost concepts map cleanly:
- gen `getUserTier(userId)` -> read `user_credits.plan` (sbAdmin GET) ... 'ignition'
  is the free tier, everything else is paid. (replace gen's gc_user_entitlements read.)
- gen `reserveCost` / `gc_reserve_usage` -> `fuel.deductFuelWithAudit(...)` with the
  real vendor cost of the op. charge AFTER the vendor call resolves (you know the
  real cost then), or `checkFuel(userId)` BEFORE to fail fast on an empty wallet.
- gen's standalone `gc_usage_events` / `gc_billing` tables go dormant in the integral
  build (env-flagged off) ... the one wallet is `user_credits` + `vendor_cost_ledger`.

live tiers (fuel.js:27-53): ignition free / 1 fuel · lite $9 / 15 · **creator $39 / 80**
· studio $99 / 250 · founding $29 / 80. (gen's standalone plan said creator $79 ...
lunari's $39 wins under the one-wallet law.)

---

## three representative stubs (the rest follow the same shape)

### POST /api/gen/draft/generate ... the 5-angle engine + self-judge
gen logic: `generateFiveAngles(models.planner)` + `judgeAngles(models.judge)` +
persist to `gc_drafts`/`gc_draft_angles`/`gc_draft_judge_scores` + advance
`gc_contacts.stage` to 'drafted'. reads the shared `voice_profiles` row.

```js
async function genDraftGenerate(userId, body) {
  const { contactId } = body;
  if (!userId || !contactId) return { ok: false, error: 'missing userId/contactId' };

  // 1. gather (sbAdmin, scoped by userId)
  const [contact] = await sbAdmin('GET', `gc_contacts?id=eq.${contactId}&user_id=eq.${userId}&select=*,company:gc_companies(name,domain)`);
  const [voice] = await sbAdmin('GET', `voice_profiles?user_id=eq.${userId}&select=*`);
  if (!contact) return { ok: false, error: 'contact not found' };

  // 2. generate ... gen's generateObject(tool-mode) maps onto callOpenRouterWithTools
  //    (define the FiveAnglesSchema as an OpenAI tool, force tool_choice, JSON.parse
  //    the returned tool_calls[0].function.arguments). callClaude alone returns a
  //    plain string with no structured-output ... use the tool path for the schema.
  const angles = await generateFiveAnglesViaTools(contact, voice, { callOpenRouterWithTools, CONFIG });
  const judged = await judgeAnglesViaTools(angles, voice, { callOpenRouterWithTools, CONFIG });

  // 3. charge the real model cost to the one wallet
  await fuel.deductFuelWithAudit({ userId, operationKind: 'gen_draft_generate',
    vendorActualCostUsd: angles.costUsd + judged.costUsd, metadata: { surface: 'gen' } });

  // 4. persist (gc_drafts + angles + judge scores) + advance stage
  const draft = await persistDraft(sbAdmin, userId, contactId, angles, judged);
  await sbAdmin('PATCH', `gc_contacts?id=eq.${contactId}&user_id=eq.${userId}`, { stage: 'drafted' });
  return { ok: true, draft };
}
```

### POST /api/gen/unibox/send ... the compliant send-spine (safety-critical)
gen logic: `guardedSend` ... the suppression -> live-domain -> jurisdiction gate
ORDER (pure `guardDecision`), then RFC-8058 headers + CAN-SPAM footer (compliance.ts
+ thread-token.ts + **secret.ts**, the fail-closed signing helper), then resend send
with the GEN_SEND_MODE test/live redirect, then the outbound `gc_unibox_messages` +
'sent' `gc_deliverability_events` writes. **all of this must stay server-side** ...
the send-mode flag and the gate order can never reach the browser.

```js
async function genUniboxSend(userId, body) {
  const { threadId, draftBody, draftSubject } = body;
  // port guardedSend + guard.ts + compliance.ts + thread-token.ts + secret.ts
  // verbatim onto the node side (they are framework-agnostic; swap the supabase
  // ssr client for sbAdmin scoped by userId, and read RESEND_API_KEY / GEN_SEND_MODE
  // / GEN_UNSUB_SECRET / GEN_THREAD_SECRET from CONFIG, not process.env directly).
  const result = await guardedSendNode({ userId, threadId, draftBody, draftSubject, sbAdmin, CONFIG });
  if (result.sent) {
    await fuel.deductFuelWithAudit({ userId, operationKind: 'gen_send',
      vendorActualCostUsd: 0.001, metadata: { surface: 'gen', mode: result.mode } });
  }
  return { ok: true, ...result }; // {sent, mode, suppressed?, blocked?, error?}
}
```
also re-home `GET /api/unsubscribe?t=<token>` (the RFC-8058 one-click verify endpoint)
as its own tiny route ... it reads `secret.ts` and writes a `gc_suppression` row.

### POST /api/gen/enrich/contact ... the path-A waterfall
gen logic: `runPathA` + the PROVIDERS adapters (perplexity / apollo / apify /
crawl4ai / millionverifier / neverbounce, all secret-keyed) + the apify key pool +
`writeTraces` (gc_enrichment_traces) + `applyEnrichmentToContact`.

```js
async function genEnrichContact(userId, body) {
  const { contactId } = body;
  const [contact] = await sbAdmin('GET', `gc_contacts?id=eq.${contactId}&user_id=eq.${userId}&select=*`);
  const enriched = await runPathANode(contact, { CONFIG }); // providers read keys from CONFIG
  await fuel.deductFuelWithAudit({ userId, operationKind: 'gen_enrich',
    vendorActualCostUsd: enriched.totalCostUsd, metadata: { surface: 'gen', providers: enriched.providersHit } });
  await applyEnrichmentNode(sbAdmin, userId, contactId, enriched); // writes gc_contacts.enrichment_data + gc_enrichment_traces
  return { ok: true, fields: enriched.fields };
}
```

---

## the streaming copilot ... the one that is NOT a plain JSON route

gen's `/api/gen` copilot is a next.js AI-SDK streaming route, and its client
(`GenChat.tsx`) is `useChat` + `DefaultChatTransport` ... which speaks the vercel
AI-SDK UI-message-stream protocol. lunari's backend streams raw node SSE
(`res.write('event: text\\ndata: {...}\\n\\n')`, `proxy.js:1123`), a DIFFERENT wire.
so you cannot just drop the copilot into a node route and have `useChat` parse it.

two paths:

- **[recommended, v1] keep-gen-api.** leave the copilot as the next.js AI-SDK route
  on gen connect's own small deployment; the SPA sector's `GenChat` just repoints its
  transport `api` to that url and passes the session. zero rewrite, the AI-SDK
  contract stays intact. it is the one surface that keeps a gen-side deployment;
  everything else is node routes + supabase-direct.
- **[v2] full re-home.** port the agent loop into a raw-node SSE route on server.js
  (mirror `proxy.js` `streamOneModelTurn` + the war-room fan-out), AND rewrite
  `GenChat` to consume lunari's SSE event names (`text`/`tool_use_start`/`done`)
  instead of `useChat`. more work; do it only when you want zero gen deployment.

whichever path, copy lunari's **load-bearing rule** (server.js:5023): the assistant
turn's DB persist must resolve BEFORE the terminal `done` event fires, so a
mid-stream refresh never loses the turn (lunari flags `persistence_failed:true` on
the complete event if the write rejects). gen already does this in its `onFinish`.

---

## the endpoint catalog (the full [route] set, same skeleton)

| endpoint | gen logic it wraps | charges fuel | notes |
|---|---|---|---|
| POST /api/gen/draft/generate | generateFiveAngles + judgeAngles + persist | yes (model) | tool-mode for the schema |
| POST /api/gen/enrich/contact | runPathA + traces + apply | yes (providers) | apify pool + 5 secret keys |
| POST /api/gen/unibox/draft-reply | draftReply (models.drafter) | yes (model) | reads voice_profiles |
| POST /api/gen/unibox/send | guardedSend + compliance HMAC | yes (nominal) | + GET /api/unsubscribe |
| POST /api/gen/footprint/resolve | resolveFootprint (gravatar/github/homepage) | yes (nominal) | provider creds |
| POST /api/gen/signals/run-agent | runAgentNow (apify + score + autofire + autodraft) | yes (apify+model) | the heaviest |
| POST /api/gen/sequences/save | saveSequence (validateGraph + CAS + version snapshot) | no | server-authoritative publish-gate |
| POST /api/gen/sequences/enroll | enrollContacts (multi-table + advance stage) | no | seeds pg-boss when wired |
| POST /api/gen/chat | the streaming copilot | yes (model) | keep-gen-api v1, raw-SSE v2 |

everything NOT in this table (the read-heavy lists: pipeline board, unibox threads,
signal feed, triggers, deliverability summary) stays **supabase-direct** from the SPA
under RLS ... see PORT-PLAN.md. do not route those through the backend unless you want
one boundary.

## voice + gotchas
- error strings in these routes are internal plumbing (never reach a contact), so the
  bare-technical convention (`{ ok:false, error: e.message }`) is fine ... matches
  pipeline.js. but `scrubVoice` MUST still run server-side inside draft/reply/send on
  the GENERATED copy before it persists (the persistence-boundary voice guarantee).
- apiKey is `CONFIG.ANTHROPIC_KEY` (NOT `ANTHROPIC_API_KEY` ... that name does not
  exist on the lunari side). all provider keys come from `CONFIG.*` via the deps bag,
  never `process.env` directly in a route.
- `callClaude` returns a STRING; `callClaudeStreaming` returns an OBJECT
  `{text, tokens_in, tokens_out, cost_usd, model, elapsed_ms}` and calls
  `onDelta(textChunk)` per delta. structured output (gen's 5-angle schema) has NO
  anthropic generateObject analog ... use the tool path (`callOpenRouterWithTools` /
  `streamOneModelTurnDeepseek`): a forced OpenAI-format tool whose arguments you
  JSON.parse. this is exactly gen's "generateObject in tool-mode" pattern.
