-- gen connect ... migration 0001 ... initial schema
--
-- the foundation: companies, contacts, and the unibox (threads + messages).
-- forward-only and idempotent ... safe to re-run. no drops, no truncates.
-- every table is row-level-secured ... a user only ever touches their own rows.
--
-- gen_random_uuid() is core in postgres 13+, so no extension is needed here.


-- ===========================================================================
-- shared ... updated_at touch trigger
-- one function, reused by every table that carries an updated_at column.
-- ===========================================================================

create or replace function public.gen_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ===========================================================================
-- companies ... the org a contact belongs to
-- ===========================================================================

create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  domain      text,
  name        text,
  industry    text,
  size_range  text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.companies enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'companies'
      and policyname = 'own_companies'
  ) then
    create policy own_companies on public.companies
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create or replace trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.gen_set_updated_at();

create index if not exists companies_user on public.companies (user_id);


-- ===========================================================================
-- contacts ... the spine of the pipeline
-- ===========================================================================

create table if not exists public.contacts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  company_id      uuid references public.companies (id) on delete set null,
  email           text,
  linkedin_url    text,
  name            text,
  title           text,
  ai_score        numeric(3,1) not null default 0,
  warmth_score    numeric(3,1) not null default 0,
  stage           text not null default 'cold'
    check (stage in (
      'cold', 'enriched', 'drafted', 'sequenced',
      'replied', 'booked', 'closed', 'do_not_contact'
    )),
  source          text,
  tags            text[] not null default '{}',
  enrichment_data jsonb not null default '{}'::jsonb,
  last_action_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.contacts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contacts'
      and policyname = 'own_contacts'
  ) then
    create policy own_contacts on public.contacts
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create or replace trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.gen_set_updated_at();

create unique index if not exists contacts_user_email
  on public.contacts (user_id, lower(email))
  where email is not null;

create unique index if not exists contacts_user_linkedin
  on public.contacts (user_id, linkedin_url)
  where linkedin_url is not null;

create index if not exists contacts_stage
  on public.contacts (user_id, stage);

create index if not exists contacts_score
  on public.contacts (user_id, ai_score desc);

create index if not exists contacts_company
  on public.contacts (company_id);


-- ===========================================================================
-- unibox_threads ... one conversation with a contact
-- ===========================================================================

create table if not exists public.unibox_threads (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  contact_id      uuid references public.contacts (id) on delete set null,
  channel         text not null default 'email'
    check (channel in ('email', 'linkedin_dm', 'twitter_dm')),
  last_message_at timestamptz,
  unread_count    integer not null default 0,
  status          text not null default 'open'
    check (status in ('open', 'snoozed', 'archived', 'closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.unibox_threads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'unibox_threads'
      and policyname = 'own_threads'
  ) then
    create policy own_threads on public.unibox_threads
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create or replace trigger unibox_threads_set_updated_at
  before update on public.unibox_threads
  for each row execute function public.gen_set_updated_at();

create index if not exists unibox_threads_user
  on public.unibox_threads (user_id);

create index if not exists unibox_threads_contact
  on public.unibox_threads (contact_id);


-- ===========================================================================
-- unibox_messages ... a single message inside a thread
-- append-mostly, so no updated_at column and no touch trigger.
-- ===========================================================================

create table if not exists public.unibox_messages (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  thread_id         uuid not null references public.unibox_threads (id) on delete cascade,
  direction         text not null check (direction in ('inbound', 'outbound')),
  subject           text,
  body              text,
  message_id_header text,
  in_reply_to       text,
  sent_at           timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

alter table public.unibox_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'unibox_messages'
      and policyname = 'own_messages'
  ) then
    create policy own_messages on public.unibox_messages
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create index if not exists unibox_messages_thread
  on public.unibox_messages (thread_id, sent_at desc);

create index if not exists unibox_messages_user
  on public.unibox_messages (user_id);


-- next migration ... 0002. keep this file forward-only.
