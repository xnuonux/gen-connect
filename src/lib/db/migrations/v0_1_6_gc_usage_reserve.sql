-- gen connect ... v0.1.6 ... atomic spend reserve (close the ceiling race)
--
-- the daily spend ceiling was check-then-log: costGate() read today's summed
-- spend, compared spent + projected <= ceiling, and only AFTER the tool ran did
-- recordUsage() insert the cost row. two concurrent /api/gen turns (two tabs, or a
-- fast double-send) could BOTH read the same stale sum, BOTH pass the check, and
-- BOTH spend ... the ceiling was a tripwire, not a bound. before multi-user it has
-- to be a hard upper bound.
--
-- gc_reserve_usage() folds the read + check + write into ONE atomic step. it locks
-- the caller's day window (a per-user advisory xact lock, so two users never
-- contend), re-reads today's spend INSIDE the lock, and inserts the projected cost
-- ONLY if it still fits under the ceiling. a second concurrent reserve blocks on the
-- lock, then re-reads a sum that now includes the first one's committed row, so it
-- cannot slip past. the reserve IS the ledger write now ... the tools stop calling
-- recordUsage() and reserve the projected (upper-bound) cost up front.
--
-- SECURITY: this is SECURITY INVOKER on purpose. the cinema charge_fuel_atomic is
-- DEFINER because users may not write their own credit balance ... here the user
-- already MAY insert their own gc_usage_events rows (the v0_1_4 insert policy), so
-- invoker is enough AND strictly safer: every existing guard stays in force ... the
-- insert still passes the own-row RLS check, the sum still reads only the caller's
-- rows, the non-negative constraint (v0_1_5) still holds, and there is NO new
-- griefing vector because the function acts only on auth.uid(), never an arbitrary
-- user id. it ADDS atomicity without REMOVING a single protection.
--
-- p_ceiling_cents is a param so the env-tunable ceiling stays single-sourced in the
-- app (GEN_DAILY_CEILING_CENTS). safe: the only caller whose result drives real
-- server spend is the server itself. a user hitting this rpc directly with a fake
-- ceiling just writes their OWN ledger ... which they could already do, and which
-- only ever RAISES their spend, never lowers it (no update/delete policy, non-neg
-- constraint), so it cannot be used to dodge the cap.
--
-- forward-only, idempotent, no drops.

create or replace function public.gc_reserve_usage(
  p_kind          text,
  p_units         int,
  p_cost_cents    int,
  p_ceiling_cents int
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_day_start timestamptz := (date_trunc('day', (now() at time zone 'utc')) at time zone 'utc');
  v_spent     bigint;
begin
  -- never happens through /api/gen (auth-gated), but a direct rpc hit might.
  if v_uid is null then
    return jsonb_build_object('reserved', false, 'reason', 'unauthenticated', 'spent_cents', 0);
  end if;
  -- a negative cost/units/ceiling is nonsense ... reserve nothing rather than
  -- credit the ledger. (the table's non-neg check would reject the insert anyway.)
  if p_cost_cents < 0 or p_units < 0 or p_ceiling_cents < 0 then
    return jsonb_build_object('reserved', false, 'reason', 'invalid_amount', 'spent_cents', 0);
  end if;

  -- serialize concurrent reserves for THIS user only. xact-scoped, so it releases
  -- when this rpc's transaction ends ... no leaked locks across the pooled conn,
  -- and cross-user reserves never block each other (distinct lock keys).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  -- read today's spend INSIDE the lock. a second reserve that was blocked here now
  -- sees the first one's committed row, so the bound holds under concurrency.
  select coalesce(sum(cost_cents), 0)::bigint into v_spent
  from public.gc_usage_events
  where user_id = v_uid and occurred_at >= v_day_start;

  if v_spent + p_cost_cents > p_ceiling_cents then
    return jsonb_build_object('reserved', false, 'reason', 'daily_cap', 'spent_cents', v_spent);
  end if;

  insert into public.gc_usage_events (user_id, kind, units, cost_cents)
  values (v_uid, p_kind, p_units, p_cost_cents);

  return jsonb_build_object('reserved', true, 'spent_cents', v_spent + p_cost_cents);
end
$$;

-- expose to the signed-in user only. supabase's default privileges grant EXECUTE
-- directly to anon + authenticated + service_role on every new public function, so
-- revoking from PUBLIC is not enough ... anon keeps its DIRECT grant. revoke anon
-- explicitly too (an anon call would no-op on the auth.uid() null-guard anyway, but
-- least-privilege says don't expose it). service_role keeps its grant (backend/admin
-- + it bypasses rls regardless). matches the explicit posture the gc cost layer takes.
revoke all on function public.gc_reserve_usage(text, int, int, int) from public, anon;
grant execute on function public.gc_reserve_usage(text, int, int, int) to authenticated;

-- next migration ... v0_1_7_gc_<feature>.sql. keep this file forward-only.
