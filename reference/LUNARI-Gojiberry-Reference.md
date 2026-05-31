# LUNARI · The Gojiberry Reference

**what this is:** every place gojiberry shaped LUNARI, pulled out of the Outreach V2 bundle into one clean doc. gojiberry is the competitor / reference product whose persistent-signal-agent model became the backbone of Outreach V2 (target v∞.16.0, built april 25, 2026, against server.js v∞.15.22).

this is not the goji-berry fruit. it's a real outreach/signal-intelligence product you studied and rebuilt the good parts of, lunari-styled.

---

## 1. the core idea you borrowed

the drift doc names it straight. today lunari's outreach is just a kanban board... good for tracking, useless once a reply lands. replies vanish into your email and linkedin, comment-DMs get sent by hand, and there's:

> "no equivalent to gojiberry's persistent signal agents that surface warm leads while you sleep."

outreach v2 was built to close exactly that gap. four of its five tabs trace directly back to gojiberry patterns.

---

## 2. the four gojiberry-derived patterns

| pattern | lunari tab | what it does | gojiberry origin |
|---|---|---|---|
| **persistent signal agents** | Signals | watcher agents that find ICP matches every 6 hours, surface hits with 1-10 flame ratings | the core gojiberry mechanic... "surface warm leads while you sleep" |
| **unified inbox** | Unibox | every reply across 10 platforms in one 3-pane inbox, NOVA-drafted replies in your voice | code comment: *"gojiberry pattern, lunari-styled"* |
| **signal taxonomy** | Signals (config) | the bucketed list of signal types you can watch for | code comment: *"matches gojiberry taxonomy"* |
| **comment-trigger DMs** | Triggers | the "drop COWORK and i'll send the playbook" auto-DM mechanic | gojiberry-style lead-magnet capture |

the fifth tab (Pipeline) is your existing kanban + outcome logging. not gojiberry-derived.

---

## 3. the signal taxonomy (the heart of it)

this is the `SIGNAL_BUCKETS` constant from `types.ts`, commented *"matches gojiberry taxonomy."* five buckets, each grouping the signal types a watcher agent can fire on:

### You & Your Niche
- `engaged_with_your_content` ... engaged with your content
- `mentioned_your_name` ... mentioned your name
- `followed_your_page` ... followed your page

### Engagement & Interest
- `engaged_with_keyword` ... engaged with relevant keyword
- `commented_on_topic` ... commented on topic
- `searching_for` ... "looking for / need a" pattern

### Profile Signals
- `followed_competitor` ... followed competitor profile
- `viewed_similar_creator` ... viewed similar creator

### Trigger Events
- `hiring_post` ... posted a hiring intent
- `tool_mention` ... mentioned a tool you replace
- `job_change` ... recently changed roles

### Competitor Engagement
- `engaged_with_competitor` ... engaged with competitor content
- `left_competitor` ... unfollowed competitor

---

## 4. the flame rating logic

`scoreSignalHit()` assigns each hit a 1-10 flame rating. conservative defaults, hot signals score higher, senior titles get a boost:

```js
function scoreSignalHit(signalType, contact) {
  // 1-10 flame rating, conservative defaults
  let score = 5;
  const hot  = ['hiring_post', 'engaged_with_competitor', 'tool_mention'];
  const warm = ['followed_company', 'engaged_with_content'];
  if (hot.includes(signalType))  score = 8;
  if (warm.includes(signalType)) score = 6;
  // boost if contact has senior title
  const title = (contact && contact.title || '').toLowerCase();
  if (/founder|ceo|cto|director|vp|head of/.test(title)) score = Math.min(10, score + 1);
  return score;
}
```

so: a hiring post from a founder = flame 9. a content-engagement from someone untitled = flame 6. nothing ever scores below 5 by default.

---

## 5. the data model

### signal_agents (the persistent watchers)

```sql
CREATE TABLE IF NOT EXISTS signal_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                 -- 'AGENT 1 — SUPER HOT', 'photographer-watcher', etc
  status TEXT DEFAULT 'active',       -- 'active' | 'paused' | 'archived'
  icp JSONB DEFAULT '{}'::jsonb,      -- { titles, locations, industries, company_sizes, exclusions }
  precision INT DEFAULT 50,           -- 0=discovery (broad), 100=high precision (narrow)
  signals JSONB DEFAULT '[]'::jsonb,  -- [{type, config, enabled}]
  objectives JSONB DEFAULT '{}'::jsonb, -- {pain_points: [], campaign_goal, message_tone}
  hits_total INT DEFAULT 0,
  hits_last_7d INT DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  cron_expr TEXT DEFAULT '0 */6 * * *', -- default: every 6 hours
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### signal_hits (what the watchers find)

```sql
CREATE TABLE IF NOT EXISTS signal_hits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES signal_agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  signal_type TEXT NOT NULL,          -- 'followed_company' | 'engaged_with_competitor' | 'hiring_post' | 'tool_mention' | etc
  signal_context TEXT,                -- 'Just engaged with industry expert linkedin.com/in/...'
  contact_handle TEXT,
  contact_name TEXT,
  contact_title TEXT,
  contact_company TEXT,
  contact_avatar_url TEXT,
  contact_profile_url TEXT,
  ai_score INT,                       -- 1-10 flame rating
  contact_id UUID REFERENCES outreach_contacts(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'new',          -- 'new' | 'enriched' | 'enrolled' | 'dismissed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### the agent's ICP shape (from the TS interface)

```ts
icp: {
  titles?: string[];
  locations?: string[];
  industries?: string[];
  company_sizes?: string[];
  exclusions?: string[];
}
objectives: {
  pain_points?: string[];
  campaign_goal?: string;
  message_tone?: string;
}
```

---

## 6. how a watcher actually runs

`runSignalAgent()` is the stub that fires on the 6-hour cron. v16.0 wires it to your existing `apolloSearchPeople` for ICP matching. the real gojiberry-grade watchers (LinkedIn engagement, competitor-follow, hiring-post detection) were deferred to v16.2+.

the flow:
1. cron picks up agents where `status='active' AND next_run_at <= NOW()`
2. agent pulls 5 records per run via Apollo ICP filters (titles + locations + industries)
3. each match gets scored, written to `signal_hits` with status `new`
4. agent counters bump, `next_run_at` set +6 hours

**cost note from the bundle:** 5 Apollo credits per run × 4 runs/day = 20 credits/day per agent. out of 10K/month, that's ~50 days of a single agent running.

deferred real watchers (from the DRIFT next-steps):
- LinkedIn engagement watchers (`followed_company`, `engaged_with_competitor`) → Cloudflare Browser Rendering or Phantombuster
- Twitter watcher (`commented_on_topic`, `hiring_post`) → existing twitter scraping infra
- Reddit watcher → existing reddit_research tool
- job-change detection → Apollo enrichment with delta tracking

---

## 7. the Unibox pattern (gojiberry, lunari-styled)

the file header for `UniboxTab.tsx` literally says it:

```tsx
// LUNARI OUTREACH V2 — Unibox Tab
// 3-pane: thread list / message thread / contact info rail
// gojiberry pattern, lunari-styled
```

three panes: thread list on the left, the message thread in the middle, contact info rail on the right. every reply across all 10 platforms (email, linkedin, x, instagram, tiktok, reddit, telegram, facebook, threads, bluesky) lands in one place.

NOVA drafts the reply in your voice via `generateUniboxDraft()`. the prompt enforces the voice rule hard: lowercase, no em-dashes (uses `...`), punchy, 1-3 sentences, match their energy, no corporate sign-off. every draft runs through `scrubEmDashes()` before it surfaces.

---

## 8. the comment-trigger pattern

the "drop COWORK and i'll send the playbook" mechanic. watch a post, when someone comments the trigger word, auto-DM them the lead magnet and capture them as a contact.

```sql
CREATE TABLE IF NOT EXISTS comment_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,                          -- 'CLAUDE COWORK launch — COWORK trigger'
  platform ...,
  post_url TEXT,
  trigger_word TEXT,
  trigger_word_match TEXT,            -- 'exact' | 'contains' | 'starts_with'
  case_sensitive BOOLEAN,
  dm_template TEXT,
  lead_magnet_url TEXT,
  capture_email BOOLEAN,
  max_responses INT,
  responses_sent INT,
  status TEXT,                        -- 'active' | 'paused' | 'expired' | 'completed'
  expires_at TIMESTAMPTZ,
  ...
);
```

`runCommentTrigger()` was a no-op stub in v16.0. the DRIFT flagged it as "the highest-ROI lead-gen mechanic" and put LinkedIn polling first (v16.2) since you're already active there.

---

## 9. where gojiberry shows up in the codebase

so you can grep for it:

- `types.ts` → `SIGNAL_BUCKETS` constant, comment *"matches gojiberry taxonomy"*
- `UniboxTab.tsx` → file header, comment *"gojiberry pattern, lunari-styled"*
- `OUTREACH-V2-DRIFT.md` → the "what this is" framing references gojiberry's persistent signal agents as the gap being closed
- DeepSeek V4 Value Mining Plan → gojiberry listed as a teardown target for the competitor teardown engine (alongside polsia, kajabi, shipper, pixverse, heygen)

---

## 10. the teardown angle (from the DeepSeek plan)

play #5 in the deepseek value-mining plan was a standalone microproduct: a competitor teardown engine pointed at polsia, kajabi, shipper, pixverse, heygen, and **gojiberry**. output = a teardown doc per competitor + a public "creator OS landscape" report on lunari.pro. seo + authority + lead magnet from one batch run, ~$3 of compute.

if you want, gojiberry is a clean candidate for the first published teardown... you already rebuilt its best mechanic, so you know it cold.

---

## status snapshot (as of the bundle, april 25 2026)

- **shipped in v16.0:** schema (12 tables), all 5 frontend tabs, signal taxonomy, flame scoring, Apollo-backed watcher stub, NOVA unibox drafts, comment-trigger schema
- **deferred:** unibox inbound/outbound wiring (v16.1), comment-trigger polling (v16.2), campaign send loop (v16.1), real LinkedIn/Twitter/Reddit watchers beyond Apollo (v16.2+)

the gojiberry parity is *structural* ... the bones are all in. what was left was the live wiring that turns the stubs into running watchers.
