# database

postgres schema + seed for gen connect. lives on the shared LUNARI substrate
(`fpposmirumtbocqtxued`) alongside cinema, factory i, nova press, and the
shared `voice_profiles` / `user_profiles` tables. supabase manages auth,
postgres, and row level security.

## layout

- `migrations/` ... gc-prefixed, semver-named, forward-only schema migrations
- `seed.sql` ... demo data for local development

## naming convention

every gen connect table is prefixed `gc_`. migrations are named
`vX_Y_Z_gc_<feature>.sql` on gen connect's own semver, starting at `v0.1.0`
and walking toward `v1.0.0`. nova press uses `np_` on the same pattern.

cross-product foreign keys are limited to:

- `auth.users(id)` on every `user_id` column
- `public.voice_profiles(user_id)` and `public.user_profiles(user_id)` are
  joined application-side, never with a hard fk pointing in. read-only from
  most of the code; the drafting engine reads `outreach_overrides` + base
  columns; the magic-link callback writes the gen-owned columns on
  `user_profiles`.

## migration discipline

- forward-only ... no DROP, no TRUNCATE, idempotent so a re-run is safe
- every table enables RLS with an `own_gc_<table>` policy scoping access to
  `user_id = (select auth.uid())`
- updated_at triggers reuse the shared `public.tg_set_updated_at()` function
  (defined by lunari strategy with SECURITY DEFINER and a hardened
  search_path). do not redefine it locally.
- a new table always ships its RLS in the same migration

## applying a migration

through the supabase MCP, `apply_migration` records it:

- project_id: `fpposmirumtbocqtxued`
- name: the file name without extension, e.g. `v0_1_0_gc_initial`
- query: the file contents

after applying, run `get_advisors` (security) ... it flags any table that
landed without RLS.

## seeding

`seed.sql` fills the pipeline with ~30 companies and 1000 contacts so the
kanban has something to move.

1. the demo user must exist first. sign in once at `/login` through the
   magic link ... that mints the row in `auth.users` and the gen-connect
   callback upserts the matching `user_profiles` row.
2. run `seed.sql` through the supabase MCP `execute_sql` tool.
3. it resolves the user by email, clears any prior seed, then re-inserts.

re-running is safe. seeded contacts carry `source = 'seed'`, so the script
finds and replaces them without touching anything else.

## column-ownership in voice_profiles

application-level discipline, since RLS cannot gate columns natively:

- gen connect writes `outreach_overrides`, `outreach_samples_count`,
  `active_for_outreach`
- nova press writes `writing_overrides`, `writing_samples_count`,
  `active_for_writing`
- base columns (register, punctuation_style, sentence_length_*, opening_*,
  closing_*, avoided_phrases, idiosyncratic_phrases, emoji_signature,
  formality_score, vocabulary_signature, paragraph_length_*) are
  last-writer-wins on extraction
- `extraction_history` is append-only by both products, trimmed to the
  last 5 entries in the extraction job
