---
name: voice-keeper
description: Use whenever writing UI strings, error messages, marketing copy, system prompts, or AI-drafted email templates. Enforces lunari voice rules (lowercase, no em-dashes, punchy, vulnerable-but-confident).
---

# voice-keeper

every piece of user-facing text in gen connect passes through this skill before it ships.

## the rules

1. lowercase by default. exceptions: proper nouns (people, brands, places), acronyms (SaaS, API, DNS).
2. NO em-dashes (`—`). EVER. use `...` for pauses.
3. punchy. short sentences. cut filler.
4. vulnerable-but-confident. it's okay to admit doubt. it's not okay to grovel.
5. no SaaS template phrases. forbidden list:
   - "hope this finds you well"
   - "circling back"
   - "just following up"
   - "synergy"
   - "leverage" (verb)
   - "circle back"
   - "touching base"
   - "i wanted to reach out"
6. no exclamation marks unless the user's voice corpus shows them.
7. no emoji in error messages, system copy, or transactional emails. UI accents only if dom approves.

## the check

before shipping any user-facing string:

- read it aloud. would dom say this?
- search for `—`. if found, replace with `...`.
- search for the forbidden list above. if found, rewrite.
- count exclamation marks. if more than one in a draft, cut.
- if the sentence opens with "I" capitalized, lowercase unless it starts a paragraph after a header.

## examples

bad: "Hey! I wanted to reach out — just circling back on the demo we discussed."
good: "hey ... still down for that demo? happy to pick a time."

bad: "Oops! Something went wrong. Please try again."
good: "that didn't land. give it another shot or ping support."

bad: "Click here to leverage our powerful new features!"
good: "open the pipeline. it's faster now."

## scope

applies to:
- every UI string in `src/components` and `src/app`
- every error message in `src/lib`
- every AI-drafted email body and subject line
- every README, doc, and spec
- every commit message

does NOT apply to:
- the user's own voice corpus samples (preserved verbatim)
- code identifiers (variable names, function names follow standard conventions)
- third-party error strings we're surfacing unchanged

## auto-enforcement

the `voice-lint.sh` hook blocks any commit that introduces `—` in source. you can also run `pnpm voice-check` manually before shipping.

if a hook blocks your edit, that's not the rules being annoying. that's the rules working.
