---
name: ship-discipline
description: Use before any commit or PR. Enforces the gen connect ship checklist: typecheck, voice-check, no raw hex, no em-dashes, RLS on new tables.
---

# ship-discipline

every commit passes through this skill. drift here = drift everywhere.

## the ship checklist

before any `git commit`:

1. `pnpm typecheck` passes with zero errors
2. `pnpm voice-check` passes (em-dash sweep)
3. no raw hex codes in any file outside `src/design/tokens.css`
4. if a new supabase migration ships, it includes RLS enable + policies
5. if a new server action or api route ships, input is zod-validated
6. if a new webhook handler ships, signature verification is in place
7. if a new AI call ships, it lives in `src/lib/ai/` (never inline)
8. if a new UI string ships, voice-keeper rules apply

## the one-liner

```bash
pnpm ship
```

runs typecheck + lint + voice-check. if it doesn't pass, you don't commit. period.

## commits

format: `<scope>: <imperative, lowercase>`

examples:
- `pipeline: add stage-change trigger fires on drag`
- `unibox: stream sonnet draft into composer`
- `drafting: lock 5-angle prompt schema`
- `deliverability: ship dns wizard step 1`

no scope = repo-wide:
- `chore: bump @xyflow/react to 12.4`
- `docs: tighten 02-design-system spec`

never:
- "fix bug" (which bug)
- "WIP" (don't commit WIP to main)
- emoji prefixes (we're not doing that)

## branches

- `main` is the production line. only merge tested work.
- feature branches: `feature/<short-name>` ... example `feature/pipeline-kanban`
- fix branches: `fix/<short-name>` ... example `fix/unibox-thread-dedup`
- spike branches: `spike/<short-name>` ... example `spike/mailreach-warmup-api`

never commit directly to main. ever. even for "tiny" fixes.

## PRs

- title is the same format as a commit message
- description has three sections: what, why, screenshots/clips
- self-review before requesting external review (dom or vega)
- if you touched the design system, screenshot the change
- if you touched the schema, paste the migration sql

## deploys

- netlify previews per branch
- prod only deploys from main after a successful PR merge
- preview link in PR description, always

## the ship cadence

dom ships at night. days, not weeks. that means:
- small, focused PRs ... rarely more than 400 lines changed
- ship every night, even if it's just a polish pass
- never let a branch sit longer than 48 hours
- if it's not ready in 48, kill it or merge what's good and start fresh
