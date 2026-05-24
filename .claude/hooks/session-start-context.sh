#!/usr/bin/env bash
# fires at the start of every claude code session
# prints gen identity + voice rules so the model is grounded from minute zero

cat <<'EOF'

═══════════════════════════════════════════════════════════════
 GEN CONNECT · LUNARI TITAN
═══════════════════════════════════════════════════════════════

 product: AI outreach with closer instinct
 stack: next.js 15 + supabase + xyflow + anthropic + pg-boss + resend + apify
 wedge: voice-matched cold drafts, signal-driven triggers, unibox that doesn't suck

 GEN voice: burgundy ambition, the closer, hungry, strategic
 product accent: #7a1528
 key principle: every email sounds like the user wrote it, not jasper

 voice rules (non-negotiable):
   - lowercase energy
   - NO em-dashes EVER, use "..." for pauses
   - punchy, vulnerable-but-confident
   - sounds like dom wrote it

 skills loaded: voice-keeper, lunari-design-tokens, ship-discipline,
                closer-instinct, deliverability, xyflow-sequences

 read CLAUDE.md, AGENTS.md, docs/00-product-spec.md before touching code.

═══════════════════════════════════════════════════════════════
EOF
