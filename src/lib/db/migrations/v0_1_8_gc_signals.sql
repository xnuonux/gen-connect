-- gen connect ... v0.1.8 ... the signal layer schema (the gojiberry-beater)
--
-- STAGED, NOT YET APPLIED. a production migration to the shared substrate needs
-- dom's explicit per-migration approval (the auto-mode classifier blocks it
-- otherwise, by design). this file is written + reviewed; apply it via the
-- Supabase MCP apply_migration once approved, then run get_advisors (security).
--
-- the engine that reads these tables already ships + is fixture-verified:
-- lib/signals/flame.ts (the flame floor), lib/triggers/evaluate.ts (the jsonb
-- predicate), lib/triggers/cooldown.ts (7-day coalesce), lib/types/signal.ts
-- (the taxonomy). this migration gives them somewhere to persist. see
-- docs/06-signals-spec.md for the full doctrine + docs/08 for the strategy.
--
-- the signal_type CHECK lists the FULL taxonomy on purpose ... it is baked into
-- the constraint AND the haiku/flame contract, so widening it later never costs
-- a migration (spec it wide once, build the actors incrementally). v1 builds the
-- creator-intent core (searching_for, tool_mention, product_launch) + the founder
-- lane (promotion, funding_round); the rest are enum-valid, actor-pending.
--
-- RLS: blanket own-row policy on all four (the user owns + tunes their own
-- agents/hits/dismissals/triggers). additive only, idempotent, forward-only.

-- ---- gc_signal_agents: one row per running signal source --------------------
create table if not exists public.gc_signal_agents (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  name             text not null,
  signal_type      text not null check (signal_type in (
                     'searching_for','tool_mention','product_launch',
                     'promotion','funding_round',
                     'engaged_with_content','mentioned_you','competitor_follow',
                     'competitor_switch','hiring','role_change','content_post',
                     'company_news')),
  icp              jsonb not null default '{}'::jsonb,   -- industry[]/size[]/geo[]/role[]/title_*
  objective        jsonb not null default '{}'::jsonb,   -- { goal, pain_points[], tone } (5-angle anchor)
  ramp             jsonb not null default '{}'::jsonb,   -- { max_hits_per_day, soft_cap, time_windows }
  score_threshold  numeric not null default 0.5,         -- surfaced as a 0-100 precision slider
  max_cost_cents_per_day int,                            -- per-agent apify spend cap (null = uncapped)
  apify_actor_id   text,
  apify_run_config jsonb,
  status           text not null default 'active' check (status in ('active','paused','archived')),
  last_ran_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---- gc_signal_hits: one row per detected + scored event --------------------
create table if not exists public.gc_signal_hits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  agent_id      uuid not null references public.gc_signal_agents (id) on delete cascade,
  contact_id    uuid references public.gc_contacts (id) on delete set null,
  signal_type   text not null,                           -- denormalized from the agent
  raw           jsonb not null default '{}'::jsonb,      -- the normalized payload (the drafter reads this)
  ai_score      numeric(3,2),                            -- 0.00-1.00, null until scored
  ai_rationale  text,
  status        text not null default 'pending' check (status in
                  ('pending','scored','actioned','dismissed','expired','aged_out')),
  detected_at   timestamptz not null default now(),
  scored_at     timestamptz,
  actioned_at   timestamptz,
  draft_id      uuid references public.gc_drafts (id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ---- gc_signal_dismissals: the feedback loop's ledger -----------------------
create table if not exists public.gc_signal_dismissals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  hit_id      uuid not null references public.gc_signal_hits (id) on delete cascade,
  reason      text not null check (reason in (
                'wrong_industry','wrong_role','wrong_timing','already_contacted',
                'low_quality_data','not_a_fit','other')),
  notes       text,
  learned     jsonb,                                     -- the weekly refinement job writes here
  created_at  timestamptz not null default now()
);

-- ---- gc_triggers: the rules engine -----------------------------------------
create table if not exists public.gc_triggers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  kind          text not null check (kind in ('signal','event','time','manual')),
  condition     jsonb not null default '{}'::jsonb,      -- the predicate (lib/triggers/evaluate reads this)
  action        jsonb not null default '{}'::jsonb,      -- { kind:'enroll_in_sequence', sequence_id, ... }
  priority      int not null default 100,
  status        text not null default 'active' check (status in ('active','paused','dry_run','archived')),
  fire_count    int not null default 0,
  last_fired_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---- contact provenance: why a contact is in the pipeline -------------------
-- the breadcrumb fold (docs/00) ... the pipeline card + contact rail read these.
alter table public.gc_contacts
  add column if not exists source_signal_id uuid references public.gc_signal_hits (id) on delete set null;
alter table public.gc_contacts
  add column if not exists source_trigger_id uuid references public.gc_triggers (id) on delete set null;

-- ---- RLS: blanket own-row on all four --------------------------------------
alter table public.gc_signal_agents enable row level security;
alter table public.gc_signal_hits enable row level security;
alter table public.gc_signal_dismissals enable row level security;
alter table public.gc_triggers enable row level security;

do $$
declare t text;
begin
  foreach t in array array['gc_signal_agents','gc_signal_hits','gc_signal_dismissals','gc_triggers']
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

-- ---- updated_at triggers (shared hardened fn) ------------------------------
create or replace trigger gc_signal_agents_set_updated_at
  before update on public.gc_signal_agents
  for each row execute function public.tg_set_updated_at();
create or replace trigger gc_triggers_set_updated_at
  before update on public.gc_triggers
  for each row execute function public.tg_set_updated_at();

-- ---- indexes ---------------------------------------------------------------
create index if not exists gc_signal_agents_user_status
  on public.gc_signal_agents (user_id, status);
create index if not exists gc_signal_hits_user_status
  on public.gc_signal_hits (user_id, status);
create index if not exists gc_signal_hits_user_score
  on public.gc_signal_hits (user_id, ai_score desc);
create index if not exists gc_signal_hits_agent_detected
  on public.gc_signal_hits (agent_id, detected_at desc);
-- dedupe within an agent on the source's stable id
create unique index if not exists gc_signal_hits_agent_source
  on public.gc_signal_hits (agent_id, (raw->>'source_id'))
  where raw ? 'source_id';
create index if not exists gc_signal_dismissals_hit
  on public.gc_signal_dismissals (hit_id);
create index if not exists gc_triggers_user_status
  on public.gc_triggers (user_id, status);
create index if not exists gc_contacts_source_signal
  on public.gc_contacts (source_signal_id) where source_signal_id is not null;

-- next migration ... v0_1_9_gc_<feature>.sql. keep this file forward-only.
