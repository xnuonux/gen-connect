---
name: closer-instinct
description: Use whenever working on the drafting engine, 5-angle generation, self-judge loop, or any AI-written outreach copy. Enforces the gen drafting pattern.
---

# closer-instinct

every cold draft gen produces goes through this pattern. no exceptions. no single-angle shortcuts.

## the 5-angle pattern

every prospect, every cold first-touch, gen produces 5 distinct angle drafts:

1. **shared context** ... reference something specific in their world (a post, a hire, a launch, a mutual connection)
2. **outcome promise** ... name a concrete result they want (booked shoots, deals closed, slots filled)
3. **provocation** ... contrarian take that earns attention without being rude
4. **utility offer** ... give first (template, audit, intro, free resource), then ask
5. **curiosity hook** ... tease a specific insight that requires a reply to unlock

each angle is a complete draft: subject line + body. body under 80 words. one ask per email.

## the model

- 5-angle generation: claude opus 4.7 (single call, structured output via tool_use)
- self-judge: claude opus 4.7 (second pass, scores 5 axes per angle)
- inline reply drafting: claude sonnet 4.6 (streaming, lower latency)

## the self-judge loop

after 5 angles are generated, opus runs a second pass to score each on 5 axes (1-10):
1. **relevance** ... specific to this contact, not generic
2. **voice_match** ... sounds like the user, not AI
3. **opening_strength** ... first 12 words pass scroll test
4. **ask_clarity** ... one ask, one CTA
5. **expected_reply_rate** ... judge's bayesian forecast

mitigations against self-enhancement bias:
- shuffle angle order before judging
- use a different prompt frame ("you are a reply-rate forecaster" vs "you are a copywriter")
- require evidence quotes for each axis score
- weight voice_match × 1.5, others × 1.0
- log every override so the learning loop can adjust

## the per-user learning loop

every send/open/reply/book event writes a row to `draft_outcomes`. weekly cron reads the last 30d, asks sonnet to identify patterns, updates `user_drafting_profiles.preferences` jsonb. next generation reads the profile and biases angle selection.

cold start: dom voice prior until the user has 10+ samples AND 50+ sent emails.

## the anti-patterns

forbidden in any draft:
- "hope this finds you well"
- "circling back"
- "just following up"
- "synergy", "leverage" (as verb), "circle back", "touching base"
- em-dashes (use `...` for pauses)
- exclamation marks (unless user's voice corpus shows them)
- generic personalization tokens like "{{company}}, your team is awesome"

enforced via post-generation regex check. if hit, regenerate that angle only.

## the structure (production prompt skeleton)

```ts
const systemPrompt = `
you are gen, a cold outreach copywriter. you write like the user, not like AI.

CONSTRAINTS (non-negotiable):
- lowercase only (unless proper nouns)
- never use em-dashes (use "..." for pauses)
- never use: "${forbidden_phrases.join('", "')}"
- max 120 words per body
- max 60 chars per subject
- one ask per email
- no exclamation marks unless user's corpus has them

USER VOICE CORPUS:
${voice_corpus_samples}

USER VOICE PROFILE:
${voice_profile_jsonb}

TASK: generate 5 distinct cold email angles ... shared_context, outcome_promise,
provocation, utility_offer, curiosity_hook ... each with subject + body + rationale.
return strict JSON matching the angle schema.
`;
```

## the display

UI surfaces all 5 angles as cards. winner badged in forest green. each card shows:
- angle type label (mono, tracked uppercase)
- subject + body preview
- confidence chip (1-10 flame + the angle name)
- rationale on hover
- "use this angle" CTA
- "regenerate this angle" button

user override is captured into `draft_judge_scores.user_override_angle_id` and fed back into the next learning cycle.

## the cost ceiling

target ~$0.08 per 5-angle generation set (opus 4.7 single call). track in `usage_events`. enforce per-user daily cap by plan tier.
