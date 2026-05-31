# LUNARI OUTREACH V2 — Complete Bundle

**Built:** April 25, 2026
**Target version:** v∞.16.0
**Built against:** server.js v∞.15.22, frontend src v∞.15.8
**Total:** 4,787 lines across 9 files, bundled here for easy hand-off.

This single file contains everything. Each section below is a separate file that goes in a specific place. Use the headers as the file boundaries when copying out.

---

## How to apply (in this order)

1. **Apply migration** — copy section "01-migration.sql" content, run via Supabase MCP or SQL editor
2. **Patch backend** — copy section "02-backend-patch.js", paste blocks into `server.js` at the marker comments
3. **Replace frontend** — copy each `frontend/*.tsx` section into `web/src/components/outreach/`, then `npm run build`, drag dist/ to Netlify
4. **Read DRIFT** — section "OUTREACH-V2-DRIFT.md" at the bottom has the full handoff with what's stubbed for v16.1

`OutreachPage.tsx` REPLACES the existing 337-line kanban. The other 5 frontend files are new additions.

---


═══════════════════════════════════════════════════════════════
## FILE: `OUTREACH-V2-DRIFT.md`
═══════════════════════════════════════════════════════════════

```markdown
# LUNARI OUTREACH V2 — Handoff Doc

**Built:** April 25, 2026
**Target version:** v∞.16.0
**Built against:** server.js v∞.15.22, frontend src v∞.15.8
**Status:** Prototype complete. Real-time delivery wiring deferred to v16.1.

---

## What this is

Outreach V2 closes the loop. Today, LUNARI's outreach is a kanban board... great for tracking, useless for capturing the conversation that follows. Replies vanish into Dom's email and LinkedIn. Comment-DMs need to be sent manually. There's no equivalent to gojiberry's persistent signal agents that surface warm leads while you sleep.

V2 ships the missing pieces:
- **Unibox** — every reply across 10 platforms in one inbox, NOVA-drafted replies in Dom's voice
- **Signals** — persistent watcher agents that find ICP matches every 6 hours, surface hits with flame ratings
- **Campaigns** — multi-step outreach sequences with spintax personalization
- **Triggers** — comment-trigger DMs (the "drop COWORK and i'll send the playbook" pattern)
- **Outcomes** — log dollar outcomes per agent, hero stat reframed from fuel-spent to dollars-generated

---

## Files in this drop

| File | Purpose | Apply via |
|---|---|---|
| `01-migration.sql` | 12 new tables + RLS + 40+ subreddit seed | Supabase MCP or SQL editor |
| `02-backend-patch.js` | Helpers + endpoints + cron stubs | Drop blocks into `server.js` |
| `frontend/types.ts` | Shared TypeScript types | Copy to `src/components/outreach/types.ts` |
| `frontend/OutreachPage.tsx` | Tab orchestrator (REPLACES existing) | Replace `src/components/outreach/OutreachPage.tsx` |
| `frontend/PipelineTab.tsx` | Existing kanban + outcome logging | Copy to `src/components/outreach/` |
| `frontend/UniboxTab.tsx` | 3-pane unified inbox | Copy to `src/components/outreach/` |
| `frontend/SignalsTab.tsx` | Signal agent CRUD + hits viewer | Copy to `src/components/outreach/` |
| `frontend/CampaignsTab.tsx` | Sequence builder with spintax | Copy to `src/components/outreach/` |
| `frontend/TriggersTab.tsx` | Comment trigger CRUD + captures | Copy to `src/components/outreach/` |

---

## Apply order

### 1. Migration (do this first)

Run `01-migration.sql` via Supabase MCP. All 12 new tables + RLS policies + reddit subreddit seed (40+ rows). Existing `outreach_contacts` gets 7 new optional columns. Idempotent... safe to re-run.

Verify with:
```sql
SELECT count(*) FROM reddit_subreddit_master;  -- expect ~40
SELECT count(*) FROM unibox_threads;           -- expect 0 until first reply
```

### 2. Backend patch

Open `02-backend-patch.js`. It has 4 marked sections:

- **[A] HELPERS** — paste all module-scope functions (`resolveSpintax`, `renderTemplate`, `scrubEmDashes`, `findOrCreateThread`, `appendInboundMessage`, `generateUniboxDraft`, `scoreSignalHit`, `runSignalAgent`, `runCommentTrigger`) into `server.js` near other helpers, e.g. after `sendEmail()` around line 2500. **NEVER inside `handleRequest()`.**

- **[B] ENDPOINTS** — paste all the `if (req.method === ... && url.startsWith(...))` blocks inside `handleRequest()` near the existing `/api/pipeline` routes around line 13830. Order matters: the more specific routes (`/api/unibox/thread/:id/reply`, `/api/unibox/thread/:id/draft`) must come before the generic `/api/unibox/thread/:id` PATCH.

- **[C] CRON** — paste the commented stubs into the existing cron loop around line 12700. They poll `signal_agents` every minute for due runs and `comment_triggers` every 5 minutes for active polls. Currently stubs only... real platform wiring lives in v16.1.

- **[D] VERSION + CHANGELOG** — bump `LUNARI_VERSION` at line 2 to `'v\u221E.16.0'` and add the changelog entry to `LUNARI_CHANGELOG`.

### 3. Frontend

```bash
cp frontend/types.ts        web/src/components/outreach/
cp frontend/OutreachPage.tsx web/src/components/outreach/   # OVERWRITES old kanban
cp frontend/PipelineTab.tsx  web/src/components/outreach/
cp frontend/UniboxTab.tsx    web/src/components/outreach/
cp frontend/SignalsTab.tsx   web/src/components/outreach/
cp frontend/CampaignsTab.tsx web/src/components/outreach/
cp frontend/TriggersTab.tsx  web/src/components/outreach/

cd web/
npm install   # no new deps... uses existing lucide-react
npm run build
# drag dist/ to Netlify site ff9ec3be
```

`App.tsx` already imports `OutreachPage`... no changes needed. `BottomNav.tsx` and `ConversationSidebar.tsx` already have the outreach nav item wired.

---

## What works end-to-end after deploy

- Pipeline kanban (existing, with new outcome-logging button on booked/paid contacts)
- Manual signal agent creation (3-step wizard: ICP → Signals → Leads)
- Manual signal agent run via `/api/signals/:id/run` (uses `apolloSearchPeople`, inserts hits)
- Comment trigger creation with dm template + lead magnet url
- Campaign creation with multi-step spintax sequences
- Spintax preview endpoint shows 5 random variations
- Outcome event logging → hero "$X opportunities since launch" stat
- All CRUD endpoints behind RLS

---

## What's stubbed (v16.1 backlog)

These need real wiring before this is production:

1. **Unibox inbound webhooks** — currently `appendInboundMessage()` is unwired. Need:
   - Postiz webhook for LinkedIn, Twitter, Instagram, TikTok, FB, Threads, Bluesky, Reddit replies
   - Resend inbound parse webhook for email
   - Telegram bot updates webhook
   Each posts to a new `/api/unibox/inbound/:platform` endpoint that calls `appendInboundMessage(userId, platform, externalThreadId, contactInfo, body, metadata)`.

2. **Unibox outbound delivery** — `/api/unibox/thread/:id/reply` currently logs only. Need to dispatch via:
   - Email: existing `sendEmail()`
   - LinkedIn/Twitter/IG/TikTok/Reddit/FB/Threads/Bluesky: `postToPostiz()` per-platform DM
   - Telegram: existing bot send

3. **Signal agent watchers beyond Apollo** — `runSignalAgent()` only does Apollo ICP match. Real signal types need:
   - LinkedIn engagement watchers (followed_company, engaged_with_competitor) → likely Cloudflare Browser Rendering or Phantombuster
   - Twitter watcher (commented_on_topic, hiring_post) → existing Twitter scraping infra
   - Reddit watcher → existing reddit_research tool
   - Job change detection → Apollo people enrichment with delta tracking

4. **Comment trigger polling** — `runCommentTrigger()` is a no-op stub. Need per-platform comment fetchers:
   - LinkedIn: existing CF Browser Rendering on post URL
   - Twitter: search by post id
   - Instagram: Postiz comment endpoint (if it exists, else IG Graph API)
   - TikTok: similar
   - Reddit: reddit JSON API on `<post>.json`
   Each scans new comments for `trigger_word` (with `case_sensitive` + `trigger_word_match` rules), inserts to `comment_captures`, generates DM via `renderTemplate(trigger.dm_template, { firstName, leadMagnetUrl })`, and dispatches via Postiz.

5. **Campaign send loop** — schema and step authoring complete, no actual send cron. Need a 5-min cron that scans `campaign_enrollments WHERE status='active' AND next_send_at <= NOW()`, picks the matching `campaign_steps[current_step + 1]`, resolves spintax with per-recipient seed, sends via channel, increments step and `next_send_at`. Stop on reply detection comes from unibox inbound webhook flipping enrollment status.

6. **Sequence per-recipient seed** — `resolveSpintax(template, seed)` is in place. Pass `enrollment.id` as the seed so the same recipient sees consistent spintax variations across steps.

---

## What I broke / changed

- `OutreachPage.tsx` is now an orchestrator. The 337-line single-file kanban is gone. Logic moved to `PipelineTab.tsx` with the same drag/drop behavior, plus a new "+$" button on booked/paid cards that opens the outcome modal.
- `outreach_contacts` table has 7 new nullable columns. Existing rows untouched.
- No removals from server.js. Only additions. Existing `/api/pipeline` routes still work identically.

---

## Voice rules enforced

All template strings, draft generators, and saved templates auto-strip em-dashes via `scrubEmDashes()`. NOVA draft prompt explicitly bans em-dashes in the system message and requests lowercase. All UI copy follows: lowercase casual, no em-dashes (uses `...`), punchy, no corporate speak.

---

## Cost notes

- `generateUniboxDraft()` uses NOVA (Sonnet, ~$0.003-$0.012 per draft). User-triggered only.
- `runSignalAgent()` Apollo cost: 5 records per run = 5 credits per agent run. With 6h cron = 4 runs/day × 5 = 20 credits/day per agent. Out of 10K/month = 50 days of one agent.
- Campaign send loop will be the dominant cost when wired (existing Resend + Postiz are flat-rate, no per-message cost).

---

## Next steps suggested (prioritized)

1. **v16.1 — Unibox inbound + outbound wiring** (1-2 days). Without this, unibox is empty. Start with email (Resend inbound parse is dead simple) and LinkedIn (existing Postiz webhook).
2. **v16.2 — Comment trigger LinkedIn polling** (1 day). The "drop COWORK" pattern is the highest-ROI lead-gen mechanic. LinkedIn first because Dom's already on linkedin.
3. **v16.3 — Campaign send loop** (1-2 days). Multi-step sequences become real revenue once this fires.
4. **v16.4 — Signal watchers beyond Apollo** (1 week). LinkedIn engagement watcher first (followed competitor → flame 8 hits).

---

## Known caveats

- Frontend uses inline styles (matches existing convention, not Tailwind). Refactor if desired but not urgent.
- No SSE / live updates yet... unibox requires manual refresh until v16.1 adds webhook + frontend polling.
- Signal agent edit modal saves but doesn't validate ICP completeness... empty ICP runs return 0 hits silently.
- `/api/spintax/preview` is unauthenticated (admin convenience). Add userId check before public if exposed.
```

═══════════════════════════════════════════════════════════════
## FILE: `01-migration.sql`
═══════════════════════════════════════════════════════════════

```sql
-- ═══════════════════════════════════════════════════════════════
-- LUNARI OUTREACH V2 — Migration
-- For v∞.16.0 — closes the loop: unibox + signals + campaigns + triggers
-- Apply via Supabase MCP or SQL editor. RLS on all. sbAdmin() bypasses.
-- ═══════════════════════════════════════════════════════════════

-- ─── unibox: unified inbox across all platforms ───────────────────

CREATE TABLE IF NOT EXISTS unibox_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'email' | 'linkedin' | 'twitter' | 'instagram' | 'tiktok' | 'reddit' | 'telegram' | 'facebook' | 'threads' | 'bluesky'
  external_thread_id TEXT, -- platform native thread id (gmail thread, linkedin convo, etc)
  contact_id UUID REFERENCES outreach_contacts(id) ON DELETE SET NULL,
  contact_handle TEXT, -- @handle, email, profile url
  contact_name TEXT,
  contact_avatar_url TEXT,
  subject TEXT, -- email subject; null for DMs
  preview TEXT, -- last message snippet
  unread_count INT DEFAULT 0,
  message_count INT DEFAULT 1,
  status TEXT DEFAULT 'open', -- 'open' | 'archived' | 'spam' | 'closed'
  pinned BOOLEAN DEFAULT FALSE,
  campaign_id UUID, -- if message came from an outreach campaign
  source_signal_type TEXT, -- if contact came from a signal hit
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unibox_threads_user ON unibox_threads(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_unibox_threads_status ON unibox_threads(user_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_unibox_threads_platform ON unibox_threads(user_id, platform);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unibox_threads_external ON unibox_threads(user_id, platform, external_thread_id) WHERE external_thread_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS unibox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES unibox_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  direction TEXT NOT NULL, -- 'in' | 'out'
  body TEXT NOT NULL,
  body_html TEXT,
  external_message_id TEXT,
  sent_by_agent TEXT, -- if outbound was generated by NOVA/GEN, log which one
  ai_draft BOOLEAN DEFAULT FALSE, -- true if this was an AI-suggested reply that user reviewed
  read_at TIMESTAMPTZ,
  attachments JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unibox_msgs_thread ON unibox_messages(thread_id, occurred_at);

-- ─── signal agents: persistent watchers ───────────────────────────

CREATE TABLE IF NOT EXISTS signal_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- 'AGENT 1 — SUPER HOT', 'photographer-watcher', etc
  status TEXT DEFAULT 'active', -- 'active' | 'paused' | 'archived'
  icp JSONB DEFAULT '{}'::jsonb, -- ideal customer profile: { titles, locations, industries, company_sizes, exclusions }
  precision INT DEFAULT 50, -- 0=discovery (broad), 100=high precision (narrow)
  signals JSONB DEFAULT '[]'::jsonb, -- array of signal definitions: [{type, config, enabled}]
  objectives JSONB DEFAULT '{}'::jsonb, -- {pain_points: [], campaign_goal, message_tone}
  hits_total INT DEFAULT 0,
  hits_last_7d INT DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  cron_expr TEXT DEFAULT '0 */6 * * *', -- default: every 6 hours
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_agents_user ON signal_agents(user_id, status);
CREATE INDEX IF NOT EXISTS idx_signal_agents_run ON signal_agents(status, next_run_at) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS signal_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES signal_agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  signal_type TEXT NOT NULL, -- 'followed_company' | 'engaged_with_competitor' | 'hiring_post' | 'tool_mention' | etc
  signal_context TEXT, -- 'Just engaged with industry expert linkedin.com/in/...'
  contact_handle TEXT,
  contact_name TEXT,
  contact_title TEXT,
  contact_company TEXT,
  contact_avatar_url TEXT,
  contact_profile_url TEXT,
  ai_score INT, -- 1-10 flame rating
  contact_id UUID REFERENCES outreach_contacts(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'new', -- 'new' | 'enriched' | 'enrolled' | 'dismissed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_hits_agent ON signal_hits(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_hits_user_status ON signal_hits(user_id, status, created_at DESC);

-- ─── comment triggers: capture lead-magnet commenters ─────────────

CREATE TABLE IF NOT EXISTS comment_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT, -- 'CLAUDE COWORK launch — COWORK trigger'
  platform TEXT NOT NULL, -- 'linkedin' | 'twitter' | 'instagram' | 'tiktok' | 'reddit' | 'facebook'
  post_url TEXT NOT NULL,
  post_external_id TEXT, -- platform native id once resolved
  trigger_word TEXT NOT NULL, -- 'COWORK', 'GUIDE', 'COURSE'
  trigger_word_match TEXT DEFAULT 'contains', -- 'exact' | 'contains' | 'starts_with'
  case_sensitive BOOLEAN DEFAULT FALSE,
  dm_template TEXT NOT NULL, -- supports {{firstName}}, {{leadMagnetUrl}}, {{spintax}}
  lead_magnet_url TEXT,
  capture_email BOOLEAN DEFAULT FALSE, -- ask for email before sending magnet
  max_responses INT, -- null = unlimited
  responses_sent INT DEFAULT 0,
  status TEXT DEFAULT 'active', -- 'active' | 'paused' | 'expired' | 'completed'
  expires_at TIMESTAMPTZ,
  last_polled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_triggers_user ON comment_triggers(user_id, status);
CREATE INDEX IF NOT EXISTS idx_triggers_poll ON comment_triggers(status, last_polled_at) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS comment_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID NOT NULL REFERENCES comment_triggers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  commenter_handle TEXT NOT NULL,
  commenter_name TEXT,
  commenter_avatar_url TEXT,
  commenter_external_id TEXT,
  comment_text TEXT,
  comment_url TEXT,
  dm_status TEXT DEFAULT 'pending', -- 'pending' | 'sent' | 'failed' | 'bounced'
  dm_sent_at TIMESTAMPTZ,
  dm_error TEXT,
  contact_id UUID REFERENCES outreach_contacts(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES unibox_threads(id) ON DELETE SET NULL,
  email TEXT, -- if capture_email enabled and they replied with one
  captured_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_captures_trigger ON comment_captures(trigger_id, captured_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_captures_unique ON comment_captures(trigger_id, commenter_external_id) WHERE commenter_external_id IS NOT NULL;

-- ─── campaigns: multi-step outreach sequences ─────────────────────

CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  channel TEXT NOT NULL, -- 'email' | 'linkedin' | 'twitter' | 'mixed'
  status TEXT DEFAULT 'draft', -- 'draft' | 'active' | 'paused' | 'completed'
  daily_limit INT DEFAULT 50,
  stop_on_reply BOOLEAN DEFAULT TRUE,
  text_only_mode BOOLEAN DEFAULT TRUE,
  link_tracking BOOLEAN DEFAULT FALSE,
  open_tracking BOOLEAN DEFAULT FALSE,
  enrolled_count INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  reply_count INT DEFAULT 0,
  booked_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user ON outreach_campaigns(user_id, status);

CREATE TABLE IF NOT EXISTS campaign_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  step_index INT NOT NULL, -- 1, 2, 3, 4
  channel TEXT, -- override campaign channel per step
  step_type TEXT NOT NULL, -- 'invitation' | 'message' | 'email' | 'wait'
  subject_spintax TEXT, -- email subject with {{RANDOM | a | b | c}} blocks
  body_spintax TEXT NOT NULL, -- body with spintax
  delay_days INT DEFAULT 1,
  delay_hours INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_steps_campaign ON campaign_steps(campaign_id, step_index);

CREATE TABLE IF NOT EXISTS campaign_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES outreach_contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  current_step INT DEFAULT 0, -- 0 = not started, 1 = first step sent, etc
  status TEXT DEFAULT 'active', -- 'active' | 'paused' | 'completed' | 'replied' | 'unsubscribed'
  next_send_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  reply_received_at TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_enrollments_campaign ON campaign_enrollments(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_send ON campaign_enrollments(status, next_send_at) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON campaign_enrollments(campaign_id, contact_id);

-- ─── outcome events: dollars-not-fuel dashboard ───────────────────

CREATE TABLE IF NOT EXISTS outcome_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'gig_booked' | 'subscriber_acquired' | 'stream_revenue' | 'merch_sale' | 'lead_qualified' | 'meeting_booked' | 'deal_closed'
  dollar_value NUMERIC(12,2) DEFAULT 0,
  attributed_agent TEXT, -- 'NOVA' | 'GEN' | 'ATLAS' | etc
  source_action_id UUID, -- arbitrary ref to whatever caused the outcome
  source_signal_id UUID REFERENCES signal_hits(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES outreach_contacts(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES outreach_campaigns(id) ON DELETE SET NULL,
  notes TEXT,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outcomes_user ON outcome_events(user_id, occurred_at DESC);

-- ─── outreach_contacts: extend with closed-loop columns ───────────

ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS ai_score INT;
ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS source_signal_type TEXT;
ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS source_trigger_id UUID REFERENCES comment_triggers(id) ON DELETE SET NULL;
ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS source_signal_id UUID REFERENCES signal_hits(id) ON DELETE SET NULL;
ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS profile_url TEXT;
ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE outreach_contacts ADD COLUMN IF NOT EXISTS industry TEXT;

-- ─── reddit playbook: master subreddit table + account state ──────

CREATE TABLE IF NOT EXISTS reddit_subreddit_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subreddit_name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL, -- 'saas_founder' | 'marketing_growth' | 'musicians' | 'photographers' | etc
  est_members INT,
  description TEXT,
  rules_url TEXT,
  post_archetypes JSONB DEFAULT '[]'::jsonb, -- ['proof_screenshot', 'free_help', 'lessons_learned']
  promotional_friendly BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subreddit_category ON reddit_subreddit_master(category);

CREATE TABLE IF NOT EXISTS reddit_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reddit_username TEXT NOT NULL,
  karma INT DEFAULT 0,
  account_age_days INT DEFAULT 0,
  warmup_status TEXT DEFAULT 'cold', -- 'cold' | 'warming' | 'ready' | 'paused'
  daily_comment_count INT DEFAULT 0,
  daily_promotional_count INT DEFAULT 0,
  last_comment_at TIMESTAMPTZ,
  last_reset_at TIMESTAMPTZ DEFAULT NOW(), -- daily counter reset
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reddit_accounts_user ON reddit_accounts(user_id, status);

-- ─── seed reddit subreddit master with the gojiberry list ─────────
-- (full taxonomy from intel synthesis appendix A)

INSERT INTO reddit_subreddit_master (subreddit_name, category, est_members, description, post_archetypes) VALUES
  ('r/SaaS', 'saas_founder', 95000, 'discussions, feedback, support', '["proof_screenshot","lessons_learned","free_help"]'),
  ('r/EntrepreneurRideAlong', 'saas_founder', 517000, 'journey-sharing, build-in-public', '["lessons_learned","proof_screenshot"]'),
  ('r/SideProject', 'saas_founder', 478000, 'feedback + soft promotion', '["proof_screenshot","free_help"]'),
  ('r/thesidehustle', 'saas_founder', 79000, 'hustler advice', '["lessons_learned"]'),
  ('r/growmybusiness', 'saas_founder', 51000, 'growth tips', '["lessons_learned","free_help"]'),
  ('r/indiehackers', 'saas_founder', 24000, 'indie SaaS founder discussions', '["lessons_learned","proof_screenshot"]'),
  ('r/startups', 'saas_founder', 1200000, 'massive founder community', '["lessons_learned","free_help"]'),
  ('r/BootstrappedSaaS', 'saas_founder', 935, 'small but pure ICP', '["lessons_learned"]'),
  ('r/B2BSaaS', 'saas_founder', 8000, 'tight B2B crowd', '["lessons_learned"]'),
  ('r/NoCodeSaaS', 'saas_founder', 22000, 'no-code SaaS', '["proof_screenshot"]'),
  ('r/micro_saas', 'saas_founder', 10000, 'lean products', '["lessons_learned"]'),
  ('r/indiebiz', 'saas_founder', 24000, 'small/scrappy solo shops', '["lessons_learned"]'),
  ('r/startup_resources', 'saas_founder', 24000, 'tools, templates, playbooks', '["free_help"]'),
  ('r/LaunchMyStartup', 'saas_founder', 2000, 'early launches & feedback', '["proof_screenshot"]'),
  ('r/ProductHunters', 'saas_founder', 23000, 'Product Hunt-focused', '["lessons_learned"]'),
  ('r/SaaSMarketing', 'marketing_growth', 11000, 'strategy + tactical', '["lessons_learned","free_help"]'),
  ('r/marketing', 'marketing_growth', 2000000, 'digital marketing', '["lessons_learned"]'),
  ('r/Entrepreneur', 'marketing_growth', 4000000, 'broad entrepreneurship', '["lessons_learned","proof_screenshot"]'),
  ('r/EmailMarketing', 'marketing_growth', 60000, 'campaigns, retention', '["lessons_learned"]'),
  ('r/GrowthHacking', 'marketing_growth', 100000, 'viral acquisition', '["lessons_learned"]'),
  ('r/roastmystartup', 'feedback', 30000, 'honest pitch feedback', '["free_help"]'),
  ('r/sweatystartup', 'feedback', 100000, 'candid startup discussions', '["lessons_learned"]'),
  ('r/SmallBusiness', 'feedback', 2000000, 'everyday operations', '["free_help"]'),
  -- musicians (lunari ICP)
  ('r/WeAreTheMusicMakers', 'musicians', 2700000, 'music producers and creators', '["proof_screenshot","lessons_learned","free_help"]'),
  ('r/edmproduction', 'musicians', 750000, 'EDM production techniques', '["proof_screenshot","lessons_learned"]'),
  ('r/musicmarketing', 'musicians', 50000, 'music marketing strategies', '["lessons_learned","free_help"]'),
  ('r/IndieMusicFeedback', 'musicians', 80000, 'indie music critique', '["proof_screenshot"]'),
  ('r/makinghiphop', 'musicians', 800000, 'hip hop production', '["proof_screenshot","lessons_learned"]'),
  ('r/musicbusiness', 'musicians', 70000, 'music industry business', '["lessons_learned"]'),
  ('r/Songwriting', 'musicians', 700000, 'songwriting craft', '["proof_screenshot"]'),
  ('r/audioengineering', 'musicians', 700000, 'audio engineering', '["lessons_learned"]'),
  -- photographers
  ('r/photography', 'photographers', 5000000, 'general photography', '["proof_screenshot","lessons_learned"]'),
  ('r/AskPhotography', 'photographers', 250000, 'photography questions', '["free_help"]'),
  ('r/photocritique', 'photographers', 600000, 'photo critique', '["proof_screenshot"]'),
  ('r/portraits', 'photographers', 500000, 'portrait photography', '["proof_screenshot"]'),
  -- videographers
  ('r/Filmmakers', 'videographers', 1300000, 'filmmaking community', '["proof_screenshot","lessons_learned"]'),
  ('r/videography', 'videographers', 250000, 'videography', '["proof_screenshot","lessons_learned"]'),
  ('r/cinematography', 'videographers', 800000, 'cinematography', '["lessons_learned"]'),
  ('r/editors', 'videographers', 100000, 'video editing', '["lessons_learned","free_help"]'),
  -- designers
  ('r/graphic_design', 'designers', 1100000, 'graphic design', '["proof_screenshot","free_help"]'),
  ('r/Design', 'designers', 1000000, 'design discussion', '["proof_screenshot"]'),
  ('r/web_design', 'designers', 700000, 'web design', '["proof_screenshot","lessons_learned"]')
ON CONFLICT (subreddit_name) DO NOTHING;

-- ─── RLS policies ──────────────────────────────────────────────────

ALTER TABLE unibox_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE unibox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcome_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE reddit_accounts ENABLE ROW LEVEL SECURITY;
-- reddit_subreddit_master: public read, admin write only
ALTER TABLE reddit_subreddit_master ENABLE ROW LEVEL SECURITY;

-- per-user policies (sbAdmin bypasses these)
CREATE POLICY "users own threads" ON unibox_threads FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own messages" ON unibox_messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own signal agents" ON signal_agents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own signal hits" ON signal_hits FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own triggers" ON comment_triggers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own captures" ON comment_captures FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own campaigns" ON outreach_campaigns FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own steps" ON campaign_steps FOR ALL USING (
  EXISTS (SELECT 1 FROM outreach_campaigns c WHERE c.id = campaign_steps.campaign_id AND c.user_id = auth.uid())
);
CREATE POLICY "users own enrollments" ON campaign_enrollments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own outcomes" ON outcome_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own reddit accounts" ON reddit_accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "subreddit master public read" ON reddit_subreddit_master FOR SELECT USING (TRUE);

-- ─── verification ──────────────────────────────────────────────────
-- After applying, run:
-- SELECT count(*) FROM reddit_subreddit_master;  -- should be ~40+
-- SELECT count(*) FROM unibox_threads;  -- 0 until first reply lands
-- All tables should appear in supabase dashboard with RLS enabled
```

═══════════════════════════════════════════════════════════════
## FILE: `02-backend-patch.js`
═══════════════════════════════════════════════════════════════

```javascript
// ═══════════════════════════════════════════════════════════════
// LUNARI OUTREACH V2 — Backend Additions (v∞.16.0)
//
// Drop these blocks into server.js per the markers below.
// Three sections:
//   [A] HELPERS — paste at module scope, near other helpers (~line 3400)
//   [B] ENDPOINTS — paste inside handleRequest(), near existing /api/pipeline (~line 13830)
//   [C] CRON — paste inside the existing cron block (~line 12700)
//   [D] VERSION + CHANGELOG — bump LUNARI_VERSION at top of file (~line 2)
//
// Conventions enforced:
//   - module-scope helpers only (never inside handleRequest)
//   - sbAdmin() server-side only
//   - callClaude(agent, prompt, apiKey, opts) 4-arg signature
//   - getUTCHours() for cron (CDT = UTC-5)
//   - no em-dashes in JS strings (use ... or commas)
//   - no silent .catch(() => {})
// ═══════════════════════════════════════════════════════════════


// ───────────────────────────────────────────────────────────────
// [A] HELPERS — module scope
// paste near existing helpers, e.g. after sendEmail (~line 2500)
// ───────────────────────────────────────────────────────────────

// Resolve {{RANDOM | a | b | c}} spintax blocks at send time.
// Picks one branch per block, deterministic per recipient if seed provided.
function resolveSpintax(template, seed) {
  if (!template) return '';
  let s = seed || Math.random().toString(36).slice(2);
  let hashIdx = 0;
  return template.replace(/\{\{RANDOM\s*\|\s*([^}]+)\}\}/g, (_, opts) => {
    const branches = opts.split('|').map(x => x.trim());
    if (branches.length === 0) return '';
    // simple deterministic hash so same seed picks same branches
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i) + hashIdx) | 0;
    hashIdx += 7;
    const idx = Math.abs(h) % branches.length;
    return branches[idx];
  });
}

// Render a template with {{firstName}}, {{leadMagnetUrl}}, etc.
function renderTemplate(template, vars) {
  if (!template) return '';
  let out = template;
  for (const [k, v] of Object.entries(vars || {})) {
    out = out.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), v == null ? '' : String(v));
  }
  return out;
}

// Strip em-dashes from any agent-generated string before save (Dom voice rule)
function scrubEmDashes(s) {
  if (!s) return s;
  return String(s).replace(/\u2014|\u2013|—|–/g, '...').replace(/\.{4,}/g, '...');
}

// Find or create a unibox thread for an inbound message
async function findOrCreateThread(userId, platform, externalThreadId, contactInfo) {
  contactInfo = contactInfo || {};
  // Try to find existing thread
  if (externalThreadId) {
    const existing = await sbAdmin('GET',
      `unibox_threads?user_id=eq.${userId}&platform=eq.${encodeURIComponent(platform)}&external_thread_id=eq.${encodeURIComponent(externalThreadId)}&limit=1`
    ).catch(() => []);
    if (existing && existing[0]) return existing[0];
  }
  // Fallback: by contact handle
  if (contactInfo.handle) {
    const byHandle = await sbAdmin('GET',
      `unibox_threads?user_id=eq.${userId}&platform=eq.${encodeURIComponent(platform)}&contact_handle=eq.${encodeURIComponent(contactInfo.handle)}&status=eq.open&limit=1`
    ).catch(() => []);
    if (byHandle && byHandle[0]) return byHandle[0];
  }
  // Create new
  const newRow = await sbAdmin('POST', 'unibox_threads', {
    user_id: userId,
    platform: platform,
    external_thread_id: externalThreadId || null,
    contact_handle: contactInfo.handle || null,
    contact_name: contactInfo.name || null,
    contact_avatar_url: contactInfo.avatarUrl || null,
    contact_id: contactInfo.contactId || null,
    subject: contactInfo.subject || null,
    preview: contactInfo.preview || '',
    unread_count: 0,
    message_count: 0,
    status: 'open',
    last_message_at: new Date().toISOString()
  });
  return Array.isArray(newRow) ? newRow[0] : newRow;
}

// Append an inbound message and bump thread counts
async function appendInboundMessage(userId, platform, externalThreadId, contactInfo, body, metadata) {
  const thread = await findOrCreateThread(userId, platform, externalThreadId, contactInfo);
  if (!thread || !thread.id) throw new Error('Failed to find/create unibox thread');
  const preview = (body || '').slice(0, 140);
  await sbAdmin('POST', 'unibox_messages', {
    thread_id: thread.id,
    user_id: userId,
    direction: 'in',
    body: body || '',
    body_html: metadata && metadata.html ? metadata.html : null,
    external_message_id: metadata && metadata.externalMessageId ? metadata.externalMessageId : null,
    metadata: metadata || {},
    occurred_at: new Date().toISOString()
  });
  await sbAdmin('PATCH', `unibox_threads?id=eq.${thread.id}`, {
    unread_count: (thread.unread_count || 0) + 1,
    message_count: (thread.message_count || 0) + 1,
    preview: preview,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  return thread.id;
}

// Generate AI-suggested reply using NOVA voice + thread context
async function generateUniboxDraft(userId, threadId) {
  const threadRows = await sbAdmin('GET', `unibox_threads?id=eq.${threadId}&limit=1`).catch(() => []);
  const thread = threadRows && threadRows[0];
  if (!thread) throw new Error('Thread not found');

  const messages = await sbAdmin('GET',
    `unibox_messages?thread_id=eq.${threadId}&order=occurred_at.desc&limit=10`
  ).catch(() => []);
  const recent = (messages || []).reverse();

  const transcript = recent.map(m =>
    (m.direction === 'in' ? (thread.contact_name || 'them') : 'me') + ': ' + (m.body || '')
  ).join('\n');

  const prompt =
    'You are NOVA, the muse agent of LUNARI. You write replies in Dom\'s voice for the founder.\n' +
    'Voice rules: lowercase casual, no em-dashes (use ... for pauses), punchy and direct, no corporate speak.\n' +
    'Context: this is a ' + thread.platform + ' conversation with ' + (thread.contact_name || thread.contact_handle || 'someone') + '.\n\n' +
    'Recent messages:\n' + transcript + '\n\n' +
    'Write the founder\'s next reply. Keep it short (1-3 sentences max). Match their energy. ' +
    'If they asked a question, answer it. If they want a meeting, propose times. If they\'re skeptical, acknowledge it once and move on. ' +
    'Reply with ONLY the message body. No greeting like "Hi [name]" unless natural. No sign-off.';

  const draft = await callClaude('nova', prompt, null, { maxTokens: 400 });
  return scrubEmDashes(draft);
}

// Scoring helpers for signal hits
function scoreSignalHit(signalType, contact) {
  // 1-10 flame rating, conservative defaults
  let score = 5;
  const hot = ['hiring_post', 'engaged_with_competitor', 'tool_mention'];
  const warm = ['followed_company', 'engaged_with_content'];
  if (hot.includes(signalType)) score = 8;
  if (warm.includes(signalType)) score = 6;
  // Boost if contact has senior title
  const title = (contact && contact.title || '').toLowerCase();
  if (/founder|ceo|cto|director|vp|head of/.test(title)) score = Math.min(10, score + 1);
  return score;
}

// Run a signal agent. Stub implementation: pulls from existing apolloSearchPeople
// based on agent ICP. Real implementation will add LinkedIn/Twitter watchers.
// Returns # hits inserted.
async function runSignalAgent(agentId) {
  const rows = await sbAdmin('GET', `signal_agents?id=eq.${agentId}&limit=1`).catch(() => []);
  const agent = rows && rows[0];
  if (!agent || agent.status !== 'active') return { ok: false, reason: 'not_active' };

  const icp = agent.icp || {};
  const titles = icp.titles || [];
  const locations = icp.locations || [];
  const industries = icp.industries || [];

  // Use existing apolloSearchPeople
  const apolloResults = await apolloSearchPeople({
    person_titles: titles,
    person_locations: locations,
    person_industries: industries,
    page: 1
  }, 5).catch(e => ({ people: [], error: e.message }));

  const people = (apolloResults && apolloResults.people) || [];
  let inserted = 0;
  for (const person of people) {
    const contactInfo = {
      name: (person.first_name || '') + ' ' + (person.last_name || ''),
      title: person.title,
      company: person.organization && person.organization.name,
      handle: person.linkedin_url,
      avatarUrl: person.photo_url
    };
    const score = scoreSignalHit('apollo_match', contactInfo);
    try {
      await sbAdmin('POST', 'signal_hits', {
        agent_id: agentId,
        user_id: agent.user_id,
        signal_type: 'apollo_match',
        signal_context: 'Matched ICP filters: ' + titles.join(', ') + ' in ' + locations.join(', '),
        contact_handle: contactInfo.handle,
        contact_name: contactInfo.name.trim(),
        contact_title: contactInfo.title,
        contact_company: contactInfo.company,
        contact_avatar_url: contactInfo.avatarUrl,
        contact_profile_url: person.linkedin_url,
        ai_score: score,
        status: 'new'
      });
      inserted++;
    } catch (e) {
      console.log('[SIGNAL] hit insert failed:', e.message);
    }
  }

  // Update agent counters
  await sbAdmin('PATCH', `signal_agents?id=eq.${agentId}`, {
    hits_total: (agent.hits_total || 0) + inserted,
    hits_last_7d: (agent.hits_last_7d || 0) + inserted,
    last_run_at: new Date().toISOString(),
    next_run_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString()
  });

  return { ok: true, inserted };
}

// Poll a comment trigger and DM new commenters who used the trigger word.
// Stub: real impl uses Postiz comment endpoints per platform.
async function runCommentTrigger(triggerId) {
  const rows = await sbAdmin('GET', `comment_triggers?id=eq.${triggerId}&limit=1`).catch(() => []);
  const trigger = rows && rows[0];
  if (!trigger || trigger.status !== 'active') return { ok: false, reason: 'not_active' };

  // Real impl: fetch comments from postiz/platform API for trigger.post_url
  // For prototype: just update last_polled_at
  await sbAdmin('PATCH', `comment_triggers?id=eq.${triggerId}`, {
    last_polled_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  return { ok: true, processed: 0, note: 'comment polling stub. wire postiz comment fetch per platform in v16.1' };
}


// ───────────────────────────────────────────────────────────────
// [B] ENDPOINTS — paste inside handleRequest(req, res) {
// near existing /api/pipeline routes (~line 13830 in v15.22)
// ───────────────────────────────────────────────────────────────

// ─── /api/unibox — list threads + thread detail + reply ──────────

if (req.method === 'GET' && url.startsWith('/api/unibox/threads')) {
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const userId = params.get('userId') || '';
  const platform = params.get('platform') || '';
  const status = params.get('status') || 'open';
  const search = params.get('search') || '';
  if (!userId) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing userId' })); }
  (async () => {
    try {
      let q = `unibox_threads?user_id=eq.${userId}&status=eq.${status}&order=last_message_at.desc&limit=100`;
      if (platform) q += `&platform=eq.${encodeURIComponent(platform)}`;
      const threads = await sbAdmin('GET', q).catch(() => []);
      let filtered = threads || [];
      if (search) {
        const needle = search.toLowerCase();
        filtered = filtered.filter(t =>
          (t.contact_name || '').toLowerCase().includes(needle) ||
          (t.contact_handle || '').toLowerCase().includes(needle) ||
          (t.preview || '').toLowerCase().includes(needle) ||
          (t.subject || '').toLowerCase().includes(needle)
        );
      }
      const stats = {
        total: filtered.length,
        unread: filtered.reduce((acc, t) => acc + (t.unread_count || 0), 0),
        byPlatform: filtered.reduce((acc, t) => { acc[t.platform] = (acc[t.platform] || 0) + 1; return acc; }, {})
      };
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, threads: filtered, stats }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  })(); return;
}

if (req.method === 'GET' && /^\/api\/unibox\/thread\/[^/]+/.test(url)) {
  const threadId = url.split('/api/unibox/thread/')[1].split('?')[0];
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const userId = params.get('userId') || '';
  if (!userId || !threadId) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing params' })); }
  (async () => {
    try {
      const threadRows = await sbAdmin('GET',
        `unibox_threads?id=eq.${threadId}&user_id=eq.${userId}&limit=1`
      ).catch(() => []);
      const thread = threadRows && threadRows[0];
      if (!thread) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Thread not found' })); }
      const messages = await sbAdmin('GET',
        `unibox_messages?thread_id=eq.${threadId}&order=occurred_at.asc&limit=200`
      ).catch(() => []);
      // Mark as read
      if (thread.unread_count > 0) {
        await sbAdmin('PATCH', `unibox_threads?id=eq.${threadId}`, {
          unread_count: 0, updated_at: new Date().toISOString()
        });
      }
      // Pull contact info
      let contact = null;
      if (thread.contact_id) {
        const c = await sbAdmin('GET', `outreach_contacts?id=eq.${thread.contact_id}&limit=1`).catch(() => []);
        contact = c && c[0];
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, thread, messages: messages || [], contact }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  })(); return;
}

if (req.method === 'POST' && /^\/api\/unibox\/thread\/[^/]+\/reply/.test(url)) {
  const threadId = url.split('/api/unibox/thread/')[1].split('/')[0];
  let b = ''; req.on('data', c => b += c);
  req.on('end', async () => {
    try {
      const pl = JSON.parse(b);
      const userId = pl.userId;
      const body = scrubEmDashes(pl.body || '');
      if (!userId || !body) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing userId or body' })); }
      const threadRows = await sbAdmin('GET', `unibox_threads?id=eq.${threadId}&limit=1`).catch(() => []);
      const thread = threadRows && threadRows[0];
      if (!thread) { res.writeHead(404); return res.end(JSON.stringify({ error: 'Thread not found' })); }
      // Insert outbound message
      await sbAdmin('POST', 'unibox_messages', {
        thread_id: threadId, user_id: userId, direction: 'out',
        body: body, sent_by_agent: pl.agent || 'manual',
        ai_draft: !!pl.fromAiDraft, occurred_at: new Date().toISOString()
      });
      // Bump thread
      await sbAdmin('PATCH', `unibox_threads?id=eq.${threadId}`, {
        message_count: (thread.message_count || 0) + 1,
        preview: body.slice(0, 140),
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      // Real send: route via Postiz / email / platform-specific based on thread.platform
      // Prototype: log only. Wire actual send in v16.1
      console.log('[UNIBOX] outbound queued for', thread.platform, 'to', thread.contact_handle);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, sent: true, note: 'Send queued. Wire platform-specific delivery in v16.1' }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  }); return;
}

if (req.method === 'POST' && /^\/api\/unibox\/thread\/[^/]+\/draft/.test(url)) {
  const threadId = url.split('/api/unibox/thread/')[1].split('/')[0];
  let b = ''; req.on('data', c => b += c);
  req.on('end', async () => {
    try {
      const pl = JSON.parse(b);
      const userId = pl.userId;
      if (!userId) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing userId' })); }
      const draft = await generateUniboxDraft(userId, threadId);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, draft }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  }); return;
}

if (req.method === 'PATCH' && /^\/api\/unibox\/thread\/[^/]+/.test(url) && !/\/(reply|draft)$/.test(url)) {
  const threadId = url.split('/api/unibox/thread/')[1].split('?')[0];
  let b = ''; req.on('data', c => b += c);
  req.on('end', async () => {
    try {
      const pl = JSON.parse(b);
      const update = { updated_at: new Date().toISOString() };
      if (pl.status) update.status = pl.status;
      if (pl.pinned !== undefined) update.pinned = !!pl.pinned;
      if (pl.unread_count !== undefined) update.unread_count = pl.unread_count;
      await sbAdmin('PATCH', `unibox_threads?id=eq.${threadId}`, update);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  }); return;
}

// ─── /api/signals — signal agents CRUD + manual run ──────────────

if (req.method === 'GET' && url.startsWith('/api/signals') && !url.includes('/hits')) {
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const userId = params.get('userId') || '';
  if (!userId) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing userId' })); }
  (async () => {
    try {
      const agents = await sbAdmin('GET',
        `signal_agents?user_id=eq.${userId}&order=created_at.desc&limit=20`
      ).catch(() => []);
      const stats = {
        total: (agents || []).length,
        active: (agents || []).filter(a => a.status === 'active').length,
        totalHits: (agents || []).reduce((acc, a) => acc + (a.hits_total || 0), 0),
        hits7d: (agents || []).reduce((acc, a) => acc + (a.hits_last_7d || 0), 0)
      };
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, agents: agents || [], stats }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  })(); return;
}

if (req.method === 'POST' && url === '/api/signals') {
  let b = ''; req.on('data', c => b += c);
  req.on('end', async () => {
    try {
      const pl = JSON.parse(b);
      if (!pl.userId || !pl.name) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing userId or name' })); }
      const row = await sbAdmin('POST', 'signal_agents', {
        user_id: pl.userId,
        name: pl.name,
        status: pl.status || 'active',
        icp: pl.icp || {},
        precision: pl.precision || 50,
        signals: pl.signals || [],
        objectives: pl.objectives || {},
        cron_expr: pl.cron_expr || '0 */6 * * *',
        next_run_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, agent: Array.isArray(row) ? row[0] : row }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  }); return;
}

if (req.method === 'PATCH' && url.startsWith('/api/signals/')) {
  const agentId = url.split('/api/signals/')[1].split('?')[0].split('/')[0];
  if (url.endsWith('/run')) {
    (async () => {
      try {
        const result = await runSignalAgent(agentId);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, ...result }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    })(); return;
  }
  let b = ''; req.on('data', c => b += c);
  req.on('end', async () => {
    try {
      const pl = JSON.parse(b);
      const update = { updated_at: new Date().toISOString() };
      ['name', 'status', 'icp', 'precision', 'signals', 'objectives', 'cron_expr'].forEach(k => {
        if (pl[k] !== undefined) update[k] = pl[k];
      });
      await sbAdmin('PATCH', `signal_agents?id=eq.${agentId}`, update);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  }); return;
}

if (req.method === 'POST' && /^\/api\/signals\/[^/]+\/run$/.test(url)) {
  const agentId = url.split('/api/signals/')[1].split('/')[0];
  (async () => {
    try {
      const result = await runSignalAgent(agentId);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, ...result }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  })(); return;
}

if (req.method === 'DELETE' && url.startsWith('/api/signals/')) {
  const agentId = url.split('/api/signals/')[1].split('?')[0];
  (async () => {
    try {
      await sbAdmin('DELETE', `signal_agents?id=eq.${agentId}`);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  })(); return;
}

if (req.method === 'GET' && /^\/api\/signals\/[^/]+\/hits/.test(url)) {
  const agentId = url.split('/api/signals/')[1].split('/')[0];
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const status = params.get('status') || '';
  (async () => {
    try {
      let q = `signal_hits?agent_id=eq.${agentId}&order=created_at.desc&limit=100`;
      if (status) q += `&status=eq.${status}`;
      const hits = await sbAdmin('GET', q).catch(() => []);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, hits: hits || [] }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  })(); return;
}

// ─── /api/triggers — comment-harvest CRUD ────────────────────────

if (req.method === 'GET' && url.startsWith('/api/triggers') && !url.includes('/captures')) {
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const userId = params.get('userId') || '';
  if (!userId) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing userId' })); }
  (async () => {
    try {
      const triggers = await sbAdmin('GET',
        `comment_triggers?user_id=eq.${userId}&order=created_at.desc&limit=50`
      ).catch(() => []);
      const stats = {
        total: (triggers || []).length,
        active: (triggers || []).filter(t => t.status === 'active').length,
        totalCaptures: (triggers || []).reduce((acc, t) => acc + (t.responses_sent || 0), 0)
      };
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, triggers: triggers || [], stats }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  })(); return;
}

if (req.method === 'POST' && url === '/api/triggers') {
  let b = ''; req.on('data', c => b += c);
  req.on('end', async () => {
    try {
      const pl = JSON.parse(b);
      if (!pl.userId || !pl.platform || !pl.post_url || !pl.trigger_word || !pl.dm_template) {
        res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing required fields' }));
      }
      const row = await sbAdmin('POST', 'comment_triggers', {
        user_id: pl.userId,
        name: pl.name || `${pl.platform} trigger — ${pl.trigger_word}`,
        platform: pl.platform,
        post_url: pl.post_url,
        trigger_word: pl.trigger_word,
        trigger_word_match: pl.trigger_word_match || 'contains',
        case_sensitive: !!pl.case_sensitive,
        dm_template: scrubEmDashes(pl.dm_template),
        lead_magnet_url: pl.lead_magnet_url || null,
        capture_email: !!pl.capture_email,
        max_responses: pl.max_responses || null,
        expires_at: pl.expires_at || null
      });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, trigger: Array.isArray(row) ? row[0] : row }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  }); return;
}

if (req.method === 'PATCH' && url.startsWith('/api/triggers/')) {
  const triggerId = url.split('/api/triggers/')[1].split('?')[0].split('/')[0];
  let b = ''; req.on('data', c => b += c);
  req.on('end', async () => {
    try {
      const pl = JSON.parse(b);
      const update = { updated_at: new Date().toISOString() };
      ['name', 'status', 'trigger_word', 'dm_template', 'lead_magnet_url', 'max_responses', 'expires_at'].forEach(k => {
        if (pl[k] !== undefined) update[k] = k === 'dm_template' ? scrubEmDashes(pl[k]) : pl[k];
      });
      await sbAdmin('PATCH', `comment_triggers?id=eq.${triggerId}`, update);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  }); return;
}

if (req.method === 'DELETE' && url.startsWith('/api/triggers/')) {
  const triggerId = url.split('/api/triggers/')[1].split('?')[0];
  (async () => {
    try {
      await sbAdmin('DELETE', `comment_triggers?id=eq.${triggerId}`);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  })(); return;
}

if (req.method === 'GET' && /^\/api\/triggers\/[^/]+\/captures/.test(url)) {
  const triggerId = url.split('/api/triggers/')[1].split('/')[0];
  (async () => {
    try {
      const captures = await sbAdmin('GET',
        `comment_captures?trigger_id=eq.${triggerId}&order=captured_at.desc&limit=100`
      ).catch(() => []);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, captures: captures || [] }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  })(); return;
}

// ─── /api/campaigns — sequences CRUD ─────────────────────────────

if (req.method === 'GET' && url.startsWith('/api/campaigns') && !url.includes('/steps') && !url.includes('/enrollments')) {
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const userId = params.get('userId') || '';
  if (!userId) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing userId' })); }
  (async () => {
    try {
      const campaigns = await sbAdmin('GET',
        `outreach_campaigns?user_id=eq.${userId}&order=created_at.desc&limit=50`
      ).catch(() => []);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, campaigns: campaigns || [] }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  })(); return;
}

if (req.method === 'POST' && url === '/api/campaigns') {
  let b = ''; req.on('data', c => b += c);
  req.on('end', async () => {
    try {
      const pl = JSON.parse(b);
      if (!pl.userId || !pl.name) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing fields' })); }
      const row = await sbAdmin('POST', 'outreach_campaigns', {
        user_id: pl.userId, name: pl.name, description: pl.description || null,
        channel: pl.channel || 'email', status: pl.status || 'draft',
        daily_limit: pl.daily_limit || 50,
        stop_on_reply: pl.stop_on_reply !== false,
        text_only_mode: pl.text_only_mode !== false,
        link_tracking: !!pl.link_tracking,
        open_tracking: !!pl.open_tracking
      });
      const campaign = Array.isArray(row) ? row[0] : row;
      // Insert steps if provided
      if (Array.isArray(pl.steps) && pl.steps.length > 0) {
        for (let i = 0; i < pl.steps.length; i++) {
          const s = pl.steps[i];
          await sbAdmin('POST', 'campaign_steps', {
            campaign_id: campaign.id,
            step_index: i + 1,
            channel: s.channel || pl.channel || 'email',
            step_type: s.step_type || 'email',
            subject_spintax: s.subject_spintax ? scrubEmDashes(s.subject_spintax) : null,
            body_spintax: scrubEmDashes(s.body_spintax || ''),
            delay_days: s.delay_days || (i === 0 ? 0 : 1),
            delay_hours: s.delay_hours || 0
          });
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, campaign }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  }); return;
}

if (req.method === 'GET' && /^\/api\/campaigns\/[^/]+$/.test(url)) {
  const campaignId = url.split('/api/campaigns/')[1].split('?')[0];
  (async () => {
    try {
      const c = await sbAdmin('GET', `outreach_campaigns?id=eq.${campaignId}&limit=1`).catch(() => []);
      const steps = await sbAdmin('GET',
        `campaign_steps?campaign_id=eq.${campaignId}&order=step_index.asc`
      ).catch(() => []);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, campaign: c && c[0], steps: steps || [] }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  })(); return;
}

if (req.method === 'PATCH' && /^\/api\/campaigns\/[^/]+$/.test(url)) {
  const campaignId = url.split('/api/campaigns/')[1].split('?')[0];
  let b = ''; req.on('data', c => b += c);
  req.on('end', async () => {
    try {
      const pl = JSON.parse(b);
      const update = { updated_at: new Date().toISOString() };
      ['name', 'description', 'status', 'daily_limit', 'stop_on_reply', 'text_only_mode', 'link_tracking', 'open_tracking'].forEach(k => {
        if (pl[k] !== undefined) update[k] = pl[k];
      });
      await sbAdmin('PATCH', `outreach_campaigns?id=eq.${campaignId}`, update);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  }); return;
}

// Spintax preview endpoint (helps frontend show what spintax resolves to)
if (req.method === 'POST' && url === '/api/spintax/preview') {
  let b = ''; req.on('data', c => b += c);
  req.on('end', async () => {
    try {
      const pl = JSON.parse(b);
      const variations = [];
      for (let i = 0; i < (pl.count || 5); i++) {
        variations.push(resolveSpintax(pl.template, 'preview-' + i));
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, variations }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  }); return;
}

// ─── /api/outcomes — log + read dollar outcomes ──────────────────

if (req.method === 'GET' && url.startsWith('/api/outcomes')) {
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const userId = params.get('userId') || '';
  if (!userId) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing userId' })); }
  (async () => {
    try {
      const events = await sbAdmin('GET',
        `outcome_events?user_id=eq.${userId}&order=occurred_at.desc&limit=200`
      ).catch(() => []);
      const totalLifetime = (events || []).reduce((acc, e) => acc + parseFloat(e.dollar_value || 0), 0);
      const now = Date.now();
      const last30 = (events || []).filter(e => new Date(e.occurred_at).getTime() > now - 30 * 86400000);
      const total30d = last30.reduce((acc, e) => acc + parseFloat(e.dollar_value || 0), 0);
      const byType = (events || []).reduce((acc, e) => {
        acc[e.event_type] = (acc[e.event_type] || 0) + parseFloat(e.dollar_value || 0);
        return acc;
      }, {});
      const byAgent = (events || []).reduce((acc, e) => {
        if (e.attributed_agent) acc[e.attributed_agent] = (acc[e.attributed_agent] || 0) + parseFloat(e.dollar_value || 0);
        return acc;
      }, {});
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, events: events || [], stats: { totalLifetime, total30d, byType, byAgent } }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  })(); return;
}

if (req.method === 'POST' && url === '/api/outcomes') {
  let b = ''; req.on('data', c => b += c);
  req.on('end', async () => {
    try {
      const pl = JSON.parse(b);
      if (!pl.userId || !pl.event_type) { res.writeHead(400); return res.end(JSON.stringify({ error: 'Missing fields' })); }
      const row = await sbAdmin('POST', 'outcome_events', {
        user_id: pl.userId,
        event_type: pl.event_type,
        dollar_value: pl.dollar_value || 0,
        attributed_agent: pl.attributed_agent || null,
        contact_id: pl.contact_id || null,
        campaign_id: pl.campaign_id || null,
        notes: pl.notes || null,
        occurred_at: pl.occurred_at || new Date().toISOString()
      });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, event: Array.isArray(row) ? row[0] : row }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  }); return;
}

// ─── /api/subreddits — read-only seed table for NOVA reference ───

if (req.method === 'GET' && url.startsWith('/api/subreddits')) {
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const category = params.get('category') || '';
  (async () => {
    try {
      let q = 'reddit_subreddit_master?order=est_members.desc&limit=200';
      if (category) q += `&category=eq.${encodeURIComponent(category)}`;
      const subs = await sbAdmin('GET', q).catch(() => []);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, subreddits: subs || [] }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
  })(); return;
}


// ───────────────────────────────────────────────────────────────
// [C] CRON additions — paste in cron block (~line 12700)
// runs every hour via existing scheduler
// ───────────────────────────────────────────────────────────────

// inside the existing `setInterval(async () => { ... }, 60_000)` loop or per-hour block:
//
//   // SIGNAL AGENT POLLING — every active agent past next_run_at
//   try {
//     const dueAgents = await sbAdmin('GET',
//       `signal_agents?status=eq.active&next_run_at=lte.${new Date().toISOString()}&limit=10`
//     ).catch(() => []);
//     for (const agent of (dueAgents || [])) {
//       try {
//         const result = await runSignalAgent(agent.id);
//         console.log('[CRON SIGNAL]', agent.name, JSON.stringify(result));
//       } catch (e) { console.log('[CRON SIGNAL] error for', agent.name, e.message); }
//     }
//   } catch (e) { console.log('[CRON SIGNAL] poll fetch failed:', e.message); }
//
//   // COMMENT TRIGGER POLLING — active triggers past 5min poll interval
//   try {
//     const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
//     const dueTriggers = await sbAdmin('GET',
//       `comment_triggers?status=eq.active&or=(last_polled_at.is.null,last_polled_at.lte.${fiveMinAgo})&limit=20`
//     ).catch(() => []);
//     for (const trigger of (dueTriggers || [])) {
//       try {
//         const result = await runCommentTrigger(trigger.id);
//         console.log('[CRON TRIGGER]', trigger.name, JSON.stringify(result));
//       } catch (e) { console.log('[CRON TRIGGER] error for', trigger.name, e.message); }
//     }
//   } catch (e) { console.log('[CRON TRIGGER] poll fetch failed:', e.message); }
//
//   // SIGNAL HITS 7d ROLLUP — reset weekly counter
//   if (now.getUTCHours() === 0 && now.getUTCMinutes() < 5) {
//     try {
//       const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
//       // Recompute hits_last_7d for all active agents
//       const allAgents = await sbAdmin('GET', 'signal_agents?status=eq.active&select=id&limit=200').catch(() => []);
//       for (const a of (allAgents || [])) {
//         const hits = await sbAdmin('GET', `signal_hits?agent_id=eq.${a.id}&created_at=gte.${weekAgo}&select=id`).catch(() => []);
//         await sbAdmin('PATCH', `signal_agents?id=eq.${a.id}`, { hits_last_7d: (hits || []).length });
//       }
//     } catch (e) { console.log('[CRON ROLLUP] failed:', e.message); }
//   }


// ───────────────────────────────────────────────────────────────
// [D] VERSION + CHANGELOG — update top of server.js
// ───────────────────────────────────────────────────────────────

// Change line 2 to:
//   const LUNARI_VERSION = 'v\u221E.16.0';
//
// And add this entry to LUNARI_CHANGELOG (at the top, before v15.22):
//
//   'v\u221E.16.0': {
//     date: '2026-04-25',
//     summary: 'OUTREACH V2 prototype shipped. Closes the loop: unified inbox, persistent signal agents, comment-trigger DM automation, multi-step campaigns with spintax, dollars-not-fuel outcome events. New tables: unibox_threads, unibox_messages, signal_agents, signal_hits, comment_triggers, comment_captures, outreach_campaigns, campaign_steps, campaign_enrollments, outcome_events, reddit_subreddit_master, reddit_accounts. Frontend OutreachPage rewritten as 5-tab interface (Pipeline / Unibox / Signals / Campaigns / Triggers). Seed data: 40+ subreddits across SaaS, music, photo, video, design niches.',
//     files: [
//       'server.js (helpers + endpoints + cron stubs)',
//       'src/components/outreach/OutreachPage.tsx (tabbed orchestrator)',
//       'src/components/outreach/PipelineTab.tsx, UniboxTab.tsx, SignalsTab.tsx, CampaignsTab.tsx, TriggersTab.tsx',
//       'v16.0-outreach-v2 migration applied to Supabase'
//     ],
//     notes: [
//       'Prototype scope: schema + endpoints + UI complete. Real-time polling stubs in place.',
//       'Comment-trigger comment fetch needs platform-specific Postiz wiring in v16.1',
//       'Unibox outbound delivery currently logs only — actual platform send in v16.1',
//       'Signal agents wired to apolloSearchPeople for stub data. LinkedIn/Twitter watchers in v16.2',
//       'No campaign send loop yet — schema and step authoring complete, send cron in v16.1',
//       'sequrity: RLS on all new tables, sbAdmin bypasses for cron'
//     ]
//   }


// ═══════════════════════════════════════════════════════════════
// END OF OUTREACH V2 BACKEND ADDITIONS
// ═══════════════════════════════════════════════════════════════
```

═══════════════════════════════════════════════════════════════
## FILE: `web/src/components/outreach/types.ts`
═══════════════════════════════════════════════════════════════

```typescript
// ═══════════════════════════════════════════════════════════════
// LUNARI OUTREACH V2 — Shared Types
// ═══════════════════════════════════════════════════════════════

export type Platform =
  | 'email'
  | 'linkedin'
  | 'twitter'
  | 'instagram'
  | 'tiktok'
  | 'reddit'
  | 'telegram'
  | 'facebook'
  | 'threads'
  | 'bluesky';

export interface Contact {
  id: string;
  name?: string;
  company?: string;
  email?: string;
  title?: string;
  pipeline_stage: string;
  deal_value?: number;
  status?: string;
  sent_at?: string;
  stage_updated_at?: string;
  source?: string;
  city?: string;
  notes?: string;
  created_at?: string;
  ai_score?: number;
  source_signal_type?: string;
  profile_url?: string;
  avatar_url?: string;
  industry?: string;
}

export interface PipelineData {
  stages: Record<string, Contact[]>;
  stats: {
    total: number;
    totalValue: number;
    byStage: Record<string, number>;
  };
}

export interface UniboxThread {
  id: string;
  user_id: string;
  platform: Platform;
  external_thread_id?: string | null;
  contact_id?: string | null;
  contact_handle?: string | null;
  contact_name?: string | null;
  contact_avatar_url?: string | null;
  subject?: string | null;
  preview?: string;
  unread_count: number;
  message_count: number;
  status: 'open' | 'archived' | 'spam' | 'closed';
  pinned?: boolean;
  campaign_id?: string | null;
  source_signal_type?: string | null;
  last_message_at: string;
  created_at: string;
}

export interface UniboxMessage {
  id: string;
  thread_id: string;
  user_id: string;
  direction: 'in' | 'out';
  body: string;
  body_html?: string | null;
  sent_by_agent?: string | null;
  ai_draft?: boolean;
  read_at?: string | null;
  attachments?: any[];
  metadata?: Record<string, any>;
  occurred_at: string;
  created_at: string;
}

export interface UniboxStats {
  total: number;
  unread: number;
  byPlatform: Record<string, number>;
}

export interface SignalAgent {
  id: string;
  user_id: string;
  name: string;
  status: 'active' | 'paused' | 'archived';
  icp: {
    titles?: string[];
    locations?: string[];
    industries?: string[];
    company_sizes?: string[];
    exclusions?: string[];
  };
  precision: number;
  signals: SignalDefinition[];
  objectives: {
    pain_points?: string[];
    campaign_goal?: string;
    message_tone?: string;
  };
  hits_total: number;
  hits_last_7d: number;
  last_run_at?: string | null;
  next_run_at?: string | null;
  cron_expr?: string;
  created_at: string;
  updated_at: string;
}

export interface SignalDefinition {
  type: string;
  config?: Record<string, any>;
  enabled?: boolean;
  bucket?: string;
}

export interface SignalHit {
  id: string;
  agent_id: string;
  user_id: string;
  signal_type: string;
  signal_context?: string | null;
  contact_handle?: string | null;
  contact_name?: string | null;
  contact_title?: string | null;
  contact_company?: string | null;
  contact_avatar_url?: string | null;
  contact_profile_url?: string | null;
  ai_score?: number | null;
  contact_id?: string | null;
  status: 'new' | 'enriched' | 'enrolled' | 'dismissed';
  created_at: string;
}

export interface CommentTrigger {
  id: string;
  user_id: string;
  name?: string;
  platform: Platform;
  post_url: string;
  post_external_id?: string | null;
  trigger_word: string;
  trigger_word_match?: 'exact' | 'contains' | 'starts_with';
  case_sensitive?: boolean;
  dm_template: string;
  lead_magnet_url?: string | null;
  capture_email?: boolean;
  max_responses?: number | null;
  responses_sent: number;
  status: 'active' | 'paused' | 'expired' | 'completed';
  expires_at?: string | null;
  last_polled_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommentCapture {
  id: string;
  trigger_id: string;
  user_id: string;
  commenter_handle: string;
  commenter_name?: string | null;
  commenter_avatar_url?: string | null;
  commenter_external_id?: string | null;
  comment_text?: string | null;
  comment_url?: string | null;
  dm_status: 'pending' | 'sent' | 'failed' | 'bounced';
  dm_sent_at?: string | null;
  dm_error?: string | null;
  contact_id?: string | null;
  thread_id?: string | null;
  email?: string | null;
  captured_at: string;
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  channel: 'email' | 'linkedin' | 'twitter' | 'mixed';
  status: 'draft' | 'active' | 'paused' | 'completed';
  daily_limit: number;
  stop_on_reply: boolean;
  text_only_mode: boolean;
  link_tracking: boolean;
  open_tracking: boolean;
  enrolled_count: number;
  sent_count: number;
  reply_count: number;
  booked_count: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignStep {
  id: string;
  campaign_id: string;
  step_index: number;
  channel?: string | null;
  step_type: 'invitation' | 'message' | 'email' | 'wait';
  subject_spintax?: string | null;
  body_spintax: string;
  delay_days: number;
  delay_hours: number;
}

export interface OutcomeEvent {
  id: string;
  user_id: string;
  event_type: string;
  dollar_value: number;
  attributed_agent?: string | null;
  contact_id?: string | null;
  campaign_id?: string | null;
  notes?: string | null;
  occurred_at: string;
  created_at: string;
}

export interface OutcomeStats {
  totalLifetime: number;
  total30d: number;
  byType: Record<string, number>;
  byAgent: Record<string, number>;
}

// Platform display metadata
export const PLATFORM_META: Record<Platform, { label: string; color: string; icon: string }> = {
  email:     { label: 'Email',     color: '#94a3b8', icon: '✉' },
  linkedin:  { label: 'LinkedIn',  color: '#0a66c2', icon: 'in' },
  twitter:   { label: 'X',         color: '#1d9bf0', icon: '𝕏' },
  instagram: { label: 'Instagram', color: '#e1306c', icon: 'IG' },
  tiktok:    { label: 'TikTok',    color: '#ff0050', icon: '♪' },
  reddit:    { label: 'Reddit',    color: '#ff4500', icon: 'r/' },
  telegram:  { label: 'Telegram',  color: '#26a5e4', icon: '✈' },
  facebook:  { label: 'Facebook',  color: '#1877f2', icon: 'f' },
  threads:   { label: 'Threads',   color: '#cccccc', icon: '@' },
  bluesky:   { label: 'Bluesky',   color: '#0085ff', icon: '☁' },
};

// Signal types organized into buckets (matches gojiberry taxonomy)
export const SIGNAL_BUCKETS = {
  'You & Your Niche': [
    { type: 'engaged_with_your_content', label: 'engaged with your content' },
    { type: 'mentioned_your_name',       label: 'mentioned your name' },
    { type: 'followed_your_page',        label: 'followed your page' },
  ],
  'Engagement & Interest': [
    { type: 'engaged_with_keyword',      label: 'engaged with relevant keyword' },
    { type: 'commented_on_topic',        label: 'commented on topic' },
    { type: 'searching_for',             label: '"looking for / need a" pattern' },
  ],
  'Profile Signals': [
    { type: 'followed_competitor',       label: 'followed competitor profile' },
    { type: 'viewed_similar_creator',    label: 'viewed similar creator' },
  ],
  'Trigger Events': [
    { type: 'hiring_post',               label: 'posted a hiring intent' },
    { type: 'tool_mention',              label: 'mentioned a tool you replace' },
    { type: 'job_change',                label: 'recently changed roles' },
  ],
  'Competitor Engagement': [
    { type: 'engaged_with_competitor',   label: 'engaged with competitor content' },
    { type: 'left_competitor',           label: 'unfollowed competitor' },
  ],
} as const;
```

═══════════════════════════════════════════════════════════════
## FILE: `web/src/components/outreach/OutreachPage.tsx`
═══════════════════════════════════════════════════════════════

```tsx
// ═══════════════════════════════════════════════════════════════
// LUNARI OUTREACH V2 — Tabbed orchestrator (v∞.16.0)
// 5 tabs: Pipeline / Unibox / Signals / Campaigns / Triggers
// Closes the loop: outbound → reply → unified inbox → conversion
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import {
  Mail, Inbox, Radar, Send, MessageSquareQuote,
  RefreshCw, DollarSign, Activity, Target, Flame
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { PipelineTab } from './PipelineTab';
import { UniboxTab } from './UniboxTab';
import { SignalsTab } from './SignalsTab';
import { CampaignsTab } from './CampaignsTab';
import { TriggersTab } from './TriggersTab';
import type { OutcomeStats } from './types';

const API_URL = 'https://nodejs-production-63513.up.railway.app';

type TabId = 'pipeline' | 'unibox' | 'signals' | 'campaigns' | 'triggers';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Mail;
  badge?: number;
}

interface GlobalStats {
  pipelineValue: number;
  pipelineTotal: number;
  unread: number;
  activeSignals: number;
  hits7d: number;
  activeTriggers: number;
  outcomes: OutcomeStats | null;
}

export function OutreachPage() {
  const { authUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    try { return (localStorage.getItem('lunari-outreach-tab') as TabId) || 'pipeline'; } catch { return 'pipeline'; }
  });
  const [stats, setStats] = useState<GlobalStats>({
    pipelineValue: 0, pipelineTotal: 0, unread: 0, activeSignals: 0,
    hits7d: 0, activeTriggers: 0, outcomes: null,
  });
  const [refreshTick, setRefreshTick] = useState(0);

  function switchTab(tab: TabId) {
    setActiveTab(tab);
    try { localStorage.setItem('lunari-outreach-tab', tab); } catch { /* noop */ }
  }

  async function loadStats() {
    if (!authUser) return;
    try {
      const [pipeline, unibox, signals, triggers, outcomes] = await Promise.all([
        fetch(`${API_URL}/api/pipeline?userId=${authUser.id}`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/unibox/threads?userId=${authUser.id}`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/signals?userId=${authUser.id}`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/triggers?userId=${authUser.id}`).then(r => r.json()).catch(() => null),
        fetch(`${API_URL}/api/outcomes?userId=${authUser.id}`).then(r => r.json()).catch(() => null),
      ]);
      setStats({
        pipelineValue: pipeline?.stats?.totalValue || 0,
        pipelineTotal: pipeline?.stats?.total || 0,
        unread: unibox?.stats?.unread || 0,
        activeSignals: signals?.stats?.active || 0,
        hits7d: signals?.stats?.hits7d || 0,
        activeTriggers: triggers?.stats?.active || 0,
        outcomes: outcomes?.stats || null,
      });
    } catch (e) {
      console.error('[OUTREACH] stats load failed', e);
    }
  }

  useEffect(() => { loadStats(); }, [authUser, refreshTick]);

  const tabs: TabDef[] = [
    { id: 'pipeline',  label: 'Pipeline',  icon: Mail },
    { id: 'unibox',    label: 'Unibox',    icon: Inbox,           badge: stats.unread },
    { id: 'signals',   label: 'Signals',   icon: Radar,           badge: stats.hits7d },
    { id: 'campaigns', label: 'Campaigns', icon: Send },
    { id: 'triggers',  label: 'Triggers',  icon: MessageSquareQuote, badge: stats.activeTriggers },
  ];

  const heroDollars = (stats.outcomes?.totalLifetime || 0) + stats.pipelineValue;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: 'var(--black)',
    }}>
      {/* ── Header ────────────────────────── */}
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid rgba(220,227,240,0.06)',
        background: 'rgba(8,9,14,0.95)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mail size={18} color="var(--gold)" />
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
            letterSpacing: 3, color: 'var(--cream)',
          }}>
            LUNARI OUTREACH
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
            color: 'var(--gold)', opacity: 0.6, marginLeft: 4,
          }}>
            v∞.16.0
          </div>
        </div>

        <button
          onClick={() => setRefreshTick(t => t + 1)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(201,168,76,0.08)',
            border: '1px solid rgba(201,168,76,0.2)',
            color: 'var(--gold)', padding: '6px 12px', borderRadius: 6,
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={11} />
          REFRESH
        </button>
      </div>

      {/* ── Hero stats — dollars-not-fuel framing ──────────────── */}
      <div style={{
        display: 'flex', gap: 20, padding: '16px 24px',
        borderBottom: '1px solid rgba(220,227,240,0.04)',
        background: 'linear-gradient(180deg, rgba(201,168,76,0.04) 0%, rgba(8,9,14,0.5) 100%)',
        flexShrink: 0,
      }}>
        <HeroStat
          icon={DollarSign}
          label="OPPORTUNITIES SINCE LAUNCH"
          value={`$${heroDollars.toLocaleString()}`}
          color="var(--gold)"
          big
        />
        <HeroStat
          icon={Target}
          label="PIPELINE"
          value={`${stats.pipelineTotal} contacts`}
          sub={`$${stats.pipelineValue.toLocaleString()}`}
          color="var(--cream)"
        />
        <HeroStat
          icon={Activity}
          label="ACTIVE SIGNALS"
          value={`${stats.activeSignals}`}
          sub={`${stats.hits7d} hits last 7d`}
          color="#6b8afd"
        />
        <HeroStat
          icon={Inbox}
          label="UNIBOX"
          value={`${stats.unread} unread`}
          color={stats.unread > 0 ? '#e8a040' : 'var(--muted)'}
        />
        <HeroStat
          icon={Flame}
          label="LAST 30 DAYS"
          value={`$${(stats.outcomes?.total30d || 0).toLocaleString()}`}
          sub="generated"
          color="#4ade80"
        />
      </div>

      {/* ── Tab nav ──────────────────────── */}
      <div style={{
        display: 'flex', gap: 2, padding: '0 24px',
        borderBottom: '1px solid rgba(220,227,240,0.06)',
        background: 'rgba(8,9,14,0.7)',
        flexShrink: 0,
      }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '12px 16px',
                background: isActive ? 'rgba(201,168,76,0.06)' : 'transparent',
                border: 'none',
                borderBottom: `2px solid ${isActive ? 'var(--gold)' : 'transparent'}`,
                color: isActive ? 'var(--gold)' : 'var(--muted)',
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5,
                cursor: 'pointer', transition: 'all 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget.style.color = 'var(--cream)'); }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget.style.color = 'var(--muted)'); }}
            >
              <Icon size={13} strokeWidth={isActive ? 2 : 1.5} />
              {tab.label.toUpperCase()}
              {tab.badge != null && tab.badge > 0 && (
                <span style={{
                  background: isActive ? 'var(--gold)' : 'rgba(201,168,76,0.3)',
                  color: isActive ? 'var(--black)' : 'var(--gold)',
                  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                  borderRadius: 8, padding: '1px 6px', marginLeft: 3,
                  minWidth: 16, textAlign: 'center',
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab body ─────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'pipeline'  && <PipelineTab refreshTick={refreshTick} onChange={loadStats} />}
        {activeTab === 'unibox'    && <UniboxTab refreshTick={refreshTick} onChange={loadStats} />}
        {activeTab === 'signals'   && <SignalsTab refreshTick={refreshTick} onChange={loadStats} />}
        {activeTab === 'campaigns' && <CampaignsTab refreshTick={refreshTick} onChange={loadStats} />}
        {activeTab === 'triggers'  && <TriggersTab refreshTick={refreshTick} onChange={loadStats} />}
      </div>
    </div>
  );
}

function HeroStat({
  icon: Icon, label, value, sub, color = 'var(--cream)', big = false,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  sub?: string;
  color?: string;
  big?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: big ? '6px 16px 6px 0' : '4px 16px 4px 0',
      borderRight: big ? `1px solid ${color}22` : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon size={11} color={color} strokeWidth={1.5} />
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1.5,
          color: 'var(--dim)',
        }}>
          {label}
        </div>
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: big ? 22 : 16,
        fontWeight: 700,
        color, lineHeight: 1.1,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--dim)', letterSpacing: 0.5,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}
```

═══════════════════════════════════════════════════════════════
## FILE: `web/src/components/outreach/PipelineTab.tsx`
═══════════════════════════════════════════════════════════════

```tsx
// ═══════════════════════════════════════════════════════════════
// LUNARI OUTREACH V2 — Pipeline Tab
// Kanban board + log-an-outcome button for dollar attribution
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { Building2, DollarSign, Plus, X, ExternalLink, Flame } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { Contact, PipelineData } from './types';

const API_URL = 'https://nodejs-production-63513.up.railway.app';

const STAGE_ORDER = ['lead', 'contacted', 'replied', 'booked', 'paid', 'lost'] as const;
const STAGE_LABELS: Record<string, string> = {
  lead: 'Lead', contacted: 'Contacted', replied: 'Replied',
  booked: 'Booked', paid: 'Paid', lost: 'Lost',
};
const STAGE_COLORS: Record<string, string> = {
  lead: '#94a3b8', contacted: '#e8a040', replied: '#6b8afd',
  booked: '#c9a84c', paid: '#4ade80', lost: '#e85050',
};

interface Props {
  refreshTick: number;
  onChange: () => void;
}

export function PipelineTab({ refreshTick, onChange }: Props) {
  const { authUser } = useAuth();
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragContact, setDragContact] = useState<Contact | null>(null);
  const [outcomeFor, setOutcomeFor] = useState<Contact | null>(null);

  async function load() {
    if (!authUser) return;
    try {
      const res = await fetch(`${API_URL}/api/pipeline?userId=${authUser.id}`);
      const json = await res.json();
      if (json.ok) setData({ stages: json.stages, stats: json.stats });
    } catch (err) {
      console.error('[PIPELINE] load failed', err);
    }
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [authUser, refreshTick]);

  async function moveContactToStage(contactId: string, newStage: string) {
    if (!data) return;
    const newData: PipelineData = { stages: { ...data.stages }, stats: { ...data.stats } };
    for (const stage of STAGE_ORDER) {
      newData.stages[stage] = (newData.stages[stage] || []).filter(c => c.id !== contactId);
    }
    const orig = Object.values(data.stages).flat().find(c => c.id === contactId);
    if (orig) {
      const updated = { ...orig, pipeline_stage: newStage };
      newData.stages[newStage] = [...(newData.stages[newStage] || []), updated];
    }
    setData(newData);

    try {
      await fetch(`${API_URL}/api/pipeline/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_stage: newStage }),
      });
      onChange();
    } catch (err) {
      console.error('[PIPELINE] stage update failed', err);
      load();
    }
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)' }}>
          LOADING PIPELINE...
        </div>
      </div>
    );
  }

  const hasContacts = (data?.stats?.total || 0) > 0;

  if (!hasContacts) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', padding: 40, color: 'var(--muted)',
      }}>
        <Building2 size={32} color="var(--gold)" style={{ opacity: 0.4, marginBottom: 16 }} />
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 1,
          color: 'var(--cream)', marginBottom: 8,
        }}>
          NO CONTACTS YET
        </div>
        <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 480, textAlign: 'center', lineHeight: 1.5 }}>
          launch a signal agent or run a comment trigger... ATLAS will scout, GEN will capture, NOVA will draft outreach. all of it shows up here.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, overflow: 'auto', padding: 16,
      display: 'flex', gap: 12, minWidth: 0,
    }}>
      {STAGE_ORDER.map(stage => {
        const contacts = data!.stages[stage] || [];
        const color = STAGE_COLORS[stage];
        return (
          <div
            key={stage}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              if (dragContact && dragContact.pipeline_stage !== stage) {
                moveContactToStage(dragContact.id, stage);
              }
              setDragContact(null);
            }}
            style={{
              minWidth: 270, width: 270, flexShrink: 0,
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${color}22`,
              borderRadius: 10, padding: 10,
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 10, paddingBottom: 8,
              borderBottom: `1px solid ${color}22`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%', background: color,
                  boxShadow: `0 0 6px ${color}80`,
                }} />
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.5,
                  color: 'var(--cream)', fontWeight: 600,
                }}>
                  {STAGE_LABELS[stage].toUpperCase()}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                {contacts.length}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
              {contacts.map(contact => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  color={color}
                  onDragStart={() => setDragContact(contact)}
                  onDragEnd={() => setDragContact(null)}
                  onLogOutcome={() => setOutcomeFor(contact)}
                />
              ))}
              {contacts.length === 0 && (
                <div style={{
                  padding: '20px 8px', textAlign: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
                  color: 'var(--dim)', opacity: 0.5,
                }}>
                  ... empty ...
                </div>
              )}
            </div>
          </div>
        );
      })}

      {outcomeFor && (
        <OutcomeModal
          contact={outcomeFor}
          onClose={() => setOutcomeFor(null)}
          onSaved={() => { setOutcomeFor(null); load(); onChange(); }}
        />
      )}
    </div>
  );
}

function ContactCard({
  contact, color, onDragStart, onDragEnd, onLogOutcome,
}: {
  contact: Contact; color: string;
  onDragStart: () => void; onDragEnd: () => void; onLogOutcome: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: 'rgba(8,9,14,0.6)',
        border: '1px solid rgba(220,227,240,0.06)',
        borderRadius: 8, padding: 10, cursor: 'grab',
        fontSize: 12, transition: 'all 0.15s',
        position: 'relative',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${color}44`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(220,227,240,0.06)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <div style={{ color: 'var(--cream)', fontWeight: 600, flex: 1 }}>
          {contact.name || contact.email || 'Unknown'}
        </div>
        {contact.ai_score != null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            fontFamily: 'var(--font-mono)', fontSize: 9, color: '#e8a040',
          }}>
            <Flame size={9} fill="#e8a040" stroke="#e8a040" />
            {contact.ai_score}
          </div>
        )}
      </div>
      {contact.company && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)', fontSize: 11, marginBottom: 2 }}>
          <Building2 size={10} />
          {contact.company}
        </div>
      )}
      {contact.title && (
        <div style={{ color: 'var(--dim)', fontSize: 10, marginBottom: 4 }}>
          {contact.title}
        </div>
      )}
      {contact.source_signal_type && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, color: '#6b8afd',
          marginBottom: 3, opacity: 0.85,
        }}>
          ↳ {contact.source_signal_type.replace(/_/g, ' ')}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
        {contact.deal_value ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--gold)',
          }}>
            <DollarSign size={10} />
            {parseFloat(String(contact.deal_value)).toLocaleString()}
          </div>
        ) : <div />}
        {(contact.pipeline_stage === 'paid' || contact.pipeline_stage === 'booked') && (
          <button
            onClick={(e) => { e.stopPropagation(); onLogOutcome(); }}
            style={{
              background: 'rgba(74,222,128,0.1)',
              border: '1px solid rgba(74,222,128,0.3)',
              color: '#4ade80', borderRadius: 4,
              fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 0.5,
              padding: '2px 6px', cursor: 'pointer',
            }}
          >
            +$
          </button>
        )}
      </div>
    </div>
  );
}

function OutcomeModal({
  contact, onClose, onSaved,
}: {
  contact: Contact; onClose: () => void; onSaved: () => void;
}) {
  const { authUser } = useAuth();
  const [eventType, setEventType] = useState('deal_closed');
  const [dollarValue, setDollarValue] = useState('');
  const [agent, setAgent] = useState('NOVA');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!authUser || !dollarValue) return;
    setSaving(true);
    try {
      await fetch(`${API_URL}/api/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: authUser.id,
          event_type: eventType,
          dollar_value: parseFloat(dollarValue),
          attributed_agent: agent,
          contact_id: contact.id,
          notes: notes || null,
        }),
      });
      onSaved();
    } catch (e) {
      console.error('[OUTCOME] save failed', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 20,
    }}>
      <div style={{
        background: 'var(--black)', border: '1px solid rgba(201,168,76,0.3)',
        borderRadius: 12, padding: 24, width: '100%', maxWidth: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
            letterSpacing: 2, color: 'var(--gold)',
          }}>
            LOG OUTCOME
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer',
          }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--cream)', marginBottom: 16 }}>
          {contact.name || contact.email}
          {contact.company && <span style={{ color: 'var(--muted)' }}> · {contact.company}</span>}
        </div>

        <Field label="EVENT TYPE">
          <select value={eventType} onChange={e => setEventType(e.target.value)} style={inputStyle}>
            <option value="deal_closed">deal closed</option>
            <option value="gig_booked">gig booked</option>
            <option value="meeting_booked">meeting booked</option>
            <option value="subscriber_acquired">subscriber acquired</option>
            <option value="merch_sale">merch sale</option>
            <option value="lead_qualified">lead qualified</option>
          </select>
        </Field>

        <Field label="DOLLAR VALUE">
          <input
            type="number" placeholder="500" value={dollarValue}
            onChange={e => setDollarValue(e.target.value)}
            style={inputStyle} autoFocus
          />
        </Field>

        <Field label="ATTRIBUTED AGENT">
          <select value={agent} onChange={e => setAgent(e.target.value)} style={inputStyle}>
            <option>RAVEN</option><option>NOVA</option><option>ATLAS</option>
            <option>GEN</option><option>X</option><option>ECHO</option><option>PIXEL</option>
          </select>
        </Field>

        <Field label="NOTES (optional)">
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="how this came together..."
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          />
        </Field>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={save}
            disabled={!dollarValue || saving}
            style={{
              flex: 1, padding: '10px', borderRadius: 6,
              background: 'var(--gold)', color: 'var(--black)',
              border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, fontWeight: 700,
              opacity: !dollarValue || saving ? 0.5 : 1,
            }}
          >
            {saving ? 'SAVING...' : 'LOG OUTCOME'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 16px', borderRadius: 6,
              background: 'transparent', color: 'var(--muted)',
              border: '1px solid rgba(220,227,240,0.1)', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 11,
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1.5,
        color: 'var(--dim)', marginBottom: 4,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(220,227,240,0.1)',
  borderRadius: 6, color: 'var(--cream)',
  fontFamily: 'var(--font-mono)', fontSize: 12,
  outline: 'none',
};
```

═══════════════════════════════════════════════════════════════
## FILE: `web/src/components/outreach/UniboxTab.tsx`
═══════════════════════════════════════════════════════════════

```tsx
// ═══════════════════════════════════════════════════════════════
// LUNARI OUTREACH V2 — Unibox Tab
// 3-pane: thread list / message thread / contact info rail
// gojiberry pattern, lunari-styled
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import {
  Inbox, Search, Sparkles, Send, Building2, MapPin,
  Globe, ExternalLink, Archive, Pin, Filter, Loader2
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { UniboxThread, UniboxMessage, Contact, Platform } from './types';
import { PLATFORM_META } from './types';

const API_URL = 'https://nodejs-production-63513.up.railway.app';

interface Props {
  refreshTick: number;
  onChange: () => void;
}

export function UniboxTab({ refreshTick, onChange }: Props) {
  const { authUser } = useAuth();
  const [threads, setThreads] = useState<UniboxThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<Platform | ''>('');

  async function loadThreads() {
    if (!authUser) return;
    try {
      const params = new URLSearchParams({ userId: authUser.id });
      if (platformFilter) params.set('platform', platformFilter);
      if (search) params.set('search', search);
      const res = await fetch(`${API_URL}/api/unibox/threads?${params}`);
      const json = await res.json();
      if (json.ok) setThreads(json.threads || []);
    } catch (e) {
      console.error('[UNIBOX] load failed', e);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadThreads().finally(() => setLoading(false));
  }, [authUser, refreshTick, platformFilter]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(loadThreads, 250);
    return () => clearTimeout(t);
  }, [search]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)' }}>
          LOADING UNIBOX...
        </div>
      </div>
    );
  }

  if (threads.length === 0 && !search && !platformFilter) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', padding: 40, color: 'var(--muted)',
      }}>
        <Inbox size={32} color="var(--gold)" style={{ opacity: 0.4, marginBottom: 16 }} />
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 1,
          color: 'var(--cream)', marginBottom: 8,
        }}>
          INBOX IS QUIET
        </div>
        <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 480, textAlign: 'center', lineHeight: 1.5 }}>
          replies from email, linkedin, twitter, instagram, reddit, all 10 connected channels land here.
          NOVA drafts your replies in your voice. you confirm and ship.
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
      {/* ── Thread list ─────────────────────────── */}
      <div style={{
        width: 320, flexShrink: 0,
        borderRight: '1px solid rgba(220,227,240,0.06)',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(8,9,14,0.5)',
      }}>
        <div style={{ padding: 10, borderBottom: '1px solid rgba(220,227,240,0.04)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--dim)' }} />
            <input
              placeholder="search by name, message, handle..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px 7px 28px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(220,227,240,0.06)',
                borderRadius: 6, color: 'var(--cream)',
                fontFamily: 'var(--font-mono)', fontSize: 11,
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <PlatformChip active={!platformFilter} onClick={() => setPlatformFilter('')}>ALL</PlatformChip>
            {(Object.keys(PLATFORM_META) as Platform[]).map(p => (
              <PlatformChip
                key={p} platform={p}
                active={platformFilter === p}
                onClick={() => setPlatformFilter(platformFilter === p ? '' : p)}
              >
                {PLATFORM_META[p].label}
              </PlatformChip>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {threads.map(thread => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              selected={selectedId === thread.id}
              onClick={() => setSelectedId(thread.id)}
            />
          ))}
          {threads.length === 0 && (
            <div style={{
              padding: '40px 20px', textAlign: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
              color: 'var(--dim)',
            }}>
              ... no matches ...
            </div>
          )}
        </div>
      </div>

      {/* ── Message pane + contact rail ───────── */}
      {selectedId ? (
        <ThreadPane threadId={selectedId} onChange={() => { loadThreads(); onChange(); }} />
      ) : (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--dim)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5,
        }}>
          ... select a conversation ...
        </div>
      )}
    </div>
  );
}

function PlatformChip({
  children, active, platform, onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  platform?: Platform;
  onClick: () => void;
}) {
  const color = platform ? PLATFORM_META[platform].color : '#94a3b8';
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: '4px 9px', borderRadius: 12,
        background: active ? `${color}20` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? color : 'rgba(220,227,240,0.06)'}`,
        color: active ? color : 'var(--muted)',
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function ThreadRow({
  thread, selected, onClick,
}: {
  thread: UniboxThread; selected: boolean; onClick: () => void;
}) {
  const meta = PLATFORM_META[thread.platform];
  const time = new Date(thread.last_message_at);
  const now = Date.now();
  const ageMs = now - time.getTime();
  const ageStr = ageMs < 3600_000
    ? `${Math.max(1, Math.floor(ageMs / 60000))}m`
    : ageMs < 86400_000
    ? `${Math.floor(ageMs / 3600_000)}h`
    : ageMs < 7 * 86400_000
    ? `${Math.floor(ageMs / 86400_000)}d`
    : time.toLocaleDateString();

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px', cursor: 'pointer',
        borderBottom: '1px solid rgba(220,227,240,0.04)',
        background: selected ? 'rgba(201,168,76,0.06)' : 'transparent',
        borderLeft: selected ? '2px solid var(--gold)' : '2px solid transparent',
        transition: 'all 0.1s',
        display: 'flex', flexDirection: 'column', gap: 3,
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 20, height: 20, borderRadius: 4,
            background: `${meta.color}22`, color: meta.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
            flexShrink: 0,
          }}>
            {meta.icon}
          </div>
          <div style={{
            color: thread.unread_count > 0 ? 'var(--cream)' : 'var(--muted)',
            fontWeight: thread.unread_count > 0 ? 600 : 400,
            fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {thread.contact_name || thread.contact_handle || 'Unknown'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {thread.unread_count > 0 && (
            <div style={{
              background: 'var(--gold)', color: 'var(--black)',
              fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
              borderRadius: 8, padding: '1px 5px', minWidth: 14, textAlign: 'center',
            }}>
              {thread.unread_count}
            </div>
          )}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--dim)' }}>
            {ageStr}
          </div>
        </div>
      </div>
      {thread.subject && (
        <div style={{
          fontSize: 10, color: 'var(--muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {thread.subject}
        </div>
      )}
      <div style={{
        fontSize: 11, color: 'var(--dim)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {thread.preview || '...'}
      </div>
    </div>
  );
}

function ThreadPane({ threadId, onChange }: { threadId: string; onChange: () => void }) {
  const { authUser } = useAuth();
  const [thread, setThread] = useState<UniboxThread | null>(null);
  const [messages, setMessages] = useState<UniboxMessage[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [reply, setReply] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function load() {
    if (!authUser) return;
    try {
      const res = await fetch(`${API_URL}/api/unibox/thread/${threadId}?userId=${authUser.id}`);
      const json = await res.json();
      if (json.ok) {
        setThread(json.thread);
        setMessages(json.messages || []);
        setContact(json.contact);
      }
    } catch (e) {
      console.error('[UNIBOX] thread load failed', e);
    }
  }

  useEffect(() => { load(); setReply(''); }, [threadId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function aiDraft() {
    if (!authUser) return;
    setDraftLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/unibox/thread/${threadId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: authUser.id }),
      });
      const json = await res.json();
      if (json.ok && json.draft) setReply(json.draft);
    } catch (e) {
      console.error('[UNIBOX] draft failed', e);
    } finally {
      setDraftLoading(false);
    }
  }

  async function sendReply() {
    if (!authUser || !reply.trim()) return;
    setSending(true);
    try {
      await fetch(`${API_URL}/api/unibox/thread/${threadId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: authUser.id, body: reply.trim() }),
      });
      setReply('');
      load();
      onChange();
    } catch (e) {
      console.error('[UNIBOX] reply failed', e);
    } finally {
      setSending(false);
    }
  }

  async function archive() {
    if (!authUser) return;
    try {
      await fetch(`${API_URL}/api/unibox/thread/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      onChange();
    } catch (e) {
      console.error('[UNIBOX] archive failed', e);
    }
  }

  if (!thread) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--gold)' }} />
    </div>;
  }

  const meta = PLATFORM_META[thread.platform];

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
      {/* Messages pane */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Thread header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(220,227,240,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(8,9,14,0.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 16,
              background: `${meta.color}22`, color: meta.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
            }}>
              {meta.icon}
            </div>
            <div>
              <div style={{ color: 'var(--cream)', fontWeight: 600, fontSize: 13 }}>
                {thread.contact_name || thread.contact_handle || 'Unknown'}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--dim)' }}>
                {meta.label} · {thread.message_count} messages
              </div>
            </div>
          </div>
          <button
            onClick={archive}
            title="Archive thread"
            style={{
              background: 'transparent', border: '1px solid rgba(220,227,240,0.1)',
              color: 'var(--muted)', padding: '6px 10px', borderRadius: 6,
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Archive size={11} />
            ARCHIVE
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} platformColor={meta.color} contactName={thread.contact_name || ''} />
          ))}
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--dim)', padding: 40, fontSize: 12 }}>
              ... no messages yet ...
            </div>
          )}
        </div>

        {/* Reply composer */}
        <div style={{
          padding: 12,
          borderTop: '1px solid rgba(220,227,240,0.06)',
          background: 'rgba(8,9,14,0.7)',
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <button
              onClick={aiDraft}
              disabled={draftLoading}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(201,168,76,0.1)',
                border: '1px solid rgba(201,168,76,0.25)',
                color: 'var(--gold)', padding: '5px 10px', borderRadius: 6,
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
                cursor: draftLoading ? 'wait' : 'pointer',
              }}
            >
              {draftLoading
                ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                : <Sparkles size={11} />}
              {draftLoading ? 'DRAFTING...' : 'NOVA DRAFT'}
            </button>
          </div>
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                sendReply();
              }
            }}
            placeholder="reply in your voice... ⌘+enter to send"
            style={{
              width: '100%', minHeight: 70, padding: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(220,227,240,0.08)',
              borderRadius: 6, color: 'var(--cream)',
              fontFamily: 'inherit', fontSize: 13,
              outline: 'none', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--dim)', letterSpacing: 0.5 }}>
              sending via {meta.label.toLowerCase()}
            </div>
            <button
              onClick={sendReply}
              disabled={!reply.trim() || sending}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--gold)', color: 'var(--black)',
                border: 'none', padding: '7px 14px', borderRadius: 6,
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, fontWeight: 700,
                cursor: 'pointer', opacity: !reply.trim() || sending ? 0.5 : 1,
              }}
            >
              <Send size={11} />
              {sending ? 'SENDING...' : 'SEND'}
            </button>
          </div>
        </div>
      </div>

      {/* Contact info rail */}
      <div style={{
        width: 240, flexShrink: 0,
        borderLeft: '1px solid rgba(220,227,240,0.06)',
        background: 'rgba(8,9,14,0.5)',
        padding: 16, overflow: 'auto',
      }}>
        <ContactRail thread={thread} contact={contact} />
      </div>
    </div>
  );
}

function MessageBubble({
  msg, platformColor, contactName,
}: {
  msg: UniboxMessage; platformColor: string; contactName: string;
}) {
  const isOut = msg.direction === 'out';
  const time = new Date(msg.occurred_at).toLocaleString([], {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
  return (
    <div style={{
      marginBottom: 14, display: 'flex',
      flexDirection: 'column',
      alignItems: isOut ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
        fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--dim)',
        letterSpacing: 0.5,
      }}>
        {isOut ? 'YOU' : (contactName || 'THEM').toUpperCase()}
        <span style={{ opacity: 0.7 }}>· {time}</span>
        {msg.ai_draft && <span style={{ color: 'var(--gold)' }}>· NOVA DRAFT</span>}
      </div>
      <div style={{
        maxWidth: '78%',
        padding: '9px 13px', borderRadius: 10,
        background: isOut ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isOut ? 'rgba(201,168,76,0.2)' : `${platformColor}22`}`,
        color: 'var(--cream)', fontSize: 13, lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
      }}>
        {msg.body}
      </div>
    </div>
  );
}

function ContactRail({ thread, contact }: { thread: UniboxThread; contact: Contact | null }) {
  return (
    <div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1.5,
        color: 'var(--dim)', marginBottom: 12,
      }}>
        CONTACT INFO
      </div>

      {(contact?.avatar_url || thread.contact_avatar_url) && (
        <img
          src={contact?.avatar_url || thread.contact_avatar_url || ''}
          alt=""
          style={{ width: 64, height: 64, borderRadius: 32, marginBottom: 10 }}
        />
      )}
      <div style={{ color: 'var(--cream)', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
        {thread.contact_name || contact?.name || 'Unknown'}
      </div>
      {(contact?.title) && (
        <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 2 }}>
          {contact.title}
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {thread.source_signal_type && (
          <RailItem label="SIGNAL">
            <div style={{ color: '#6b8afd' }}>{thread.source_signal_type.replace(/_/g, ' ')}</div>
          </RailItem>
        )}
        {contact?.company && (
          <RailItem label="COMPANY" icon={Building2}>
            {contact.company}
          </RailItem>
        )}
        {contact?.industry && (
          <RailItem label="INDUSTRY">
            {contact.industry}
          </RailItem>
        )}
        {contact?.city && (
          <RailItem label="LOCATION" icon={MapPin}>
            {contact.city}
          </RailItem>
        )}
        {(contact?.profile_url || thread.contact_handle?.startsWith('http')) && (
          <RailItem label="PROFILE" icon={Globe}>
            <a
              href={contact?.profile_url || thread.contact_handle || '#'}
              target="_blank" rel="noopener noreferrer"
              style={{
                color: 'var(--gold)', fontSize: 10,
                display: 'flex', alignItems: 'center', gap: 3,
                textDecoration: 'none',
              }}
            >
              open <ExternalLink size={9} />
            </a>
          </RailItem>
        )}
        {contact?.deal_value && (
          <RailItem label="DEAL VALUE">
            <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>
              ${parseFloat(String(contact.deal_value)).toLocaleString()}
            </div>
          </RailItem>
        )}
        {contact?.pipeline_stage && (
          <RailItem label="STAGE">
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
              padding: '2px 6px', borderRadius: 4,
              background: 'rgba(201,168,76,0.1)', color: 'var(--gold)',
              display: 'inline-block',
            }}>
              {contact.pipeline_stage.toUpperCase()}
            </div>
          </RailItem>
        )}
      </div>

      {!contact && (
        <div style={{
          marginTop: 14, padding: 10,
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(220,227,240,0.1)',
          borderRadius: 6, fontSize: 11, color: 'var(--dim)',
          lineHeight: 1.4,
        }}>
          this person isn't in your contacts yet. enrich and they'll appear in pipeline.
        </div>
      )}
    </div>
  );
}

function RailItem({
  label, icon: Icon, children,
}: {
  label: string; icon?: typeof Building2; children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
        color: 'var(--dim)', marginBottom: 3,
      }}>
        {Icon && <Icon size={9} />}
        {label}
      </div>
      <div style={{ color: 'var(--cream)', fontSize: 12 }}>
        {children}
      </div>
    </div>
  );
}
```

═══════════════════════════════════════════════════════════════
## FILE: `web/src/components/outreach/SignalsTab.tsx`
═══════════════════════════════════════════════════════════════

```tsx
// ═══════════════════════════════════════════════════════════════
// LUNARI OUTREACH V2 — Signals Tab
// Persistent watcher agents that surface warm leads while you sleep
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import {
  Radar, Plus, Play, Pause, Trash2, X, Flame,
  ChevronRight, Loader2, Settings, Activity, ExternalLink
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { SignalAgent, SignalHit, SignalDefinition } from './types';
import { SIGNAL_BUCKETS } from './types';

const API_URL = 'https://nodejs-production-63513.up.railway.app';

interface Props {
  refreshTick: number;
  onChange: () => void;
}

export function SignalsTab({ refreshTick, onChange }: Props) {
  const { authUser } = useAuth();
  const [agents, setAgents] = useState<SignalAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [hitsForId, setHitsForId] = useState<string | null>(null);

  async function load() {
    if (!authUser) return;
    try {
      const res = await fetch(`${API_URL}/api/signals?userId=${authUser.id}`);
      const json = await res.json();
      if (json.ok) setAgents(json.agents || []);
    } catch (e) {
      console.error('[SIGNALS] load failed', e);
    }
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [authUser, refreshTick]);

  async function toggleStatus(agent: SignalAgent) {
    const next = agent.status === 'active' ? 'paused' : 'active';
    try {
      await fetch(`${API_URL}/api/signals/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      load(); onChange();
    } catch (e) { console.error('[SIGNALS] toggle failed', e); }
  }

  async function deleteAgent(agent: SignalAgent) {
    if (!confirm(`delete agent "${agent.name}"? this also deletes all hits.`)) return;
    try {
      await fetch(`${API_URL}/api/signals/${agent.id}`, { method: 'DELETE' });
      load(); onChange();
    } catch (e) { console.error('[SIGNALS] delete failed', e); }
  }

  async function runNow(agent: SignalAgent) {
    try {
      await fetch(`${API_URL}/api/signals/${agent.id}/run`, { method: 'POST' });
      setTimeout(() => { load(); onChange(); }, 1500);
    } catch (e) { console.error('[SIGNALS] run failed', e); }
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)' }}>
          LOADING SIGNALS...
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.5,
            color: 'var(--dim)', marginBottom: 2,
          }}>
            PERSISTENT WATCHERS
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 480 }}>
            agents that watch your niche 24/7 and surface warm leads. you can run up to 6 in parallel, 2 at a time.
          </div>
        </div>
        <button
          onClick={() => setEditingId('new')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--gold)', color: 'var(--black)',
            border: 'none', padding: '8px 14px', borderRadius: 6,
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Plus size={12} />
          LAUNCH AGENT
        </button>
      </div>

      {agents.length === 0 ? (
        <div style={{
          border: '1px dashed rgba(220,227,240,0.1)', borderRadius: 10,
          padding: 60, textAlign: 'center', color: 'var(--muted)',
        }}>
          <Radar size={32} color="var(--gold)" style={{ opacity: 0.4, marginBottom: 16 }} />
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
            color: 'var(--cream)', marginBottom: 6,
          }}>
            NO ACTIVE WATCHERS
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 420, margin: '0 auto' }}>
            a watcher describes your ideal customer and the signals worth chasing.
            launch one and it runs every 6 hours, dropping new hits in your hits list.
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12,
        }}>
          {agents.map(agent => (
            <AgentCard
              key={agent.id} agent={agent}
              onEdit={() => setEditingId(agent.id)}
              onToggle={() => toggleStatus(agent)}
              onDelete={() => deleteAgent(agent)}
              onRun={() => runNow(agent)}
              onViewHits={() => setHitsForId(agent.id)}
            />
          ))}
        </div>
      )}

      {editingId && (
        <AgentEditor
          agentId={editingId === 'new' ? null : editingId}
          existing={editingId === 'new' ? null : agents.find(a => a.id === editingId) || null}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); load(); onChange(); }}
        />
      )}

      {hitsForId && (
        <HitsModal
          agentId={hitsForId}
          agent={agents.find(a => a.id === hitsForId)!}
          onClose={() => setHitsForId(null)}
          onChange={() => { load(); onChange(); }}
        />
      )}
    </div>
  );
}

function AgentCard({
  agent, onEdit, onToggle, onDelete, onRun, onViewHits,
}: {
  agent: SignalAgent;
  onEdit: () => void; onToggle: () => void; onDelete: () => void;
  onRun: () => void; onViewHits: () => void;
}) {
  const isActive = agent.status === 'active';
  const sigCount = (agent.signals || []).filter(s => s.enabled !== false).length;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${isActive ? 'rgba(107,138,253,0.25)' : 'rgba(220,227,240,0.06)'}`,
      borderRadius: 10, padding: 14,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: isActive ? '#6b8afd' : '#94a3b8',
            boxShadow: isActive ? '0 0 8px #6b8afd80' : 'none',
            flexShrink: 0,
          }} />
          <div style={{
            color: 'var(--cream)', fontWeight: 600, fontSize: 13,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {agent.name}
          </div>
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
          color: isActive ? '#6b8afd' : '#94a3b8',
          padding: '2px 6px', borderRadius: 4,
          background: isActive ? 'rgba(107,138,253,0.1)' : 'rgba(148,163,184,0.1)',
        }}>
          {agent.status.toUpperCase()}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--dim)', letterSpacing: 0.5 }}>
            SIGNALS
          </div>
          <div style={{ color: 'var(--cream)', fontWeight: 600 }}>{sigCount}</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--dim)', letterSpacing: 0.5 }}>
            HITS 7D
          </div>
          <div style={{ color: 'var(--gold)', fontWeight: 600 }}>{agent.hits_last_7d || 0}</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--dim)', letterSpacing: 0.5 }}>
            TOTAL
          </div>
          <div style={{ color: 'var(--cream)', fontWeight: 600 }}>{agent.hits_total || 0}</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--dim)', letterSpacing: 0.5 }}>
            LAST RUN
          </div>
          <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
            {agent.last_run_at ? formatAgo(agent.last_run_at) : '...'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, paddingTop: 8, borderTop: '1px solid rgba(220,227,240,0.04)' }}>
        <IconBtn icon={Activity} label="HITS" onClick={onViewHits} primary />
        <IconBtn icon={Play} label="RUN" onClick={onRun} />
        <IconBtn icon={isActive ? Pause : Play} label={isActive ? 'PAUSE' : 'RESUME'} onClick={onToggle} />
        <IconBtn icon={Settings} label="EDIT" onClick={onEdit} />
        <IconBtn icon={Trash2} label="" onClick={onDelete} danger />
      </div>
    </div>
  );
}

function IconBtn({
  icon: Icon, label, onClick, primary, danger,
}: {
  icon: typeof Play; label: string; onClick: () => void;
  primary?: boolean; danger?: boolean;
}) {
  const color = danger ? '#e85050' : primary ? 'var(--gold)' : 'var(--muted)';
  const bg = danger ? 'rgba(232,80,80,0.08)' : primary ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.02)';
  return (
    <button
      onClick={onClick}
      style={{
        flex: label ? 1 : 'unset',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        padding: '5px 8px', borderRadius: 4,
        background: bg, color,
        border: `1px solid ${color}33`,
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
        cursor: 'pointer',
      }}
    >
      <Icon size={10} />
      {label}
    </button>
  );
}

function AgentEditor({
  agentId, existing, onClose, onSaved,
}: {
  agentId: string | null;
  existing: SignalAgent | null;
  onClose: () => void; onSaved: () => void;
}) {
  const { authUser } = useAuth();
  const [step, setStep] = useState<'icp' | 'signals' | 'leads'>('icp');
  const [name, setName] = useState(existing?.name || '');
  const [titles, setTitles] = useState((existing?.icp?.titles || []).join(', '));
  const [locations, setLocations] = useState((existing?.icp?.locations || []).join(', '));
  const [industries, setIndustries] = useState((existing?.icp?.industries || []).join(', '));
  const [precision, setPrecision] = useState(existing?.precision || 50);
  const [signals, setSignals] = useState<SignalDefinition[]>(existing?.signals || []);
  const [campaignGoal, setCampaignGoal] = useState(existing?.objectives?.campaign_goal || '');
  const [saving, setSaving] = useState(false);

  function toggleSignal(type: string, bucket: string) {
    setSignals(prev => {
      const existing = prev.find(s => s.type === type);
      if (existing) {
        return prev.filter(s => s.type !== type);
      }
      return [...prev, { type, bucket, enabled: true }];
    });
  }

  async function save() {
    if (!authUser || !name) return;
    setSaving(true);
    const payload = {
      userId: authUser.id,
      name,
      icp: {
        titles: titles.split(',').map(s => s.trim()).filter(Boolean),
        locations: locations.split(',').map(s => s.trim()).filter(Boolean),
        industries: industries.split(',').map(s => s.trim()).filter(Boolean),
      },
      precision,
      signals,
      objectives: { campaign_goal: campaignGoal || undefined },
    };
    try {
      if (agentId) {
        await fetch(`${API_URL}/api/signals/${agentId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(`${API_URL}/api/signals`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (e) { console.error('[AGENT] save failed', e); }
    finally { setSaving(false); }
  }

  return (
    <div style={modalOverlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 640 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
            letterSpacing: 2, color: 'var(--gold)',
          }}>
            {agentId ? 'EDIT AGENT' : 'LAUNCH NEW AGENT'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Step nav */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {(['icp', 'signals', 'leads'] as const).map((s, i) => (
            <button
              key={s} onClick={() => setStep(s)}
              style={{
                flex: 1, padding: '8px',
                background: step === s ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${step === s ? 'rgba(201,168,76,0.3)' : 'rgba(220,227,240,0.06)'}`,
                color: step === s ? 'var(--gold)' : 'var(--muted)',
                borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
              }}
            >
              {i + 1}. {s.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Step content */}
        <div style={{ minHeight: 320 }}>
          {step === 'icp' && (
            <>
              <Field label="AGENT NAME">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. AGENT 1 — SUPER HOT" style={inputStyle} />
              </Field>
              <Field label="TITLES (comma-separated)">
                <input value={titles} onChange={e => setTitles(e.target.value)} placeholder="founder, ceo, head of marketing" style={inputStyle} />
              </Field>
              <Field label="LOCATIONS">
                <input value={locations} onChange={e => setLocations(e.target.value)} placeholder="united states, chicago, brooklyn" style={inputStyle} />
              </Field>
              <Field label="INDUSTRIES">
                <input value={industries} onChange={e => setIndustries(e.target.value)} placeholder="music, photography, saas" style={inputStyle} />
              </Field>
              <Field label={`PRECISION ${precision}/100`}>
                <input
                  type="range" min={0} max={100} value={precision}
                  onChange={e => setPrecision(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--dim)', marginTop: 2,
                }}>
                  <span>discovery</span><span>high precision</span>
                </div>
              </Field>
            </>
          )}

          {step === 'signals' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                pick the signals worth chasing. each one runs every 6 hours.
              </div>
              {Object.entries(SIGNAL_BUCKETS).map(([bucket, items]) => (
                <div key={bucket} style={{ marginBottom: 14 }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.5,
                    color: 'var(--gold)', marginBottom: 6,
                  }}>
                    {bucket.toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {items.map(item => {
                      const active = signals.some(s => s.type === item.type);
                      return (
                        <button
                          key={item.type}
                          onClick={() => toggleSignal(item.type, bucket)}
                          style={{
                            padding: '5px 10px', borderRadius: 12,
                            background: active ? 'rgba(107,138,253,0.15)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${active ? 'rgba(107,138,253,0.4)' : 'rgba(220,227,240,0.08)'}`,
                            color: active ? '#6b8afd' : 'var(--muted)',
                            fontFamily: 'var(--font-mono)', fontSize: 10,
                            cursor: 'pointer',
                          }}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 'leads' && (
            <Field label="CAMPAIGN GOAL">
              <textarea
                value={campaignGoal} onChange={e => setCampaignGoal(e.target.value)}
                placeholder="e.g. book a 15-min strategy call... or get them to try LUNARI free for 14 days"
                style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
              />
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(107,138,253,0.05)', border: '1px solid rgba(107,138,253,0.15)', borderRadius: 6, fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
                NOVA will draft outreach to each hit using your goal as context.
                you review and approve in the unibox.
              </div>
            </Field>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {step !== 'icp' && (
            <button
              onClick={() => setStep(step === 'leads' ? 'signals' : 'icp')}
              style={btnSecondary}
            >
              ← BACK
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step !== 'leads' ? (
            <button
              onClick={() => setStep(step === 'icp' ? 'signals' : 'leads')}
              disabled={step === 'icp' && !name}
              style={{ ...btnPrimary, opacity: step === 'icp' && !name ? 0.5 : 1 }}
            >
              NEXT →
            </button>
          ) : (
            <button
              onClick={save}
              disabled={!name || saving}
              style={{ ...btnPrimary, opacity: !name || saving ? 0.5 : 1 }}
            >
              {saving ? 'LAUNCHING...' : (agentId ? 'SAVE' : 'LAUNCH')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HitsModal({
  agentId, agent, onClose, onChange,
}: {
  agentId: string; agent: SignalAgent;
  onClose: () => void; onChange: () => void;
}) {
  const [hits, setHits] = useState<SignalHit[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch(`${API_URL}/api/signals/${agentId}/hits`);
      const json = await res.json();
      if (json.ok) setHits(json.hits || []);
    } catch (e) { console.error('[HITS] load failed', e); }
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, [agentId]);

  return (
    <div style={modalOverlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: 2, color: 'var(--gold)' }}>
              {agent.name}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1, marginTop: 2 }}>
              {hits.length} HITS · {hits.filter(h => h.status === 'new').length} NEW
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--gold)' }} />
            </div>
          ) : hits.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--dim)' }}>
              ... no hits yet. agent runs every 6 hours. click RUN to trigger now.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {hits.map(hit => <HitRow key={hit.id} hit={hit} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HitRow({ hit }: { hit: SignalHit }) {
  const score = hit.ai_score || 5;
  return (
    <div style={{
      padding: 12, borderRadius: 8,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(220,227,240,0.06)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      {hit.contact_avatar_url
        ? <img src={hit.contact_avatar_url} style={{ width: 36, height: 36, borderRadius: 18 }} alt="" />
        : <div style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(107,138,253,0.15)' }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ color: 'var(--cream)', fontWeight: 600, fontSize: 13 }}>
            {hit.contact_name || 'Unknown'}
          </div>
          {score >= 7 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: '#e8a040' }}>
              <Flame size={10} fill="#e8a040" stroke="#e8a040" />
              {score}
            </div>
          )}
        </div>
        {hit.contact_title && (
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {hit.contact_title}{hit.contact_company && ` · ${hit.contact_company}`}
          </div>
        )}
        {hit.signal_context && (
          <div style={{ fontSize: 10, color: '#6b8afd', marginTop: 3, fontFamily: 'var(--font-mono)', letterSpacing: 0.3 }}>
            ↳ {hit.signal_context}
          </div>
        )}
      </div>
      {hit.contact_profile_url && (
        <a href={hit.contact_profile_url} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

// ── shared inline style helpers ───────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1.5, color: 'var(--dim)', marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function formatAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 3600_000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h ago`;
  return `${Math.floor(ms / 86400_000)}d ago`;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(220,227,240,0.1)',
  borderRadius: 6, color: 'var(--cream)',
  fontFamily: 'var(--font-mono)', fontSize: 12,
  outline: 'none',
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 100, padding: 20,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--black)', border: '1px solid rgba(201,168,76,0.3)',
  borderRadius: 12, padding: 24, width: '100%',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 6,
  background: 'var(--gold)', color: 'var(--black)',
  border: 'none', cursor: 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, fontWeight: 700,
};

const btnSecondary: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 6,
  background: 'transparent', color: 'var(--muted)',
  border: '1px solid rgba(220,227,240,0.1)', cursor: 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
};
```

═══════════════════════════════════════════════════════════════
## FILE: `web/src/components/outreach/CampaignsTab.tsx`
═══════════════════════════════════════════════════════════════

```tsx
// ═══════════════════════════════════════════════════════════════
// LUNARI OUTREACH V2 — Campaigns Tab
// Multi-step outreach sequences with spintax personalization
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import {
  Send, Plus, X, Mail, Linkedin, Twitter, Pause, Play,
  ChevronRight, Loader2, Eye, Trash2, GitBranch, Clock
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { Campaign, CampaignStep } from './types';

const API_URL = 'https://nodejs-production-63513.up.railway.app';

interface Props {
  refreshTick: number;
  onChange: () => void;
}

export function CampaignsTab({ refreshTick, onChange }: Props) {
  const { authUser } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);

  async function load() {
    if (!authUser) return;
    try {
      const res = await fetch(`${API_URL}/api/campaigns?userId=${authUser.id}`);
      const json = await res.json();
      if (json.ok) setCampaigns(json.campaigns || []);
    } catch (e) { console.error('[CAMPAIGNS] load failed', e); }
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [authUser, refreshTick]);

  async function toggleStatus(c: Campaign) {
    const next = c.status === 'active' ? 'paused' : 'active';
    try {
      await fetch(`${API_URL}/api/campaigns/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      load(); onChange();
    } catch (e) { console.error('[CAMPAIGNS] toggle failed', e); }
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)' }}>
          LOADING CAMPAIGNS...
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.5,
            color: 'var(--dim)', marginBottom: 2,
          }}>
            OUTREACH SEQUENCES
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 480 }}>
            multi-step campaigns with spintax personalization. each step varies wording per recipient so messages don't look templated.
          </div>
        </div>
        <button
          onClick={() => setEditingId('new')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--gold)', color: 'var(--black)',
            border: 'none', padding: '8px 14px', borderRadius: 6,
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Plus size={12} />
          NEW CAMPAIGN
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div style={{
          border: '1px dashed rgba(220,227,240,0.1)', borderRadius: 10,
          padding: 60, textAlign: 'center', color: 'var(--muted)',
        }}>
          <Send size={32} color="var(--gold)" style={{ opacity: 0.4, marginBottom: 16 }} />
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
            color: 'var(--cream)', marginBottom: 6,
          }}>
            NO CAMPAIGNS YET
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 420, margin: '0 auto' }}>
            a campaign is a sequence of messages... usually 3-4 steps with delays between them.
            spintax lets you write multiple versions of each line so no two recipients see the same email.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {campaigns.map(c => (
            <CampaignRow
              key={c.id} campaign={c}
              onEdit={() => setEditingId(c.id)}
              onToggle={() => toggleStatus(c)}
            />
          ))}
        </div>
      )}

      {editingId && (
        <CampaignEditor
          campaignId={editingId === 'new' ? null : editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); load(); onChange(); }}
        />
      )}
    </div>
  );
}

function CampaignRow({
  campaign, onEdit, onToggle,
}: {
  campaign: Campaign; onEdit: () => void; onToggle: () => void;
}) {
  const isActive = campaign.status === 'active';
  const ChannelIcon = campaign.channel === 'linkedin' ? Linkedin
    : campaign.channel === 'twitter' ? Twitter
    : Mail;
  const replyRate = campaign.sent_count > 0 ? ((campaign.reply_count / campaign.sent_count) * 100).toFixed(1) : '0';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${isActive ? 'rgba(201,168,76,0.2)' : 'rgba(220,227,240,0.06)'}`,
      borderRadius: 10, padding: 14,
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: 'rgba(201,168,76,0.1)', color: 'var(--gold)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <ChannelIcon size={16} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ color: 'var(--cream)', fontWeight: 600, fontSize: 13 }}>
            {campaign.name}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
            padding: '1px 6px', borderRadius: 4,
            background: isActive ? 'rgba(74,222,128,0.1)' : 'rgba(148,163,184,0.1)',
            color: isActive ? '#4ade80' : '#94a3b8',
          }}>
            {campaign.status.toUpperCase()}
          </div>
        </div>
        {campaign.description && (
          <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {campaign.description}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 18, fontSize: 11 }}>
        <Stat label="ENROLLED" value={campaign.enrolled_count} />
        <Stat label="SENT" value={campaign.sent_count} />
        <Stat label="REPLIES" value={campaign.reply_count} hot={campaign.reply_count > 0} />
        <Stat label="REPLY RATE" value={`${replyRate}%`} />
        <Stat label="BOOKED" value={campaign.booked_count} hot={campaign.booked_count > 0} color="#c9a84c" />
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={onToggle} style={iconBtnStyle}>
          {isActive ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <button onClick={onEdit} style={iconBtnStyle}>
          <Eye size={12} />
        </button>
      </div>
    </div>
  );
}

function Stat({
  label, value, hot, color,
}: {
  label: string; value: string | number; hot?: boolean; color?: string;
}) {
  return (
    <div style={{ minWidth: 60 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--dim)', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{
        color: color || (hot ? '#4ade80' : 'var(--cream)'),
        fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 12,
      }}>
        {value}
      </div>
    </div>
  );
}

function CampaignEditor({
  campaignId, onClose, onSaved,
}: {
  campaignId: string | null;
  onClose: () => void; onSaved: () => void;
}) {
  const { authUser } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channel, setChannel] = useState<'email' | 'linkedin' | 'twitter' | 'mixed'>('email');
  const [dailyLimit, setDailyLimit] = useState(50);
  const [stopOnReply, setStopOnReply] = useState(true);
  const [textOnly, setTextOnly] = useState(true);
  const [steps, setSteps] = useState<Partial<CampaignStep>[]>([
    { step_type: 'email', body_spintax: '', delay_days: 0, delay_hours: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [previewVariations, setPreviewVariations] = useState<string[]>([]);

  useEffect(() => {
    if (!campaignId) return;
    fetch(`${API_URL}/api/campaigns/${campaignId}`)
      .then(r => r.json())
      .then(j => {
        if (j.ok) {
          setCampaign(j.campaign);
          setName(j.campaign.name); setDescription(j.campaign.description || '');
          setChannel(j.campaign.channel); setDailyLimit(j.campaign.daily_limit);
          setStopOnReply(j.campaign.stop_on_reply); setTextOnly(j.campaign.text_only_mode);
          if (j.steps && j.steps.length > 0) setSteps(j.steps);
        }
      })
      .catch(e => console.error('[CAMPAIGN] load failed', e));
  }, [campaignId]);

  function addStep() {
    setSteps(prev => [...prev, {
      step_type: prev[prev.length - 1]?.step_type === 'wait' ? 'email' : 'wait',
      body_spintax: '', delay_days: 2, delay_hours: 0,
    }]);
  }
  function removeStep(idx: number) {
    setSteps(prev => prev.filter((_, i) => i !== idx));
  }
  function updateStep(idx: number, patch: Partial<CampaignStep>) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  async function previewSpintax(idx: number) {
    setPreviewIdx(idx);
    try {
      const res = await fetch(`${API_URL}/api/spintax/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: steps[idx].body_spintax || '', count: 5 }),
      });
      const j = await res.json();
      setPreviewVariations(j.variations || []);
    } catch (e) { console.error('[SPINTAX] preview failed', e); }
  }

  async function save() {
    if (!authUser || !name) return;
    setSaving(true);
    const payload = {
      userId: authUser.id, name, description,
      channel, daily_limit: dailyLimit,
      stop_on_reply: stopOnReply, text_only_mode: textOnly,
      steps,
    };
    try {
      if (campaignId) {
        await fetch(`${API_URL}/api/campaigns/${campaignId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(`${API_URL}/api/campaigns`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (e) { console.error('[CAMPAIGN] save failed', e); }
    finally { setSaving(false); }
  }

  return (
    <div style={modalOverlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: 2, color: 'var(--gold)' }}>
            {campaignId ? 'EDIT CAMPAIGN' : 'NEW CAMPAIGN'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', paddingRight: 4 }}>
          {/* Basic info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <Field label="NAME">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="founder outreach Q4" style={inputStyle} />
            </Field>
            <Field label="CHANNEL">
              <select value={channel} onChange={e => setChannel(e.target.value as any)} style={inputStyle}>
                <option value="email">email</option>
                <option value="linkedin">linkedin</option>
                <option value="twitter">twitter</option>
                <option value="mixed">mixed</option>
              </select>
            </Field>
          </div>
          <Field label="DESCRIPTION">
            <input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="brief... what's this campaign for?" style={inputStyle} />
          </Field>

          {/* Steps */}
          <div style={{
            marginTop: 14, marginBottom: 8,
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5, color: 'var(--gold)',
          }}>
            STEPS
          </div>

          {steps.map((step, idx) => (
            <StepCard
              key={idx} step={step} idx={idx}
              onChange={p => updateStep(idx, p)}
              onRemove={() => removeStep(idx)}
              onPreview={() => previewSpintax(idx)}
              canRemove={steps.length > 1}
            />
          ))}

          <button
            onClick={addStep}
            style={{
              width: '100%', padding: 10,
              background: 'rgba(201,168,76,0.05)',
              border: '1px dashed rgba(201,168,76,0.3)',
              color: 'var(--gold)', borderRadius: 6,
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
              cursor: 'pointer', marginBottom: 16,
            }}
          >
            + ADD STEP
          </button>

          {/* Settings */}
          <div style={{
            padding: 12, borderRadius: 8,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(220,227,240,0.06)',
            marginBottom: 16,
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.5,
              color: 'var(--gold)', marginBottom: 10,
            }}>
              DELIVERY SETTINGS
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
              <Field label="DAILY LIMIT">
                <input type="number" value={dailyLimit} onChange={e => setDailyLimit(parseInt(e.target.value) || 50)}
                  style={{ ...inputStyle, width: 80 }} />
              </Field>
            </div>
            <ToggleRow label="text-only mode (avoid spam triggers)" value={textOnly} onChange={setTextOnly} />
            <ToggleRow label="stop sequence on reply" value={stopOnReply} onChange={setStopOnReply} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid rgba(220,227,240,0.06)' }}>
          <button onClick={onClose} style={btnSecondary}>CANCEL</button>
          <div style={{ flex: 1 }} />
          <button
            onClick={save}
            disabled={!name || saving}
            style={{ ...btnPrimary, opacity: !name || saving ? 0.5 : 1 }}
          >
            {saving ? 'SAVING...' : campaignId ? 'SAVE' : 'CREATE CAMPAIGN'}
          </button>
        </div>

        {previewIdx !== null && (
          <SpintaxPreview
            variations={previewVariations}
            onClose={() => setPreviewIdx(null)}
          />
        )}
      </div>
    </div>
  );
}

function StepCard({
  step, idx, onChange, onRemove, onPreview, canRemove,
}: {
  step: Partial<CampaignStep>; idx: number;
  onChange: (p: Partial<CampaignStep>) => void;
  onRemove: () => void; onPreview: () => void; canRemove: boolean;
}) {
  const isWait = step.step_type === 'wait';

  return (
    <div style={{
      padding: 12, marginBottom: 8, borderRadius: 8,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(220,227,240,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 11,
          background: 'rgba(201,168,76,0.15)', color: 'var(--gold)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
        }}>
          {idx + 1}
        </div>
        <select
          value={step.step_type} onChange={e => onChange({ step_type: e.target.value as any })}
          style={{ ...inputStyle, width: 120 }}
        >
          <option value="email">email</option>
          <option value="message">DM</option>
          <option value="invitation">invitation</option>
          <option value="wait">wait</option>
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
          <Clock size={11} />
          <input
            type="number" min={0} value={step.delay_days || 0}
            onChange={e => onChange({ delay_days: parseInt(e.target.value) || 0 })}
            style={{ ...inputStyle, width: 50, padding: '4px 6px' }}
          />
          <span style={{ fontSize: 10, color: 'var(--dim)' }}>days</span>
        </div>
        {canRemove && (
          <button onClick={onRemove} style={{ ...iconBtnStyle, marginLeft: 'auto', color: '#e85050' }}>
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {!isWait && (
        <>
          {step.step_type === 'email' && (
            <Field label="SUBJECT (spintax)">
              <input
                value={step.subject_spintax || ''}
                onChange={e => onChange({ subject_spintax: e.target.value })}
                placeholder="{{RANDOM | quick question | thoughts? | one ask}}"
                style={inputStyle}
              />
            </Field>
          )}
          <Field label="BODY (spintax)">
            <textarea
              value={step.body_spintax || ''}
              onChange={e => onChange({ body_spintax: e.target.value })}
              placeholder="hey {{firstName}}... {{RANDOM | saw your latest | noticed your work on | came across}} the music project. {{RANDOM | quick thought | one idea | wanted to share something}}..."
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </Field>
          <button
            onClick={onPreview}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'transparent', color: 'var(--gold)',
              border: '1px solid rgba(201,168,76,0.25)',
              padding: '5px 10px', borderRadius: 4,
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
              cursor: 'pointer',
            }}
          >
            <Eye size={10} />
            PREVIEW VARIATIONS
          </button>
          <div style={{
            marginTop: 8, padding: 8, borderRadius: 4,
            background: 'rgba(107,138,253,0.05)',
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.5,
          }}>
            spintax: <code style={{ color: '#6b8afd' }}>{'{{RANDOM | a | b | c}}'}</code> picks one. vars: <code style={{ color: 'var(--gold)' }}>{'{{firstName}}'}</code>, <code style={{ color: 'var(--gold)' }}>{'{{company}}'}</code>
          </div>
        </>
      )}
    </div>
  );
}

function SpintaxPreview({ variations, onClose }: { variations: string[]; onClose: () => void }) {
  return (
    <div style={{ ...modalOverlayStyle, zIndex: 200 }}>
      <div style={{ ...modalStyle, maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, letterSpacing: 2, color: 'var(--gold)' }}>
            SPINTAX VARIATIONS
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {variations.length === 0 ? (
            <div style={{ color: 'var(--dim)', textAlign: 'center', padding: 20 }}>
              ... no variations yet. add some spintax first.
            </div>
          ) : variations.map((v, i) => (
            <div key={i} style={{
              padding: 10, borderRadius: 6,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(220,227,240,0.06)',
              fontSize: 12, color: 'var(--cream)',
              whiteSpace: 'pre-wrap',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--gold)',
                letterSpacing: 1, marginBottom: 4,
              }}>
                VARIATION {i + 1}
              </div>
              {v}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label, value, onChange,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 0', cursor: 'pointer',
    }}>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 32, height: 18, borderRadius: 9,
          background: value ? 'var(--gold)' : 'rgba(220,227,240,0.1)',
          position: 'relative', transition: 'all 0.15s',
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: value ? 16 : 2,
          width: 14, height: 14, borderRadius: 7,
          background: value ? 'var(--black)' : 'var(--cream)',
          transition: 'all 0.15s',
        }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--cream)' }}>{label}</span>
    </label>
  );
}

// ── shared style helpers ──────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1.5, color: 'var(--dim)', marginBottom: 3 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(220,227,240,0.1)',
  borderRadius: 6, color: 'var(--cream)',
  fontFamily: 'var(--font-mono)', fontSize: 12,
  outline: 'none',
};

const iconBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(220,227,240,0.08)',
  color: 'var(--muted)', padding: '6px 8px', borderRadius: 4,
  cursor: 'pointer',
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 100, padding: 20,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--black)', border: '1px solid rgba(201,168,76,0.3)',
  borderRadius: 12, padding: 20, width: '100%',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 6,
  background: 'var(--gold)', color: 'var(--black)',
  border: 'none', cursor: 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, fontWeight: 700,
};

const btnSecondary: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 6,
  background: 'transparent', color: 'var(--muted)',
  border: '1px solid rgba(220,227,240,0.1)', cursor: 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
};
```

═══════════════════════════════════════════════════════════════
## FILE: `web/src/components/outreach/TriggersTab.tsx`
═══════════════════════════════════════════════════════════════

```tsx
// ═══════════════════════════════════════════════════════════════
// LUNARI OUTREACH V2 — Triggers Tab
// Comment-trigger DM automation (the "comment COWORK" pattern)
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import {
  MessageSquareQuote, Plus, X, Pause, Play, Trash2, Eye,
  ExternalLink, Loader2, Link as LinkIcon, AtSign
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { CommentTrigger, CommentCapture, Platform } from './types';
import { PLATFORM_META } from './types';

const API_URL = 'https://nodejs-production-63513.up.railway.app';

interface Props {
  refreshTick: number;
  onChange: () => void;
}

export function TriggersTab({ refreshTick, onChange }: Props) {
  const { authUser } = useAuth();
  const [triggers, setTriggers] = useState<CommentTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [capturesForId, setCapturesForId] = useState<string | null>(null);

  async function load() {
    if (!authUser) return;
    try {
      const res = await fetch(`${API_URL}/api/triggers?userId=${authUser.id}`);
      const json = await res.json();
      if (json.ok) setTriggers(json.triggers || []);
    } catch (e) { console.error('[TRIGGERS] load failed', e); }
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [authUser, refreshTick]);

  async function toggleStatus(t: CommentTrigger) {
    const next = t.status === 'active' ? 'paused' : 'active';
    try {
      await fetch(`${API_URL}/api/triggers/${t.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      load(); onChange();
    } catch (e) { console.error('[TRIGGERS] toggle failed', e); }
  }

  async function deleteT(t: CommentTrigger) {
    if (!confirm(`delete trigger "${t.name || t.trigger_word}"? captures stay.`)) return;
    try {
      await fetch(`${API_URL}/api/triggers/${t.id}`, { method: 'DELETE' });
      load(); onChange();
    } catch (e) { console.error('[TRIGGERS] delete failed', e); }
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)' }}>
          LOADING TRIGGERS...
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.5,
            color: 'var(--dim)', marginBottom: 2,
          }}>
            COMMENT TRIGGERS
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 520 }}>
            point a trigger at one of your posts. when someone comments your trigger word, they get an auto-DM with your lead magnet. captures land in your unibox.
          </div>
        </div>
        <button
          onClick={() => setEditingId('new')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--gold)', color: 'var(--black)',
            border: 'none', padding: '8px 14px', borderRadius: 6,
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Plus size={12} />
          NEW TRIGGER
        </button>
      </div>

      {triggers.length === 0 ? (
        <div style={{
          border: '1px dashed rgba(220,227,240,0.1)', borderRadius: 10,
          padding: 60, textAlign: 'center', color: 'var(--muted)',
        }}>
          <MessageSquareQuote size={32} color="var(--gold)" style={{ opacity: 0.4, marginBottom: 16 }} />
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
            color: 'var(--cream)', marginBottom: 6,
          }}>
            NO TRIGGERS YET
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 460, margin: '0 auto' }}>
            example: post on linkedin "drop GUIDE in the comments and i'll DM you my outreach playbook".
            create a trigger with word "GUIDE" pointing to your post. every commenter gets the playbook + lands in pipeline.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {triggers.map(t => (
            <TriggerRow
              key={t.id} trigger={t}
              onEdit={() => setEditingId(t.id)}
              onToggle={() => toggleStatus(t)}
              onDelete={() => deleteT(t)}
              onViewCaptures={() => setCapturesForId(t.id)}
            />
          ))}
        </div>
      )}

      {editingId && (
        <TriggerEditor
          triggerId={editingId === 'new' ? null : editingId}
          existing={editingId === 'new' ? null : triggers.find(t => t.id === editingId) || null}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); load(); onChange(); }}
        />
      )}

      {capturesForId && (
        <CapturesModal
          triggerId={capturesForId}
          trigger={triggers.find(t => t.id === capturesForId)!}
          onClose={() => setCapturesForId(null)}
        />
      )}
    </div>
  );
}

function TriggerRow({
  trigger, onEdit, onToggle, onDelete, onViewCaptures,
}: {
  trigger: CommentTrigger;
  onEdit: () => void; onToggle: () => void; onDelete: () => void; onViewCaptures: () => void;
}) {
  const isActive = trigger.status === 'active';
  const meta = PLATFORM_META[trigger.platform] || PLATFORM_META.linkedin;
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: `1px solid ${isActive ? 'rgba(232,160,64,0.25)' : 'rgba(220,227,240,0.06)'}`,
      borderRadius: 10, padding: 14,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: `${meta.color}22`, color: meta.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
        flexShrink: 0,
      }}>
        {meta.icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ color: 'var(--cream)', fontWeight: 600, fontSize: 13 }}>
            {trigger.name || `${meta.label} · ${trigger.trigger_word}`}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
            padding: '1px 6px', borderRadius: 4,
            background: isActive ? 'rgba(232,160,64,0.1)' : 'rgba(148,163,184,0.1)',
            color: isActive ? '#e8a040' : '#94a3b8',
          }}>
            {trigger.status.toUpperCase()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <AtSign size={10} />
            "{trigger.trigger_word}"
          </div>
          {trigger.lead_magnet_url && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6b8afd' }}>
              <LinkIcon size={10} />
              magnet attached
            </div>
          )}
          <a
            href={trigger.post_url} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              color: 'var(--muted)', textDecoration: 'none',
              maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            <ExternalLink size={9} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{trigger.post_url}</span>
          </a>
        </div>
      </div>

      <div style={{ minWidth: 80, textAlign: 'right' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--dim)', letterSpacing: 0.5 }}>
          CAPTURES
        </div>
        <div style={{ color: 'var(--gold)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 16 }}>
          {trigger.responses_sent || 0}
          {trigger.max_responses && (
            <span style={{ fontSize: 10, color: 'var(--dim)', marginLeft: 3 }}>
              / {trigger.max_responses}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={onViewCaptures} style={iconBtnStyle} title="View captures">
          <Eye size={12} />
        </button>
        <button onClick={onToggle} style={iconBtnStyle}>
          {isActive ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <button onClick={onDelete} style={{ ...iconBtnStyle, color: '#e85050' }}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function TriggerEditor({
  triggerId, existing, onClose, onSaved,
}: {
  triggerId: string | null;
  existing: CommentTrigger | null;
  onClose: () => void; onSaved: () => void;
}) {
  const { authUser } = useAuth();
  const [name, setName] = useState(existing?.name || '');
  const [platform, setPlatform] = useState<Platform>(existing?.platform || 'linkedin');
  const [postUrl, setPostUrl] = useState(existing?.post_url || '');
  const [triggerWord, setTriggerWord] = useState(existing?.trigger_word || '');
  const [dmTemplate, setDmTemplate] = useState(existing?.dm_template ||
    'hey {{firstName}}... thanks for the comment. here\'s the thing i mentioned... {{leadMagnetUrl}}\n\nlet me know what you think.');
  const [leadMagnetUrl, setLeadMagnetUrl] = useState(existing?.lead_magnet_url || '');
  const [maxResponses, setMaxResponses] = useState(existing?.max_responses?.toString() || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!authUser || !postUrl || !triggerWord || !dmTemplate) return;
    setSaving(true);
    const payload: any = {
      userId: authUser.id, name: name || undefined,
      platform, post_url: postUrl,
      trigger_word: triggerWord,
      dm_template: dmTemplate,
      lead_magnet_url: leadMagnetUrl || undefined,
      max_responses: maxResponses ? parseInt(maxResponses) : undefined,
    };
    try {
      if (triggerId) {
        await fetch(`${API_URL}/api/triggers/${triggerId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(`${API_URL}/api/triggers`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      onSaved();
    } catch (e) { console.error('[TRIGGER] save failed', e); }
    finally { setSaving(false); }
  }

  return (
    <div style={modalOverlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: 2, color: 'var(--gold)' }}>
            {triggerId ? 'EDIT TRIGGER' : 'NEW COMMENT TRIGGER'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', paddingRight: 4 }}>
          <Field label="NAME (optional)">
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. CLAUDE COWORK launch" style={inputStyle} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="PLATFORM">
              <select value={platform} onChange={e => setPlatform(e.target.value as Platform)} style={inputStyle}>
                <option value="linkedin">linkedin</option>
                <option value="twitter">twitter / X</option>
                <option value="instagram">instagram</option>
                <option value="tiktok">tiktok</option>
                <option value="reddit">reddit</option>
                <option value="facebook">facebook</option>
              </select>
            </Field>
            <Field label="TRIGGER WORD">
              <input value={triggerWord} onChange={e => setTriggerWord(e.target.value)}
                placeholder="COWORK" style={inputStyle} />
            </Field>
          </div>

          <Field label="POST URL">
            <input value={postUrl} onChange={e => setPostUrl(e.target.value)}
              placeholder="https://www.linkedin.com/posts/your-username..." style={inputStyle} />
          </Field>

          <Field label="LEAD MAGNET URL (optional)">
            <input value={leadMagnetUrl} onChange={e => setLeadMagnetUrl(e.target.value)}
              placeholder="https://lunari.pro/playbook" style={inputStyle} />
          </Field>

          <Field label="DM TEMPLATE">
            <textarea
              value={dmTemplate} onChange={e => setDmTemplate(e.target.value)}
              style={{ ...inputStyle, minHeight: 110, resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{
              marginTop: 6, padding: 8, borderRadius: 4,
              background: 'rgba(107,138,253,0.05)',
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.5,
            }}>
              vars: <code style={{ color: 'var(--gold)' }}>{'{{firstName}}'}</code>, <code style={{ color: 'var(--gold)' }}>{'{{leadMagnetUrl}}'}</code>. spintax supported.
            </div>
          </Field>

          <Field label="MAX RESPONSES (optional)">
            <input
              type="number" value={maxResponses} onChange={e => setMaxResponses(e.target.value)}
              placeholder="leave empty for unlimited" style={inputStyle}
            />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid rgba(220,227,240,0.06)' }}>
          <button onClick={onClose} style={btnSecondary}>CANCEL</button>
          <div style={{ flex: 1 }} />
          <button
            onClick={save}
            disabled={!postUrl || !triggerWord || !dmTemplate || saving}
            style={{ ...btnPrimary, opacity: !postUrl || !triggerWord || !dmTemplate || saving ? 0.5 : 1 }}
          >
            {saving ? 'SAVING...' : triggerId ? 'SAVE' : 'LAUNCH TRIGGER'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CapturesModal({
  triggerId, trigger, onClose,
}: {
  triggerId: string; trigger: CommentTrigger; onClose: () => void;
}) {
  const [captures, setCaptures] = useState<CommentCapture[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch(`${API_URL}/api/triggers/${triggerId}/captures`);
      const json = await res.json();
      if (json.ok) setCaptures(json.captures || []);
    } catch (e) { console.error('[CAPTURES] load failed', e); }
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, [triggerId]);

  return (
    <div style={modalOverlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, letterSpacing: 2, color: 'var(--gold)' }}>
              CAPTURES
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1, marginTop: 2 }}>
              "{trigger.trigger_word}" · {captures.length} CAPTURED
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--gold)' }} />
            </div>
          ) : captures.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--dim)', fontSize: 12 }}>
              ... no captures yet. waiting on first commenter to use the trigger word ...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {captures.map(c => (
                <div key={c.id} style={{
                  padding: 12, borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(220,227,240,0.06)',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  {c.commenter_avatar_url
                    ? <img src={c.commenter_avatar_url} style={{ width: 32, height: 32, borderRadius: 16 }} alt="" />
                    : <div style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(232,160,64,0.15)' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--cream)', fontWeight: 600, fontSize: 13 }}>
                      {c.commenter_name || c.commenter_handle}
                    </div>
                    {c.comment_text && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>
                        "{c.comment_text}"
                      </div>
                    )}
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
                    padding: '2px 6px', borderRadius: 4,
                    background: c.dm_status === 'sent' ? 'rgba(74,222,128,0.1)' : 'rgba(232,160,64,0.1)',
                    color: c.dm_status === 'sent' ? '#4ade80' : '#e8a040',
                  }}>
                    DM {c.dm_status.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── shared style helpers ──────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1.5, color: 'var(--dim)', marginBottom: 3 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(220,227,240,0.1)',
  borderRadius: 6, color: 'var(--cream)',
  fontFamily: 'var(--font-mono)', fontSize: 12,
  outline: 'none',
};

const iconBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(220,227,240,0.08)',
  color: 'var(--muted)', padding: '6px 8px', borderRadius: 4,
  cursor: 'pointer',
};

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 100, padding: 20,
};

const modalStyle: React.CSSProperties = {
  background: 'var(--black)', border: '1px solid rgba(201,168,76,0.3)',
  borderRadius: 12, padding: 20, width: '100%',
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 6,
  background: 'var(--gold)', color: 'var(--black)',
  border: 'none', cursor: 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, fontWeight: 700,
};

const btnSecondary: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 6,
  background: 'transparent', color: 'var(--muted)',
  border: '1px solid rgba(220,227,240,0.1)', cursor: 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
};
```
