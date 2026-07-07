---
name: "source-command-ship"
description: "Run the full ship check (typecheck, lint, voice-check) and prepare a PR description."
---

# source-command-ship

Use this skill when the user asks to run the migrated source command `ship`.

## Command Template

you are about to ship. follow this protocol:

1. run the ship check:
   ```bash
   pnpm ship
   ```
   if it fails, stop. report the failure. do not proceed.

2. once it passes, summarize what changed on this branch since main:
   - files added
   - files modified
   - new endpoints
   - new db migrations
   - new dependencies

3. write a PR description in this shape:

```markdown
# <feature/fix name>

## what

<one-paragraph plain english summary>

## why

<the user-facing reason this matters>

## screenshots

<paste links or describe what to capture>

## checks

- [x] typecheck
- [x] voice-check
- [x] tests pass
- [x] RLS migrations included (if applicable)
- [x] webhook signatures verified (if applicable)
- [x] no raw hex outside tokens.css
```

4. if any of the boxes can't be checked, that's a blocker. fix or flag it.

5. voice rules apply: lowercase, no em-dashes, punchy.

6. final output: the PR description, ready to paste into github.

do not run `git push` or `gh pr create` without explicit confirmation from dom.
