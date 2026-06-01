-- gen connect ... v0.1.4 ... entitlements + usage ledger (the cost-protection layer)
--
-- two gen-owned tables behind the free/paid gate + the per-user/day spend
-- ceiling. gc_-prefixed, forward-only, idempotent, no drops.
--
-- SECURITY NOTE: these do NOT use the blanket `own_<table> for all` policy the
-- other gen tables use. that would let a user set their own tier='paid' or
-- delete their usage rows to dodge the ceiling. instead:
--   - gc_user_entitlements: the user may only SELECT their tier. it is written
--     by the system (service role / billing webhook on conversion), never by the
--     user. standalone signups have no row => the helper defaults them to free.
--   - gc_usage_events: the user may INSERT (their tools log spend) + SELECT
--     (read today's spend), but NOT update/delete ... so the ceiling can't be
--     reset by erasing rows. cleanup is service-role only.

-- the entitlement flag gen READS to gate paid actions. for the standalone gen
-- owns this; when integrated into LUNARI, getUserTier() re-points at LUNARI's
-- plan source instead. one row per user.
create table if not exists public.gc_user_entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  tier        text not null default 'free' check (tier in ('free', 'paid')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.gc_user_entitlements enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_user_entitlements'
      and policyname = 'gc_user_entitlements_select'
  ) then
    -- read-only to the user. writes are system-only (service role bypasses RLS),
    -- so a user can never escalate their own tier through the api.
    create policy gc_user_entitlements_select on public.gc_user_entitlements
      for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

create or replace trigger gc_user_entitlements_set_updated_at
  before update on public.gc_user_entitlements
  for each row execute function public.tg_set_updated_at();


-- the cost ledger. one row per money-costing tool call, so the daily spend
-- ceiling can sum a user's spend without trusting the client. append-only.
create table if not exists public.gc_usage_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null,            -- find_leads | verify_emails | enrich | bulk_enrich | draft_angles | send_email
  units       int  not null default 1,  -- e.g. emails verified, contacts enriched
  cost_cents  int  not null default 0,  -- estimated (or actual) marginal cost
  occurred_at timestamptz not null default now()
);

alter table public.gc_usage_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_usage_events'
      and policyname = 'gc_usage_events_insert'
  ) then
    -- the user's tools log their own spend ...
    create policy gc_usage_events_insert on public.gc_usage_events
      for insert to authenticated
      with check (user_id = (select auth.uid()));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_usage_events'
      and policyname = 'gc_usage_events_select'
  ) then
    -- ... and read it back to compute today's spend. no update/delete policy
    -- exists, so the ceiling cannot be gamed by erasing rows.
    create policy gc_usage_events_select on public.gc_usage_events
      for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

create index if not exists gc_usage_events_user_day
  on public.gc_usage_events (user_id, occurred_at);

-- next migration ... v0_1_5_gc_<feature>.sql. keep this file forward-only.
