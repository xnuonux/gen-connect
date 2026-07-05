# gen connect · READY FOR INTEGRATION

status: **locked in.** standalone gen connect is feature-complete, verified, and
deployable. this is the go signal for the integrator. the port plan lives beside this
file (PORT-PLAN.md); this doc is the state-of-the-world + the boundary of what's gen's
job (done) vs the integrator's.

branch: `feat/identity-footprint` (never committed to main). all work below is on it.

---

## the gate (all green, this handoff)

- `pnpm typecheck` ... 0 errors (tsc, strict + noUncheckedIndexedAccess)
- `pnpm lint` ... 0 (eslint, react-compiler rules on)
- `pnpm test` ... **158 passed, 0 failed** (pure fixtures: voice scrub, flame, trigger eval, cooldown, sequence compile/due/variants, footprint summary, dns, guard, jurisdiction, compliance)
- `pnpm voice-check` ... passed (lowercase, no em-dashes, everywhere incl. comments)
- `pnpm build` ... **production build succeeds** (all 21 routes compile; pages dynamic via cookies)

## verified real + wired (pre-handoff sweeps)

three independent verification passes + a production build confirmed, with file:line
evidence:

- **all 6 surfaces + shell wired** ... pipeline, unibox, signals, campaigns, triggers,
  gen copilot + the hero band / rail / command palette. no ComingSoon shells (one honest
  empty state), no orphaned actions, no placeholder data.
- **3 core flows wired end-to-end** ... (1) outbound: enrich → footprint auto-resolve →
  5-angle + self-judge → guarded send → enroll → executor/cron; (2) inbound: resend
  webhook → thread → unibox live → gen reply → send; (3) signals: agent → run → hit →
  haiku score / flame floor → trigger predicate → draft/enroll → live feed. three
  independent idempotency guards (draft-status CAS, enrollment-cursor CAS, hit-claim CAS).
- **adversarial reviews** caught + fixed: a double-send race, a cross-tenant leak in the
  live-domain gate, a silent-tenant-drop in the cron enumeration, and a footprint honesty
  defect (company channels were being attributed to the individual ... now excluded).

## what's live in prod (shared substrate `fpposmirumtbocqtxued`)

all `gc_`-prefixed migrations are applied, `v0_1_0` → **`v0_1_18`** (verified against the
live migration list). the two applied this pass:
- `v0_1_17_gc_contacts_realtime` ... adds gc_contacts to supabase_realtime (the board
  fills itself when gen acts).
- `v0_1_18_gc_active_enrollment_users` ... a distinct-user rpc for the cron, execute
  granted only to `service_role`.

security advisors: **zero new advisories from any gc_ object.** every gc_ table has an
own-row RLS policy; the rpc is invoker + service-role-only. (the advisor's other findings
are all pre-existing non-gen lunari tables ... not gen's, not touched.)

## the design language

**THE DEEP** (emerald-ruby) is wired + hardened: the `EmeraldShader` substrate (emerald
mass left, oxblood-ruby right), `deep.css` token layer, and `deep-gen.css` emerald-glass
retint, scoped to `[data-theme='deep']` on `<html>`. a code audit fixed the theme-breakage
(modal scrims, the `[class*='surface']` over-match, whole-viewport blur, alert-vs-ambient
crimson contrast, transparent form wells + avatars).

> **one open item for the integrator: final pixel QA.** the theme is wired,
> audit-hardened, and build-green, but was not eyeballed in a browser this session (the
> chrome extension wasn't connected). to verify: `ENABLE_DEV_LOGIN=true pnpm dev`, hit
> `/api/dev-login`, walk the 6 tabs. everything structural is correct; this is a
> look-and-nudge pass, not a rebuild.

## env vars the integrator provisions

| var | purpose | note |
|---|---|---|
| `GEN_SEND_MODE` | `test` (default) redirects every send to the sender's inbox; `=live` reaches real recipients | going live is this one flip, on a verified domain (lunari.pro) |
| `CRON_SECRET` | gates POST `/api/cron/sequences` (constant-time) | unset ⇒ the autonomous cron stays dark (404) |
| `SUPABASE_SERVICE_ROLE_KEY` | the cron's service-role client | already used by the webhooks |
| `ANTHROPIC_KEY` / deepseek | model routing | aliases currently point at deepseek v4 (anthropic key unfunded) ... flip to `anthropicPrimary` in `src/lib/ai/anthropic.ts` when funded |
| `GITHUB_TOKEN` | raises the footprint github rate limit | optional |
| `RESEND_API_KEY`, `APIFY_TOKEN`, `HUNTER_*`, `MILLIONVERIFIER_*`, `UPSTASH_*` | send / signals / enrichment / rate-limit | per the enrichment + deliverability specs |

## the boundary: gen's job (DONE) vs the integrator's

**gen owns (complete):** the 5 tabs + gen copilot, the enrichment waterfall, the 5-angle
drafter + self-judge + voice scrub, the compliant guarded send-spine (suppression,
jurisdiction, RFC-8058 unsubscribe, CAN-SPAM), the sequence editor + executor + campaigns
console, signals + triggers, the unibox + inbound threading, the deliverability dashboard
+ DNS wizard, the footprint/person-graph wedge, THE DEEP theme.

**the integrator owns (by design, not gaps):**
1. **auth gate** ... standalone gen has no edge middleware; data is RLS-protected but
   there's no `/login` redirect. gen mounts as a **sector inside lunari's already-authed
   shell** (like atlas research), so lunari's shell provides the gate. a standalone
   middleware would be throwaway. see PORT-PLAN.md.
2. **remove `/api/dev-login`** ... the dev-only session minter. double-gated
   (`NODE_ENV!=production` AND `ENABLE_DEV_LOGIN=true`) and deliberately kept OUT of git
   history, so it never ships from a git build. delete the route at integration.
3. **typed supabase client** ... a `database.types.ts` belongs in the monolith where the
   shared schema is owned (generating it in standalone gen would drift). the ~16
   `as unknown as` row casts are the interim contract until then.
4. **schedule the crons** ... the sequence executor (`/api/cron/sequences`) and the
   signals ingestion (`runAgentNow` is in-app today) both have their runner built +
   test-mode-safe; point a scheduler at them with `CRON_SECRET` when going autonomous.

**flagged v1.5 (not blocking):** trigger edit-existing (create + dry-run + status ship
today), footprint auto-run currently skips the company-domain crawl on the auto path
(the manual "find their presence" button does the full crawl), the 7-day cooldown
(`shouldCoalesce`, tested) wires in with the founder-lane signals.

---

read PORT-PLAN.md next for the mechanical sector-mount (tailwind alias block +
ConnectSector template + the backend route + contacts bridge).
