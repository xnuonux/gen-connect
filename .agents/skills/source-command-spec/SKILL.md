---
name: "source-command-spec"
description: "Interview me on a feature, produce a spec.md, ask clarifying questions before touching code."
---

# source-command-spec

Use this skill when the user asks to run the migrated source command `spec`.

## Command Template

you are about to spec a new feature for gen connect. follow this protocol:

1. read `AGENTS.md`, `AGENTS.md`, and any relevant docs in `docs/` first.

2. interview me. ask sharp clarifying questions. do not start writing the spec until i've answered:
   - what is the user trying to accomplish?
   - what's the smallest version of this that ships value?
   - what's explicitly out of scope?
   - what other parts of the system does this touch?
   - is there a deliverability, voice, or design rule that affects this?
   - what's the success metric?

3. once i answer, produce `specs/<feature-slug>/spec.md` with this structure:

```markdown
# <feature name>

## context
<one paragraph. what this is, who it's for, why it exists>

## user story
<plain language. what the user does, step by step>

## technical scope
- files to create or touch
- endpoints
- db schemas
- dependencies

## acceptance criteria
- bulleted list of how we know it's done. specific. demo-able.

## constraints
- performance, security, voice, deliverability, accessibility

## open questions
- only the ones that block forward motion
```

4. do NOT write any implementation code. just the spec. wait for `/implement` to start building.

5. voice rules apply to the spec itself: lowercase, no em-dashes, punchy.

if anything is ambiguous, stop and ask. do not invent answers.
