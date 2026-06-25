-- gen connect ... v0.1.16 ... billing subscriptions (the stripe record)
--
-- one gen-owned table recording each user's stripe subscription state. it is the
-- audit + the ui's "what plan am i on"; the GATE itself stays gc_user_entitlements
-- .tier (flipped in the same webhook write). gc_-prefixed, forward-only, no drops.
--
-- SECURITY: same posture as gc_user_entitlements ... the user may only SELECT their
-- own row. writes are system-only (the stripe webhook, via the service role, which
-- bypasses rls). there is NO insert/update/delete policy, so a user can never forge
-- a subscription or self-escalate ... the entitlement flip is unreachable from the
-- client, exactly like the tier flag it mirrors.

create table if not exists public.gc_billing_subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null unique references auth.users (id) on delete cascade,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  plan                    text,   -- 'creator' | 'pro' (free has no subscription)
  status                  text,   -- the stripe subscription status, verbatim
  current_period_end      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.gc_billing_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_billing_subscriptions'
      and policyname = 'gc_billing_subscriptions_select'
  ) then
    -- read-only to the user (the billing ui reads their plan). writes are
    -- service-role only, so the subscription record can't be self-minted.
    create policy gc_billing_subscriptions_select on public.gc_billing_subscriptions
      for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

-- the webhook resolves user_id from the customer id on subscription.* events.
create index if not exists gc_billing_subscriptions_customer
  on public.gc_billing_subscriptions (stripe_customer_id);

create or replace trigger gc_billing_subscriptions_set_updated_at
  before update on public.gc_billing_subscriptions
  for each row execute function public.tg_set_updated_at();

-- next migration ... v0_1_17_gc_<feature>.sql. keep this file forward-only.
