-- gen connect ... v0.1.1 ... the 5-angle drafting engine
--
-- four tables, gc_-prefixed, on the shared LUNARI substrate
-- (fpposmirumtbocqtxued). they hang off gc_contacts and hold the closer
-- instinct output: 5 angles per cold first-touch, the self-judge scores,
-- and the send/open/reply/book outcomes the weekly learning loop reads.
--
-- forward-only and idempotent ... safe to re-run. no drops, no truncates.
-- every table is row-level-secured to its owner. updated_at triggers reuse
-- the shared public.tg_set_updated_at() defined by lunari strategy ... we
-- never redefine it.
--
-- winning_angle_id / user_override_angle_id on gc_drafts are plain uuids,
-- not hard fks into gc_draft_angles. a draft points at its winning angle
-- and an angle points back at its draft ... a hard fk both ways is a
-- circular dependency that fights insert ordering. the angle + score rows
-- fk back to the draft, which is the real ownership spine; the winning
-- pointer is enforced application-side.


-- ===========================================================================
-- gc_drafts ... one 5-angle generation set for a contact
-- ===========================================================================

create table if not exists public.gc_drafts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  contact_id             uuid not null references public.gc_contacts (id) on delete cascade,
  objective              jsonb not null default '{}'::jsonb,
  status                 text not null default 'generated'
    check (status in ('generating', 'generated', 'judged', 'sent', 'failed')),
  winning_angle_id       uuid,
  user_override_angle_id uuid,
  generation_model       text,
  judge_model            text,
  cost_cents             numeric(8,2) not null default 0,
  generated_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.gc_drafts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_drafts'
      and policyname = 'own_gc_drafts'
  ) then
    create policy own_gc_drafts on public.gc_drafts
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create or replace trigger gc_drafts_set_updated_at
  before update on public.gc_drafts
  for each row execute function public.tg_set_updated_at();

create index if not exists gc_drafts_user
  on public.gc_drafts (user_id);

create index if not exists gc_drafts_contact
  on public.gc_drafts (contact_id, created_at desc);


-- ===========================================================================
-- gc_draft_angles ... the 5 distinct angles in a draft
-- ===========================================================================

create table if not exists public.gc_draft_angles (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  draft_id              uuid not null references public.gc_drafts (id) on delete cascade,
  angle_type            text not null
    check (angle_type in (
      'shared_context', 'outcome_promise', 'provocation',
      'utility_offer', 'curiosity_hook'
    )),
  position              integer not null default 0,
  subject               text not null,
  body                  text not null,
  rationale             text,
  confidence_self_rated numeric(3,1) not null default 0,
  created_at            timestamptz not null default now()
);

alter table public.gc_draft_angles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_draft_angles'
      and policyname = 'own_gc_draft_angles'
  ) then
    create policy own_gc_draft_angles on public.gc_draft_angles
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create index if not exists gc_draft_angles_draft
  on public.gc_draft_angles (draft_id, position);

create index if not exists gc_draft_angles_user
  on public.gc_draft_angles (user_id);

-- one row per angle type per draft ... the engine produces exactly five.
create unique index if not exists gc_draft_angles_draft_type
  on public.gc_draft_angles (draft_id, angle_type);


-- ===========================================================================
-- gc_draft_judge_scores ... one self-judge score row per angle
-- five axes, 0-10. weighted_total carries voice_match x 1.5.
-- ===========================================================================

create table if not exists public.gc_draft_judge_scores (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  draft_id            uuid not null references public.gc_drafts (id) on delete cascade,
  angle_id            uuid not null references public.gc_draft_angles (id) on delete cascade,
  relevance           numeric(3,1) not null default 0,
  voice_match         numeric(3,1) not null default 0,
  opening_strength    numeric(3,1) not null default 0,
  ask_clarity         numeric(3,1) not null default 0,
  expected_reply_rate numeric(3,1) not null default 0,
  weighted_total      numeric(5,2) not null default 0,
  evidence            jsonb not null default '{}'::jsonb,
  is_winner           boolean not null default false,
  judge_model         text,
  created_at          timestamptz not null default now()
);

alter table public.gc_draft_judge_scores enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_draft_judge_scores'
      and policyname = 'own_gc_draft_judge_scores'
  ) then
    create policy own_gc_draft_judge_scores on public.gc_draft_judge_scores
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create index if not exists gc_draft_judge_scores_draft
  on public.gc_draft_judge_scores (draft_id);

create unique index if not exists gc_draft_judge_scores_angle
  on public.gc_draft_judge_scores (angle_id);


-- ===========================================================================
-- gc_draft_outcomes ... send/open/reply/book per angle.
-- the weekly learning loop reads this to bias the next generation.
-- ===========================================================================

create table if not exists public.gc_draft_outcomes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  draft_id   uuid not null references public.gc_drafts (id) on delete cascade,
  angle_id   uuid references public.gc_draft_angles (id) on delete set null,
  sent_at    timestamptz,
  opened     boolean not null default false,
  clicked    boolean not null default false,
  replied    boolean not null default false,
  booked     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gc_draft_outcomes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'gc_draft_outcomes'
      and policyname = 'own_gc_draft_outcomes'
  ) then
    create policy own_gc_draft_outcomes on public.gc_draft_outcomes
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

create or replace trigger gc_draft_outcomes_set_updated_at
  before update on public.gc_draft_outcomes
  for each row execute function public.tg_set_updated_at();

create index if not exists gc_draft_outcomes_draft
  on public.gc_draft_outcomes (draft_id);

create index if not exists gc_draft_outcomes_user
  on public.gc_draft_outcomes (user_id);


-- next migration ... v0_1_2_gc_<feature>.sql. keep this file forward-only.
