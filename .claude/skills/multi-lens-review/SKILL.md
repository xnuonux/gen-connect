---
name: multi-lens-review
description: Use for any load-bearing call ... an architecture fork, a "is this safe to ship/flip" gate, a hard root-cause, or grading work quality. Fan the question to distinct lenses (skeptic, builder, analyst) and synthesize with the rubric instead of averaging. Absorbed from the lunari fusion workflow.
---

# multi-lens-review ... the synthesis rubric for hard calls

absorbed from the lunari workflow. for a genuinely hard call (a schema-migration premortem, a root-cause with a gnarly dependency graph, an architecture fork, a "is this safe to flip" gate, grading whether work is actually good) ... fan the question to a few independent lenses, then synthesize with this rubric instead of averaging. this is what the adversarial-review workflows run by.

## when to reach for it

NOT routine work (a bug fix, a route add, a migration following the pattern) ... that's pure overhead. reach for it when the call is load-bearing + a wrong answer is expensive + the solution space is wide. on those, spawn the lenses (parallel agents, or run them in sequence) and synthesize.

## the three lenses (distinct, not redundant)

- **skeptic:** assume the obvious answer is WRONG until evidence forces acceptance. attack the steelman, never a strawman. separate cleanly: "i DISPROVED this" vs "i COULD NOT VERIFY this" ... those are different claims and collapsing them is how false confidence ships.
- **builder:** the actionable full path ... what actually gets done, concretely, end to end, with the real file paths + the wiring.
- **analyst:** go DEEP on the one crux the decision hinges on ... not breadth, the single load-bearing question, fully.

(diverse lenses, not N copies of one prompt ... redundancy can't catch a failure mode all copies share.)

## the synthesis rubric (the real value)

when the lenses come back, do NOT average. apply:

- **claim ledger:** list each distinct claim + which lens made it + whether it's evidenced or asserted.
- **correlated-error guard:** agreement is NOT confirmation. three lenses agreeing can be three copies of one mistake (same training, same blind spot). ask "could they all be wrong the same way?" before trusting consensus.
- **anti-majority guard:** weight by EVIDENCE, not vote count. a single lens with a receipt beats two with a vibe.
- **surface disagreements, don't average them:** where the lenses conflict, resolve it with evidence or name it as an open risk ... never split the difference into a mushy middle that no lens would endorse.
- **coverage union:** the final answer carries the union of what each lens caught, not just the overlap.

## the honest baseline (calibration)

when judging whether a multi-lens result is actually BETTER: the honest comparison is N independent single-pass draws at the SAME total token cost, not one pass. multi-agent that doesn't beat equal-budget self-consistency bought nothing but tokens.

cost note: a real fan-out is ~Nx tokens. worth it on the load-bearing call, waste on the routine one. choose deliberately.
