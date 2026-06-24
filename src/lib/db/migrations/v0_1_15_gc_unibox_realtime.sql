-- gen connect ... v0.1.15 ... add the unibox tables to the supabase_realtime
-- publication so a reply threads in LIVE ... the inbound webhook inserts the
-- message (service role), and the owning user's authed channel receives it
-- (rls scopes which rows reach which client). additive, idempotent, forward-only.
--
-- APPLIED to prod (fpposmirumtbocqtxued). the client side is
-- src/app/(app)/unibox/UniboxView.tsx (a postgres_changes channel on INSERT that
-- invalidates the thread + transcript queries). mirrors v0_1_9 for signals.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gc_unibox_messages'
  ) then
    alter publication supabase_realtime add table public.gc_unibox_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gc_unibox_threads'
  ) then
    alter publication supabase_realtime add table public.gc_unibox_threads;
  end if;
end $$;
