-- gen connect ... v0.1.19 ... per-user settings (first resident: the cal.com
-- booking link)
--
-- one row per user, keyed on user_id, for prefs that do not deserve their own
-- table. calcom_booking_url is the link the user drops into outreach; when a
-- lead books, the calcom webhook fires and the contact moves to booked + a
-- meeting_booked outcome lands ... the same effect as the unibox's "mark
-- booked" button, no human click. gc_-prefixed, forward-only, no drops.
--
-- SECURITY: the user owns their row end to end (select/insert/update), same
-- posture as gc_sending_domains. nothing secret lives here ... the booking url
-- is the user's own PUBLIC link. the webhook never reads this table (it
-- resolves the booked contact by attendee email through the service role), so
-- no service policy is needed.

create table if not exists public.gc_user_settings (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  calcom_booking_url text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.gc_user_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_user_settings'
      and policyname = 'own_gc_user_settings'
  ) then
    -- the user reads + writes their own settings row; nobody else's.
    create policy own_gc_user_settings on public.gc_user_settings
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create or replace trigger gc_user_settings_set_updated_at
  before update on public.gc_user_settings
  for each row execute function public.tg_set_updated_at();

-- next migration ... v0_1_20_gc_<feature>.sql. keep this file forward-only.
