# gen connect -> lunari ... integration handoff

the artifacts for folding gen connect into lunari as a native sector that replaces
the existing `outreach` tab. produced from a verified 17-agent map of every gen
surface against the real files (gen side + lunari side). hand to the lunari cc;
dom is the merge layer between the two instances.

**start here:**

1. **`PORT-PLAN.md`** ... the plan. the one-line mount point, the thin-client /
   fat-backend split, the per-surface data map (what goes supabase-direct vs a
   `/api/gen` node route), the three reconciliations (contacts, wallet, voiceprint),
   the next->react-router rewire catalog, and the fold sequencing.
2. **`tailwind-alias-block.js`** ... paste-ready. the `lunari-*` / `gen-accent`
   tailwind color aliases + the `global.css` var-aliases + the custom utility
   classes/keyframes, so gen's components render unchanged in the SPA. includes the
   one honest caveat (slash-opacity modifiers).
3. **`ConnectSector.template.tsx`** ... the sector scaffold. mirrors `ResearchPage`
   (the atlas sector): internal sub-nav, reads userId from `useAuth()`, and the two
   data patterns (`genApi(...)` route-fetch for privileged ops, the supabase-direct
   read for lists).

**the headline:** the hard part is already done. gen and lunari share one supabase
project, one login, one design system, one `voice_profiles` voiceprint, and the
gc_* tables are already live on the shared substrate. so this is a thin-client
sector + a `/api/gen` backend route family + three reconciliations. no data
migration. per the Hearthstone law, gen folds second, after nova.
