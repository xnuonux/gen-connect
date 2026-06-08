# gen connect · identity + omni-channel unibox · scoping

the unibox may be the most important feature in gen connect, maybe in lunari. this
doc scopes the leap from "we find emails" to "we find the person" ... a person's
whole public internet presence ... plus a single inbox that reads + sends across
the channels that legally allow it. it is the compliant path, on purpose.

## the reframe

today gen is "email outreach with voice." the vision is **"the omni-channel
relationship inbox + prospector for solo founders and creators."** bigger category,
stickier surface (the inbox is daily-use, high-retention), aligned to an icp that
lives in social dms, not email. clay/apollo are email+title machines; nobody owns
the cross-channel creator inbox well.

positioning line: **"we don't find emails, we find the person."**

## the one rule that decides everything

three different moves hide inside "do it on socials," with wildly different risk:

1. **read** ... ingest a person's public profile / inbound dms. mostly legal via
   official apis + the person's own oauth.
2. **send** ... outbound through a channel. legal only where the official api allows.
3. **hunt** ... discover + reach new people. legal only on public, self-published
   data or official discovery.

**legality follows the SOURCE, not who runs the crawler.** building an in-house
person-graph that scrapes a walled garden is the same violation as buying it from a
scraper-vendor ... it just moves whose name is on the lawsuit. so the whole design
is: source from intentionally-public, self-published, official/open data only.

scope-out (from CLAUDE.md + confirmed by research): **no detection-evasion, no
identity-concealment, no anti-ban automation.** that is the heyreach/proxycurl
graveyard. the goal is "no illicit act," not "no trace."

## what the research verified (high confidence, cited 2025-2026)

a deep-research pass ran; its verify phase only confirmed the legal core (the rest
was unverified-not-disproven, see "open" below). what landed hard:

- **linkedin data is the one hard wall.** hiQ v. linkedin did NOT make scraping
  legal ... it was a narrow CFAA-only ruling; linkedin then WON breach-of-contract
  and took a $500k judgment. linkedin user agreement §8.2(4) bans using member data
  "through third parties (data aggregators or brokers)" ... so **buying**
  linkedin-derived data does not launder it, and a user who is a linkedin member is
  bound by that contract. proxycurl (the biggest linkedin-enrichment api) was sued
  by linkedin (N.D. Cal. 3:25-cv-00828, jan 2025) and **shut down july 2025**.
  buying from a sued vendor adds chain-of-custody + Rule 45 subpoena exposure.
  → **linkedin-sourced data, in-house OR vendor, is the hard no.**
- **people data labs is the least-bad vendor fallback, not a clean base.** licensed
  aggregator with a real opt-out/deletion regime + a Person Changelog api to honor
  deletions ... but independent reviewers confirm scraped public-profile data is
  still in its mix. optional accelerant, never the foundation.

## the compliant source map (built + planned)

verified live against the real apis (response shapes confirmed):

| source | gives | auth | status |
|---|---|---|---|
| **gravatar v3** (`/v3/profiles/{sha256(email)}`) | name, bio, location, job, company, verified social accounts (x/linkedin/github/instagram/...) | none | **built** |
| **github** (`/users/{login}` + `/users/{login}/social_accounts`) | name, bio, company, blog (site), x handle, linked socials (mastodon/bluesky/...) | none (60/hr; GITHUB_TOKEN → 5000/hr) | **built** |
| person's own site / linktree | more links, about, role | none | planned (crawl4ai sidecar) |
| bluesky AT protocol (`resolveHandle`) | handle → DID → profile | none, open | planned |
| mastodon WebFinger / accounts | federated profile from `user@domain` | none, open | planned |
| public web / search | catch-all discovery | n/a | planned |

gravatar verified-accounts are profiles the person verified on their OWN gravatar,
so even a linkedin url surfaced here is self-published, not scraped. maximally clean.

## per-platform channel reality (the unibox, planned)

- **email** (gmail/imap, multi-inbox): legal. note ... restricted gmail oauth scopes
  require google's CASA security assessment + annual re-cert (real cost/time).
- **instagram / messenger / whatsapp**: official business-messaging apis, reply-
  window-gated (reply within a window, not cold-dm), business/creator accounts only.
- **reddit, bluesky**: open apis, read + send ok.
- **x**: dm api exists but expensive/tiered.
- **telegram**: bot-first.
- **linkedin**: NO compliant send api ... human-in-the-loop only (gen drafts in
  voice, the user taps send in the real app). this is the heyreach-killer that
  doesn't get accounts banned.
- **tiktok**: no compliant path.

→ channel adapters carry capability flags (`can_read` / `can_send` / `can_prospect` /
`human_assist_only`); the ui + gen never offer a move a channel can't legally do.

## the privacy model (planned, confirm with counsel)

storing a person-dossier before first contact carries real weight:
- **gdpr legitimate interest** is a documented 3-part test, NOT automatic; building a
  dossier to cold-outreach is not automatically lawful under it.
- **article 14** ... you owe notice to people whose data you collected indirectly.
- **google limited use** ... gmail-derived data may not be passed to brokers.
- build in: data-subject access + deletion, suppression list, opt-out, the PDL
  opt-out feed wired to deletion.

## the build roadmap (compliant order)

1. **public-footprint resolver** ... gravatar + github → person-graph, stored on
   `gc_contacts.enrichment_data.footprint`, free copilot tool `resolve_footprint`.
   **(this chunk ... shipped first.)**
2. expand resolver sources ... own-site crawl, bluesky, mastodon, public web.
3. footprint UI ... the contact rail shows the person-graph (the "find the person"
   payoff), provenance breadcrumb.
4. channel-adapter spine + oauth connection management (the heavy infra, built once).
5. omni-unibox read ... official apis (gmail multi-inbox first, then ig/reddit/
   bluesky), threading, the 3-pane that already exists wired to real data.
6. send + human-assist ... official send where allowed, draft-and-hand-to-human for
   gated channels (linkedin), capability flags enforced.
7. privacy surface ... consent flags, article-14 notice, deletion/suppression.

PDL-style licensed vendor stays an OPTIONAL fallback behind the in-house resolver,
never the base.

## open (needs its own verified pass before building that layer)

the research verify phase only confirmed the legal core. these are
unverified-not-disproven and should be re-checked before the relevant chunk:
- exact in-house source mechanics for bluesky/mastodon/own-site (gravatar + github
  ARE confirmed live, in this doc's table).
- precise per-platform official-api limits + pricing (chunk 4-6).
- the gdpr/ccpa checklist specifics (chunk 7) ... counsel should eyeball.

related memory: [[omnichannel-unibox-vision]] · [[gen-copilot-vision]]
