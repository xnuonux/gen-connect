# deployment

the gen connect launch runbook. dev-facing, end to end: accounts, env,
database, vercel, stripe, resend, cron, then the live flips.

steps marked (dom) need dom's own accounts or keys ... a future agent can
prep everything around them but cannot complete those steps itself.

## prerequisite accounts (dom)

you need four accounts before anything else:

- supabase ... the shared LUNARI substrate project (`fpposmirumtbocqtxued`).
  gen connect lives on it alongside the other lunari products. (dom)
- stripe ... billing. one account, two recurring prices. (dom)
- resend ... sending + inbound mail. the sending domain lives here. (dom)
- anthropic ... console.anthropic.com api key. gen + the drafting engine do
  not run without it. (dom)

optional on day one: upstash (rate limiting), apify / apollo / hunter /
millionverifier / neverbounce / perplexity (lead providers), deepseek,
github token. every provider is skipped silently when its key is absent.

## env setup

`.env.example` documents every var the code reads, grouped by concern, with
where each key comes from and whether dev, prod, or optional needs it. copy
it to `.env.local` and fill in what you have.

safe defaults to know:

- `GEN_SEND_MODE` defaults to `test` ... every send redirects to
  `GEN_TEST_RECIPIENT` until you deliberately flip it to `live`.
- billing is switched off without stripe keys ... checkout returns a clean
  "not switched on yet", the webhook no-ops in dev and 503s in prod.
- `CRON_SECRET` unset = the cron route stays dark (404s).

generate the three signing secrets fresh:

```bash
openssl rand -hex 32   # CRON_SECRET, GEN_THREAD_SECRET, GEN_UNSUB_SECRET
```

## database

migrations live in `src/lib/db/migrations/` ... 19 files, gc-prefixed,
semver-named, forward-only, idempotent. they are applied manually through
the supabase MCP `apply_migration` tool against project
`fpposmirumtbocqtxued` (name = filename without extension, query = file
contents), in order, starting at `v0_1_0`. after applying, run the supabase
`get_advisors` check ... it flags any table that landed without RLS.

demo data: sign in once at `/login` via magic link (this mints the
`auth.users` row and the callback upserts `user_profiles`), then run
`src/lib/db/seed.sql` through the supabase `execute_sql` tool. it fills the
pipeline with ~30 companies and 1000 contacts. re-running is safe.

supabase auth config (dom): in the supabase dashboard, add
`https://<your-domain>/callback` to the allowed redirect urls. the magic
link action builds the redirect from `NEXT_PUBLIC_SITE_URL` +
`/callback` (see `src/app/actions/auth.ts`).

## deploy on vercel

1. link the repo to a new vercel project. next 16, zero build config
   needed. (dom)
2. set every env var from `.env.example` in the vercel project settings.
   the supabase keys, anthropic key, resend key, and the three signing
   secrets are the prod-required minimum. (dom)
3. set `NEXT_PUBLIC_SITE_URL` to the production origin, e.g.
   `https://gen.lunari.pro`. it drives the magic-link redirect, stripe
   checkout urls, and unsubscribe links. (dom)
4. deploy. `/api/health` is the smoke check.

## stripe billing

billing is safe by default ... nothing charges anyone until these steps land.

1. create two recurring prices in stripe: creator ~$79/mo (80 fuel), pro
   ~$149/mo (200 fuel). drop the price ids into `STRIPE_PRICE_CREATOR` and
   `STRIPE_PRICE_PRO`. (dom)
2. set `STRIPE_SECRET_KEY`. (dom)
3. register the webhook: dashboard > developers > webhooks > add endpoint,
   url `https://<your-domain>/api/webhooks/stripe` (the handler is
   `src/app/api/webhooks/stripe/route.ts`). subscribe to the checkout +
   subscription events. copy the signing secret into
   `STRIPE_WEBHOOK_SECRET`. (dom)
4. verify the wiring locally before trusting it: `pnpm verify:billing`
   (script at `scripts/verify-billing.mjs`). it signs fake stripe events
   with a test secret and posts them at the dev server, then checks the
   entitlement flips in supabase. needs `NEXT_PUBLIC_SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, and the dev server running
   with the matching test webhook secret + price ids.

## resend domain + send mode

1. verify the sending domain in resend: add the domain, then publish the
   SPF, DKIM, and DMARC records resend shows you at your dns provider.
   wait for the green check. (dom)
2. set `GEN_SEND_FROM` to an address on that verified domain.
3. register the resend webhook for inbound replies + deliverability events
   at `https://<your-domain>/api/webhooks/resend`, and copy the svix
   signing secret into `RESEND_WEBHOOK_SECRET`. in dev the webhook skips
   signature checks when the secret is unset; in prod it refuses. (dom)
4. the flip: sends run in test mode until `GEN_SEND_MODE=live`. test mode
   redirects every send to `GEN_TEST_RECIPIENT` with the subject tagged
   `[test->real-lead]` ... a real lead is never emailed by accident. flip
   to `live` only when the domain is verified and you mean it. (dom)

## cron wiring

one cron route exists: `POST /api/cron/sequences` (GET accepted too, so
vercel cron works without a shim). it is the autonomous sequence executor
... it pages every user with active enrollments and advances due sends.

`vercel.json` schedules it every 15 minutes:

```json
{
  "crons": [{ "path": "/api/cron/sequences", "schedule": "*/15 * * * *" }]
}
```

the route is double-gated (see `src/app/api/cron/sequences/route.ts`): it
404s unless `CRON_SECRET` is set AND the caller presents it, compared in
constant time. the code expects exactly one of:

- an `Authorization: Bearer <CRON_SECRET>` header
- an `x-cron-secret: <CRON_SECRET>` header

vercel cron sends `Authorization: Bearer $CRON_SECRET` automatically when
the `CRON_SECRET` env var exists on the project ... so once the secret is
set in vercel env, the wiring is done. no secret = the cron stays dark.

note: signals ingestion (X + reddit) has no cron route. it runs from a
user-triggered server action (`src/app/actions/signals.ts`), so there is
nothing to schedule for it.

## going-live checklist

- [ ] supabase migrations applied, `get_advisors` clean (dom)
- [ ] `/callback` redirect url allowed in supabase auth (dom)
- [ ] all prod env vars set in vercel from `.env.example` (dom)
- [ ] `NEXT_PUBLIC_SITE_URL` = the production origin (dom)
- [ ] `pnpm verify:billing` green against the wired webhook
- [ ] stripe webhook registered + signing secret set (dom)
- [ ] resend domain verified ... SPF + DKIM + DMARC live (dom)
- [ ] resend webhook registered + `RESEND_WEBHOOK_SECRET` set (dom)
- [ ] `CRON_SECRET` set ... vercel cron picks it up automatically (dom)
- [ ] `GEN_THREAD_SECRET` + `GEN_UNSUB_SECRET` set (tokens fail closed in
      prod without them) (dom)

then the two explicit flips, in this order:

1. stripe keys + price ids set ... billing switches on (dom)
2. `GEN_SEND_MODE=live` ... real leads start getting mail (dom)

until flip 2, everything the app "sends" lands in the test inbox. that is
the feature, not a bug.
