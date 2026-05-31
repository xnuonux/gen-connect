-- gen connect ... v0.1.3 ... gen copilot memory (the forever-thread)
--
-- one ongoing conversation per user, persisted + RLS'd, with a running
-- compaction summary so the thread remembers everything without the context
-- (or the bill) growing unbounded. gc_-prefixed, idempotent, no drops.

create table if not exists public.gc_gen_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  summary     text,
  status      text not null default 'active'
    check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.gc_gen_conversations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_gen_conversations'
      and policyname = 'own_gc_gen_conversations'
  ) then
    create policy own_gc_gen_conversations on public.gc_gen_conversations
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create or replace trigger gc_gen_conversations_set_updated_at
  before update on public.gc_gen_conversations
  for each row execute function public.tg_set_updated_at();

-- one active conversation per user ... the single forever-thread.
create unique index if not exists gc_gen_conversations_one_active
  on public.gc_gen_conversations (user_id)
  where status = 'active';


create table if not exists public.gc_gen_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null
    references public.gc_gen_conversations (id) on delete cascade,
  msg_id          text not null,   -- the useChat message id, for idempotent upsert
  role            text not null check (role in ('user', 'assistant')),
  parts           jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

alter table public.gc_gen_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_gen_messages'
      and policyname = 'own_gc_gen_messages'
  ) then
    create policy own_gc_gen_messages on public.gc_gen_messages
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- idempotent persistence ... re-sending the same useChat message is a no-op.
create unique index if not exists gc_gen_messages_unique
  on public.gc_gen_messages (conversation_id, msg_id);

create index if not exists gc_gen_messages_conversation
  on public.gc_gen_messages (conversation_id, created_at);

-- next migration ... v0_1_4_gc_<feature>.sql. keep this file forward-only.
