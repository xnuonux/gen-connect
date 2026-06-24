-- gen connect ... v0.1.14 ... sending domains (the spf/dkim/dmarc wizard)
--
-- APPLIED to prod (fpposmirumtbocqtxued). additive, idempotent, forward-only.
-- the spec'd sending_domains table, finally real. without authenticated dns
-- (spf + dkim + dmarc) the 2024 google/yahoo/microsoft rules reject every send
-- at the smtp level ... this is the launch-gate the research flagged as the
-- single highest-leverage missing piece. one row per domain the user sends from,
-- with the live per-record verification state the wizard writes.
--
-- resend sends via SES: spf + mx live on the `send.<domain>` subdomain, dkim on
-- `resend._domainkey.<domain>`, dmarc on `_dmarc.<domain>`. resend_domain_id +
-- dkim_host are filled when the resend-api enrichment lands (graceful-degrade).

create table if not exists public.gc_sending_domains (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  domain            text not null,
  provider          text not null default 'resend',
  spf_verified      boolean not null default false,
  dkim_verified     boolean not null default false,
  dmarc_verified    boolean not null default false,
  dmarc_policy      text,
  status            text not null default 'pending'
                      check (status in ('pending','verified','failed','paused')),
  daily_cap         int not null default 50,
  warmup_started_at timestamptz,
  last_checked_at   timestamptz,
  resend_domain_id  text,
  dkim_host         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.gc_sending_domains enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_sending_domains'
      and policyname = 'own_gc_sending_domains'
  ) then
    create policy own_gc_sending_domains on public.gc_sending_domains
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create or replace trigger gc_sending_domains_set_updated_at
  before update on public.gc_sending_domains
  for each row execute function public.tg_set_updated_at();

create unique index if not exists gc_sending_domains_user_domain
  on public.gc_sending_domains (user_id, lower(domain));
create index if not exists gc_sending_domains_user
  on public.gc_sending_domains (user_id);

-- next migration ... v0_1_15_gc_<feature>.sql. keep this file forward-only.
