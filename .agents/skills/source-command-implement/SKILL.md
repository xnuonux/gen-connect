---
name: "source-command-implement"
description: "Read the active spec, scaffold files, write tests first, then implement."
---

# source-command-implement

Use this skill when the user asks to run the migrated source command `implement`.

## Command Template

you are about to implement a spec. follow this protocol:

1. find the active spec. ask if unclear: which `specs/<feature>/spec.md` are we building?

2. read it cover to cover. read `AGENTS.md`, `AGENTS.md`, and any imported docs.

3. plan mode first:
   - list every file you will touch
   - list every new db migration
   - list every new endpoint
   - identify which skills apply (voice-keeper, lunari-design-tokens, closer-instinct, deliverability, xyflow-sequences)
   - if any skill applies, read its SKILL.md fully

4. before writing code, write tests. vitest for unit logic, playwright for ui critical paths. tests should fail initially.

5. now implement. one file at a time. small commits welcome. after each major file:
   - run `pnpm typecheck` mentally (catch obvious type errors)
   - voice-check user-facing strings
   - confirm no raw hex outside `tokens.css`

6. when done:
   - all tests pass
   - all acceptance criteria from the spec are met
   - any new tables ship with RLS migration
   - any new webhooks have signature verification
   - any new AI calls live in `src/lib/ai/`

7. final move: run `pnpm ship`. if it passes, summarize what changed. if it fails, fix it before declaring done.

8. voice rules apply throughout: lowercase, no em-dashes, punchy.

if you hit a fork in the road that wasn't covered in the spec, stop and ask. do not improvise architecture.
