# database

postgres schema + seed for gen connect. supabase manages auth, postgres, and
row level security.

## layout

- `migrations/` ... numbered, forward-only schema migrations
- `seed.sql` ... demo data for local development

## migration convention

- numbered `NNNN_name.sql`, applied in order
- forward-only ... no DROP, no TRUNCATE, idempotent so a re-run is safe
- every table enables RLS with an `own_<table>` policy scoping access to
  `user_id = auth.uid()`
- a new table always ships its RLS in the same migration

## applying a migration

through the supabase MCP, `apply_migration` records it:

- name: the file name without extension, e.g. `0001_init`
- query: the file contents

or with the supabase CLI: `supabase db push`.

after applying, run `get_advisors` (security) ... it flags any table that
landed without RLS.

## seeding

`seed.sql` fills the pipeline with ~30 companies and 1000 contacts so the
kanban has something to move.

1. the demo user must exist first. sign in once at `/login` through the magic
   link ... that mints the row in `auth.users`.
2. run `seed.sql` through the supabase MCP `execute_sql` tool.
3. it resolves the user by email, clears any prior seed, then re-inserts.

re-running is safe. seeded contacts carry `source = 'seed'`, so the script
finds and replaces them without touching anything else.
