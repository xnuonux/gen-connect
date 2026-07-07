---
name: perfection-loop
description: The autonomous quality loop for gen connect. Use when asked to "make it better / sleeker / more feature-packed", to grade the product, or to run iterations toward a target score. Spawns bounded agent fan-outs to research, imagine, build, and adversarially review, then grades 1-10 against the rubric and loops until the target lands. Mirrors the lunari cron-loop-to-perfection ritual.
---

# perfection-loop ... research, imagine, build, review, grade, repeat

the autonomous quality engine. one turn of the loop takes the product up a notch; the loop runs until the graded score hits the target (default 9/10). built to be driven by the Workflow tool (bounded fan-outs, not swarms ... the lesson from the 105-agent blowup: 3-6 agents per phase, chosen deliberately).

## the rubric (grade each 0-10, weighted)

1. **visual polish (x1.5)** ... cinematic, dense-where-it-counts, lunari tokens, planetarium motion, follow-through, no generic AI aesthetic. the bond/linear/attio bar.
2. **feature completeness (x1.5)** ... the 5 tabs + gen copilot all REAL and functional, not shells. measured by verify-goal (wired, not just present).
3. **futuristic / wow (x1.0)** ... AI-native UX moves competitors don't have. delight, command surfaces, live feel.
4. **wedge differentiation (x1.5)** ... voice-match, signals, 5-angle, the unibox that doesn't suck, the "find the person" person-graph. measured vs gojiberry / clay / instantly / apollo.
5. **code health (x1.0)** ... gate-green (typecheck + lint + voice), RLS on every table, no stubs/orphans/unwired, no raw hex, no em-dashes.
6. **ux coherence (x1.0)** ... onboarding to pipeline to draft to send to reply feels like one magical motion, not seven disconnected tabs.

overall = weighted mean, rounded to one decimal. a dimension below 6 caps the overall at 8 (a hole sinks the ship). target = 9.0.

## the loop (one iteration)

```
GRADE     panel of lenses reads the real code per dimension, scores it, names the
          single highest-leverage gap per dimension. synthesize with multi-lens-review
          (no averaging ... evidence over vote count). output: scores + ranked backlog.
RESEARCH  bounded web sweep: competitor feature teardowns + 2026 outreach/UI trends.
+IMAGINE  bounded imagine pass: features the user doesnt know theyre missing, scoped
          to gen connect's wedge + the actual file tree. output: concrete buildable specs.
BUILD     main loop (me) picks the top no-migration wins, builds them, owns the gate.
          parallel independent file work -> worktree-isolated agents; shared files -> me.
          NEVER apply a prod migration without explicit approval (standing rule).
REVIEW    multi-lens adversarial review + verify-goal goal-backward chain on the diff.
          catch stubs/orphans/unwired/column-drift. anything not wired goes back to BUILD.
REGRADE   re-run GRADE on the new state. if < target, loop. if >= target, stop + report.
```

## the laws

- **gate every iteration.** typecheck + lint + voice-check green before commit. dev server STOPPED during the gate (memory contention crashes it in this harness). individual steps, not chained `pnpm ship` (transient 0xC0000409).
- **branch + FF, never commit to main.** ship-discipline owns the mechanics.
- **no fake success.** a tab that renders "coming soon" prettier is not progress. verify-goal decides done, not the summary.
- **migrations are a hard gate.** additive or not, a prod migration needs explicit human approval. the loop builds around dark-pending features and surfaces the migration as a single go/no-go, never applies it unilaterally.
- **bounded fan-out.** 3-6 agents per phase. a real fan-out is Nx tokens; spend it on the load-bearing phase (grade, review), not on busywork.
- **honest grading.** grade the code that exists, not the code i wish existed. a shell scores like a shell. cite the file + line for every score.

## driving it with Workflow

read-heavy phases (grade, research, imagine, review) are Workflow fan-outs with `schema` so they return structured scores/specs/findings. the build phase is the main loop, because only the main loop reliably runs the gate, commits, and applies the migration gate. run grade+research+imagine as one workflow (independent reads), implement inline, then run review+regrade as the next workflow. stay in the loop between phases ... read each result, decide the next move.
