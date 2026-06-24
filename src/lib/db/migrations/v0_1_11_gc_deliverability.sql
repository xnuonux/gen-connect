-- gen connect ... v0.1.11 ... the deliverability spine (suppression + events)
--
-- APPLIED to prod (fpposmirumtbocqtxued). additive, idempotent, forward-only.
-- two gc_-prefixed tables, both RLS own-row. they live alongside cinema, nova
-- press, and the shared voice_profiles / user_profiles substrate.
--
-- gc_suppression ... the global do-not-send list per user. a hard bounce, a
-- complaint, or an unsubscribe lands a row; the send path checks it before EVERY
-- send and refuses if a match exists. unique per (user, lower(email)) so
-- re-suppression is idempotent ... you cannot un-suppress by racing two events.
--
-- gc_deliverability_events ... the raw event ledger behind the deliverability
-- dashboard + the auto-pause math (bounce rate, complaint rate). one row per
-- provider event (resend webhook), deduped on (user, external_id, event_type)
-- so a redelivered webhook never double-counts. forward-only, no drops.

create table if not exists public.gc_suppression (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  email       text not null,
  reason      text not null default 'manual'
                check (reason in ('hard_bounce','complaint','unsubscribe','manual')),
  source      text,
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.gc_suppression enable row level security;

create table if not exists public.gc_deliverability_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  contact_id   uuid references public.gc_contacts (id) on delete set null,
  sequence_id  uuid references public.gc_sequences (id) on delete set null,
  event_type   text not null check (event_type in (
                 'sent','delivered','bounced','complained','opened','clicked',
                 'delivery_delayed','unsubscribed')),
  email        text,
  message_id   text,
  external_id  text,
  occurred_at  timestamptz not null default now(),
  raw          jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

alter table public.gc_deliverability_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['gc_suppression','gc_deliverability_events']
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'own_' || t
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
        'own_' || t, t
      );
    end if;
  end loop;
end $$;

-- idempotent re-suppression: one row per (user, email).
create unique index if not exists gc_suppression_user_email
  on public.gc_suppression (user_id, lower(email));

-- webhook idempotency: a redelivered provider event never double-counts.
create unique index if not exists gc_deliverability_events_dedupe
  on public.gc_deliverability_events (user_id, external_id, event_type)
  where external_id is not null;

-- the dashboard reads (user, occurred_at desc); the rate math reads by type.
create index if not exists gc_deliverability_events_user_occurred
  on public.gc_deliverability_events (user_id, occurred_at desc);
create index if not exists gc_deliverability_events_user_type
  on public.gc_deliverability_events (user_id, event_type);
create index if not exists gc_deliverability_events_contact
  on public.gc_deliverability_events (contact_id);

-- next migration ... v0_1_12_gc_<feature>.sql. keep this file forward-only.
