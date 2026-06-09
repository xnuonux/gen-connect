-- gen connect ... v0.1.7 ... the dollars-not-fuel revenue ledger
--
-- the hero stat ("$X in opportunities since launch") is the reframe that beats
-- instantly's open-rate vanity ... the tool should feel like it prints money, not
-- burns credits. that number sums THIS table. one row per real outcome the user
-- logs (a booking, a closed deal, a stream-revenue spike), tied to the contact +
-- the draft that earned it for per-source attribution.
--
-- the event_type taxonomy is creator-flavored on purpose (gig/stream/merch sit
-- next to deal/meeting/lead) ... it tells you who the icp is. folded from outreach
-- v2's outcome_events.
--
-- RLS is the blanket own-row policy (for all): unlike gc_usage_events (which gates
-- spend, so writes are locked down), this is the user's OWN motivational tally ...
-- inflating it only fools themselves, so there's no gaming surface to defend.
-- forward-only, idempotent, no drops.

create table if not exists public.gc_outcome_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  contact_id      uuid references public.gc_contacts (id) on delete set null,
  source_draft_id uuid references public.gc_drafts (id) on delete set null,
  event_type      text not null check (event_type in (
                    'gig_booked','subscriber_acquired','stream_revenue','merch_sale',
                    'lead_qualified','meeting_booked','deal_closed')),
  dollar_value    numeric(12,2) not null default 0 check (dollar_value >= 0),
  note            text,
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

alter table public.gc_outcome_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_outcome_events'
      and policyname = 'own_gc_outcome_events'
  ) then
    create policy own_gc_outcome_events on public.gc_outcome_events
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- the hero sum reads (user_id, occurred_at desc); the contact timeline reads by
-- contact.
create index if not exists gc_outcome_events_user_occurred
  on public.gc_outcome_events (user_id, occurred_at desc);
create index if not exists gc_outcome_events_contact
  on public.gc_outcome_events (contact_id);

-- next migration ... v0_1_8_gc_<feature>.sql. keep this file forward-only.
