-- gen connect ... v0.1.9 ... add gc_signal_hits to the supabase_realtime
-- publication so the /signals feed lights up the instant a hit lands ("while
-- you sleep"). additive, idempotent, forward-only. RLS still scopes which rows
-- a client receives over the socket.
--
-- APPLIED to prod (fpposmirumtbocqtxued) with dom's approval. the client side
-- is src/app/(app)/signals/SignalsView.tsx (a postgres_changes channel on
-- INSERT, with the 60s poll kept as a fallback).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gc_signal_hits'
  ) then
    alter publication supabase_realtime add table public.gc_signal_hits;
  end if;
end $$;