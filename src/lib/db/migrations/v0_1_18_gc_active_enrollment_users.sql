-- gen connect ... v0.1.18 ... a distinct-tenant helper for the autonomous sequence
-- cron. the cron used to find tenants by paging gc_sequence_enrollments ROWS with a
-- .limit(), which silently hits postgrest's max-rows cap (the same truncation as task
-- #49): one high-volume tenant's rows fill the window and every other tenant is
-- dropped, so their due sends never fire. this returns the DISTINCT owning users of
-- active enrollments in a single query, no row window.
--
-- execute is restricted to service_role (the cron's client). it is NEVER exposed to
-- authenticated/anon users, and it returns only user ids ... no row data. security
-- invoker + service_role means it runs with the service role's rls-bypass, exactly the
-- context the cron already uses. stable + read-only.

create or replace function public.gc_active_enrollment_users()
returns table(user_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct e.user_id
  from public.gc_sequence_enrollments e
  where e.status = 'active'
$$;

revoke all on function public.gc_active_enrollment_users() from public, anon, authenticated;
grant execute on function public.gc_active_enrollment_users() to service_role;
