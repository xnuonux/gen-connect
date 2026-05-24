-- gen connect ... v0.1.0 ... initial schema on shared LUNARI substrate
--
-- four tables, all gc_-prefixed. they live alongside cinema, factory i,
-- nova press, and the shared voice_profiles / user_profiles substrate on
-- the LUNARI project (fpposmirumtbocqtxued).
--
-- forward-only and idempotent ... safe to re-run. no drops, no truncates.
-- every table is row-level-secured ... a user only ever touches their own
-- rows. cross-product fks are limited to auth.users(id); voice_profiles
-- and user_profiles are joined application-side, never with a hard fk
-- pointing into them.
--
-- updated_at triggers reuse the shared public.tg_set_updated_at() function
-- defined by lunari strategy in v17_8_6 ... SECURITY DEFINER with a hardened
-- search_path. we do not redefine it here.


-- ===========================================================================
-- gc_companies ... the org a contact belongs to
-- ===========================================================================

create table if not exists public.gc_companies (
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

alter table public.gc_companies enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_companies'
      and policyname = 'own_gc_companies'
  ) then
    create policy own_gc_companies on public.gc_companies
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create or replace trigger gc_companies_set_updated_at
  before update on public.gc_companies
  for each row execute function public.tg_set_updated_at();

create index if not exists gc_companies_user
  on public.gc_companies (user_id);


-- ===========================================================================
-- gc_contacts ... the spine of the pipeline
-- ===========================================================================

create table if not exists public.gc_contacts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  company_id      uuid references public.gc_companies (id) on delete set null,
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

alter table public.gc_contacts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_contacts'
      and policyname = 'own_gc_contacts'
  ) then
    create policy own_gc_contacts on public.gc_contacts
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create or replace trigger gc_contacts_set_updated_at
  before update on public.gc_contacts
  for each row execute function public.tg_set_updated_at();

create unique index if not exists gc_contacts_user_email
  on public.gc_contacts (user_id, lower(email))
  where email is not null;

create unique index if not exists gc_contacts_user_linkedin
  on public.gc_contacts (user_id, linkedin_url)
  where linkedin_url is not null;

create index if not exists gc_contacts_stage
  on public.gc_contacts (user_id, stage);

create index if not exists gc_contacts_score
  on public.gc_contacts (user_id, ai_score desc);

create index if not exists gc_contacts_company
  on public.gc_contacts (company_id);


-- ===========================================================================
-- gc_unibox_threads ... one conversation with a contact
-- ===========================================================================

create table if not exists public.gc_unibox_threads (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  contact_id      uuid references public.gc_contacts (id) on delete set null,
  channel         text not null default 'email'
    check (channel in ('email', 'linkedin_dm', 'twitter_dm')),
  last_message_at timestamptz,
  unread_count    integer not null default 0,
  status          text not null default 'open'
    check (status in ('open', 'snoozed', 'archived', 'closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.gc_unibox_threads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_unibox_threads'
      and policyname = 'own_gc_unibox_threads'
  ) then
    create policy own_gc_unibox_threads on public.gc_unibox_threads
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create or replace trigger gc_unibox_threads_set_updated_at
  before update on public.gc_unibox_threads
  for each row execute function public.tg_set_updated_at();

create index if not exists gc_unibox_threads_user
  on public.gc_unibox_threads (user_id);

create index if not exists gc_unibox_threads_contact
  on public.gc_unibox_threads (contact_id);


-- ===========================================================================
-- gc_unibox_messages ... a single message inside a thread
-- append-mostly, so no updated_at column and no touch trigger.
-- ===========================================================================

create table if not exists public.gc_unibox_messages (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  thread_id         uuid not null references public.gc_unibox_threads (id) on delete cascade,
  direction         text not null check (direction in ('inbound', 'outbound')),
  subject           text,
  body              text,
  message_id_header text,
  in_reply_to       text,
  sent_at           timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

alter table public.gc_unibox_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_unibox_messages'
      and policyname = 'own_gc_unibox_messages'
  ) then
    create policy own_gc_unibox_messages on public.gc_unibox_messages
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create index if not exists gc_unibox_messages_thread
  on public.gc_unibox_messages (thread_id, sent_at desc);

create index if not exists gc_unibox_messages_user
  on public.gc_unibox_messages (user_id);


-- next migration ... v0_1_1_gc_<feature>.sql. keep this file forward-only.
