-- gen connect ... v0.1.17 ... add gc_contacts to the supabase_realtime publication
-- so the pipeline board comes ALIVE when gen acts. the copilot (and the signal
-- auto-fire path) insert / move / tag / enrich contacts server-side; the owning
-- user's authed channel then receives the change and the kanban + table refetch
-- live, instead of freezing at the last server fetch until a manual reload. this is
-- the "watch the operator work and the surface fills itself" beat ... signals + the
-- unibox already light up this way (v0_1_9, v0_1_15); the board was the last silo.
--
-- additive, idempotent, forward-only. RLS still scopes which rows reach which client
-- over the socket (own_gc_contacts), so a user only ever sees their own changes.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gc_contacts'
  ) then
    alter publication supabase_realtime add table public.gc_contacts;
  end if;
end $$;
