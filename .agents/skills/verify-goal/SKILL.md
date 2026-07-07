---
name: verify-goal
description: Use before declaring any feature done ... proves the work is real AND wired, not just present. Walk the goal backward to observable truths, then grep the code for the wiring + run the stub/orphan/unwired scan. Absorbed from the lunari verifier. "should work" is the phrase that precedes a hotfix.
---

# verify-goal ... prove the work is real AND wired, not just present

absorbed from the lunari workflow. the failure this catches: code that EXISTS but isn't CONNECTED ... a route that's defined but never reached, a writer that's called but the column's wrong, a handler that returns a stub, a function imported but never invoked. typecheck + lint prove the graph LOADS; this proves the behavior HAPPENS. the discipline: distrust the summary (mine included), grep the code for the wiring.

## the goal-backward chain

before declaring a feature done, walk it backward from the goal and prove each level against the actual code/DB, not against memory:

```
1. GOAL          one sentence: what should now be true that wasn't
2. OBSERVABLE    3-7 things i could OBSERVE if it works (a row lands, a route returns X,
   TRUTHS        a card renders, a score stops moving, a toast fires). each must be checkable.
3. ARTIFACTS     the concrete files/tables/columns each truth requires (real paths, real names)
4. KEY LINKS     the grep-able wiring that connects them (the action calls the helper, the route
                 is registered, the column matches the insert, the flag gates the apply)
5. PROVE         run the query / hit the route / grep the call site for EACH level.
                 a receipt per truth. "the summary says done" is not a receipt.
```

## the stub / orphan / unwired scan (the structural pass)

grep heuristics for "exists but not connected" ... run after wiring a feature:

- **stubs / placeholders:** `return null` / `return []` / `return {}` / `TODO` / `coming soon` / `not implemented` in a handler/page that's supposed to do work. a tab that renders a placeholder it should fill.
- **orphans:** a function/route/component defined but never called or mounted. grep the symbol across src/ ... if the only hit is the definition, it's dead.
- **unwired links:** an import with no use; a server-action whose return is ignored where a guard is needed; a fetch/await whose result is dropped; a flag read nowhere; a handler registered but the function it calls is a no-op.
- **column drift:** the insert/patch keys vs the actual table columns (via supabase MCP `list_tables` / `execute_sql` against information_schema) ... the silent-insert-failure class (undefined serializes to nothing; a wrong column name 4xxs and the .catch swallows it).

## the rule

a feature is "done" when each observable truth has a receipt and the structural scan is clean ... not when the code is written, not when typecheck passes, not when i remember wiring it. receipts are real (a row, a rendered card, a green gate); log-only is not a receipt; "should work" is the phrase that precedes a hotfix.
