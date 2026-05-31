-- gen connect ... v0.1.2 ... enrichment traces (the waterfall audit log)
--
-- one append-only row per provider call in the enrichment waterfall ...
-- path A (single lead, hot, on-demand) and path B (bulk ICP discovery).
-- lets every enrichment dollar be traced from the contact back to the source
-- + the cost. gc_-prefixed, RLS'd, on the shared LUNARI substrate. forward
-- only, idempotent, no drops.
--
-- append-only like gc_unibox_messages ... no updated_at, no touch trigger.
-- contact_id is nullable ... a path B bulk pull can trace a provider call
-- before a contact row exists for the lead.

create table if not exists public.gc_enrichment_traces (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  contact_id      uuid references public.gc_contacts (id) on delete cascade,
  source          text not null
    check (source in (
      'perplexity_sonar', 'apify_linkedin', 'apollo', 'crawl4ai',
      'apify_leads_finder', 'email_verifier', 'manual'
    )),
  path            text not null default 'path_a'
    check (path in ('path_a', 'path_b')),
  status          text not null default 'ok'
    check (status in ('ok', 'skipped', 'error', 'needs_manual')),
  cost_cents      numeric(8,4) not null default 0,
  fields_returned jsonb not null default '{}'::jsonb,
  raw_payload     jsonb not null default '{}'::jsonb,
  error           text,
  created_at      timestamptz not null default now()
);

alter table public.gc_enrichment_traces enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_enrichment_traces'
      and policyname = 'own_gc_enrichment_traces'
  ) then
    create policy own_gc_enrichment_traces on public.gc_enrichment_traces
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create index if not exists gc_enrichment_traces_contact
  on public.gc_enrichment_traces (contact_id, created_at desc);

create index if not exists gc_enrichment_traces_user
  on public.gc_enrichment_traces (user_id, created_at desc);

-- next migration ... v0_1_3_gc_<feature>.sql. keep this file forward-only.
