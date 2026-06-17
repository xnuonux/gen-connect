-- gen connect ... v0.1.10 ... the sequences layer (visual sequence editor)
-- APPLIED to prod (fpposmirumtbocqtxued) with dom's approval. verified RLS own-row
-- on all three. additive, idempotent, forward-only.
--
-- the editor saves a graph jsonb to gc_sequences; gc_sequence_versions snapshots
-- on each save (enrolled contacts finish on their pinned version); gc_sequence_
-- enrollments is for the pg-boss executor (railway, deferred) ... it lands now so
-- wiring execution later never costs a migration. see .claude/skills/xyflow-sequences.

create table if not exists public.gc_sequences (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  status        text not null default 'draft'
                  check (status in ('draft','active','paused','archived')),
  graph         jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  version       int not null default 1,
  enrolled_count int not null default 0,
  reply_count   int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.gc_sequence_versions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  sequence_id uuid not null references public.gc_sequences (id) on delete cascade,
  version     int not null,
  graph       jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.gc_sequence_enrollments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  sequence_id     uuid not null references public.gc_sequences (id) on delete cascade,
  contact_id      uuid not null references public.gc_contacts (id) on delete cascade,
  version         int not null default 1,
  current_node_id text,
  status          text not null default 'active'
                    check (status in ('active','completed','paused','failed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.gc_sequences enable row level security;
alter table public.gc_sequence_versions enable row level security;
alter table public.gc_sequence_enrollments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['gc_sequences','gc_sequence_versions','gc_sequence_enrollments']
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

create or replace trigger gc_sequences_set_updated_at
  before update on public.gc_sequences
  for each row execute function public.tg_set_updated_at();
create or replace trigger gc_sequence_enrollments_set_updated_at
  before update on public.gc_sequence_enrollments
  for each row execute function public.tg_set_updated_at();

create index if not exists gc_sequences_user_status
  on public.gc_sequences (user_id, status);
create index if not exists gc_sequence_versions_seq
  on public.gc_sequence_versions (sequence_id, version desc);
create index if not exists gc_sequence_enrollments_seq
  on public.gc_sequence_enrollments (sequence_id);
create index if not exists gc_sequence_enrollments_contact
  on public.gc_sequence_enrollments (contact_id);