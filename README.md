# gen connect

**the outreach tool where every email sounds like you wrote it and every campaign feels like a real instrument.**

voice-matched cold drafts. signal-driven triggers. relationship intelligence. unibox that doesn't suck.

## quickstart

```bash
pnpm install
cp .env.example .env.local   # fill in keys
pnpm dev
```

→ http://localhost:3000

## stack

next.js 15 + react 19 ... tailwind v4 ... shadcn ... supabase ... xyflow ... anthropic claude (opus 4.7 + sonnet 4.6 + haiku 4.5) ... pg-boss ... resend ... apify ... cal.com embed.

## scope

5 tabs: pipeline, unibox, signals, campaigns, triggers. enrichment waterfall, 5-angle drafting + self-judge loop, visual sequence editor, deliverability dashboard, win celebrations.

## docs

- product spec ... `docs/00-product-spec.md`
- architecture ... `docs/01-architecture.md`
- design system ... `docs/02-design-system.md`
- voice corpus ... `docs/03-voice-corpus-placeholder.md`
- roadmap ... `docs/04-roadmap.md`
- claude code handoff ... `docs/05-claude-code-handoff.md`

## health check

```bash
curl http://localhost:3000/api/health
# {"ok":true,"product":"gen-connect"}
```

## voice rule

lowercase. no em-dashes. use `...` for pauses. punchy, vulnerable-but-confident. drift kills the brand.

---

part of the LUNARI titans portfolio. sister products: NOVA press (AI writing studio), ATLAS research (AI research surface).
