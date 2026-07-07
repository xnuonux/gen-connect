---
name: deliverability
description: Use whenever touching sending infrastructure, sendgrid/resend integration, DNS setup, warmup, bounce handling, or suppression list logic. Enforces deliverability rules.
---

# deliverability

without this layer, gen sends garbage into the void. every send goes through these rules.

## the stack

- **sending**: resend default, sendgrid as failover. dedicated IP per user on pro+ plans.
- **warmup**: mailreach (or sendgrid-native warmup at scale). 5 → 50 over 14 days.
- **inbound parsing**: resend inbound webhook → mailparser → unibox_messages.
- **suppression**: global per user, checked on every send.

## the pre-send checklist (non-negotiable)

before any outbound send fires, this check runs:

1. **DNS verified** ... sending_domains.dkim_verified AND spf_verified AND dmarc_verified all true
2. **warmup status check** ... if inbox connected < 30 days, daily cap is at ramp value
3. **suppression check** ... contact email NOT in suppression_list
4. **bounce check** ... contact has NOT failed in last 30 days
5. **rate limit** ... domain hasn't exceeded daily_volume
6. **content check** ... no spam-trigger phrases ("guaranteed", "free money", etc)
7. **list-unsubscribe header** ... present, one-click compliant per gmail/yahoo 2024

if any check fails, the send is queued or refused with a clear reason in `deliverability_events`.

## the daily cap curve

| day | sends |
|---|---|
| 1 | 5 |
| 3 | 10 |
| 5 | 20 |
| 7 | 30 |
| 10 | 40 |
| 14 | 50 |
| 30+ | up to plan limit |

user can override but is warned.

## DNS setup wizard

3 steps:
1. user enters sending domain (e.g. `hello@theircompany.com`)
2. gen generates DKIM (resend or sendgrid CNAMEs), SPF (`include:` directive), DMARC (`p=quarantine pct=10` initial)
3. wizard shows copy-pasteable values with screenshots for cloudflare / godaddy / route53 / namecheap. polls dns every 30s for 15 min.

## bounces + complaints

- bounce rate > 2% over 24h → email user warning
- bounce rate > 4% over 24h → auto-pause all active sequences for that domain
- complaint rate > 0.1% (gmail 2024 threshold) → immediate pause + email user
- every bounce + complaint writes to `suppression_list` with reason

## the list-unsubscribe header

every transactional cold send includes:

```
List-Unsubscribe: <mailto:unsub+{token}@gen.connect>, <https://gen.connect/unsubscribe/{token}>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

required by gmail and yahoo since feb 2024. non-compliance = inbox tax.

## the suppression list

per-user, global across all campaigns. populated by:
- hard bounces
- spam complaints
- explicit unsubscribes (one-click)
- manual additions ("never email this person again")

checked on EVERY send. cached in redis with 5-minute TTL for hot lookups.

## the dashboard (listmonk-tier visibility)

deliverability tab shows:
- per-domain daily volume + cap
- bounce rate (24h, 7d, 30d trend)
- complaint rate
- reputation score (computed from bounces + complaints + opens + replies)
- recent events stream (last 100 sends with status)
- warmup progress per inbox

if a metric goes red, the tab pulses gold for attention. one gold per screen, so the user sees it.

## the rules

- never bypass the pre-send checklist
- never share sending IPs across users (post-MVP this becomes mandatory)
- never store SMTP credentials in plaintext (supabase vault or env-only)
- always validate webhook signatures (resend HMAC, sendgrid event API key)
- always implement webhook idempotency (`processed_webhooks` table with unique event_id)
