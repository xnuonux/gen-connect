-- gen connect ... v0.1.12 ... jurisdiction fields on the contact spine
--
-- APPLIED to prod (fpposmirumtbocqtxued). additive, idempotent, forward-only.
-- two new columns on gc_contacts so the cold-send path can run the gdpr/eprivacy
-- hard-gate: `country` (enrichment fills it; iso-2 or a name we normalize) and
-- `jurisdiction_consent` (the user marks it when they have a lawful basis for a
-- strict-opt-in country). rls is unchanged ... the existing own_gc_contacts
-- policy already covers every column on the row.

alter table public.gc_contacts
  add column if not exists country text;

alter table public.gc_contacts
  add column if not exists jurisdiction_consent boolean not null default false;

-- next migration ... v0_1_13_gc_<feature>.sql. keep this file forward-only.
