-- gen connect ... v0.1.5 ... harden the usage ledger against ceiling-gaming
--
-- gc_usage_events.cost_cents had no value constraint. the insert RLS policy only
-- checks ownership (user_id = auth.uid()), and the session client uses the anon
-- key ... so a user holding their own jwt could POST a NEGATIVE cost_cents row
-- straight to PostgREST, driving todaysSpendCents() negative so the daily spend
-- ceiling never trips. the Math.max(0,..) clamp in recordUsage() is app-side and
-- bypassed by a raw rest call. close it at the database: a non-negative check
-- defends regardless of the write path. forward-only, idempotent.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'gc_usage_events_cost_nonneg'
  ) then
    alter table public.gc_usage_events
      add constraint gc_usage_events_cost_nonneg
      check (cost_cents >= 0 and units >= 0);
  end if;
end $$;

-- next migration ... v0_1_6_gc_<feature>.sql. keep this file forward-only.
