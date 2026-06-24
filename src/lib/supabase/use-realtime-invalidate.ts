"use client";

import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

type Binding = {
  table: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  schema?: string;
};

// subscribe to postgres_changes the RIGHT way: authenticate the realtime socket
// with the user's jwt BEFORE the channel joins.
//
// the trap: postgres_changes binds its rls context at JOIN time. a channel that
// subscribes on the anon key ... which is what happens when .subscribe() runs
// before the cookie session has hydrated and propagated its token ... is silently
// dropped by rls and never recovers. setAuth AFTER the join does not retroactively
// re-authorize the binding. the channel still reports SUBSCRIBED, so nothing looks
// wrong; the events just never arrive, while a page reload "works" because the
// rsc/rest read uses cookies on a different path entirely.
//
// proven by scripts/verify-realtime.mjs against the live project:
//   A anon, no token         -> 0 events  (rls scopes realtime, good)
//   B setAuth -> subscribe    -> 1 event   (the fix)
//   C subscribe -> setAuth    -> 0 events  (the browser race, the bug)
//
// so: getSession() (forces hydration) -> realtime.setAuth(token) -> subscribe.
// on every change we invalidate the given query keys; a poll on the queries is
// the belt-and-suspenders floor if the socket ever drops.
export function useRealtimeInvalidate(args: {
  supabase: SupabaseClient;
  channelName: string;
  bindings: Binding[];
  queryClient: QueryClient;
  invalidateKeys: QueryKey[];
}): void {
  const { supabase, channelName, bindings, queryClient, invalidateKeys } = args;

  // serialize the array inputs so the effect re-subscribes only when the actual
  // shape changes, not on every render (callers pass fresh array literals).
  const bindingsKey = bindings
    .map((b) => `${b.schema ?? "public"}.${b.table}:${b.event ?? "INSERT"}`)
    .join("|");
  const keysKey = invalidateKeys.map((k) => JSON.stringify(k)).join("|");

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;

    void (async () => {
      // force session hydration, then bind the jwt to the socket BEFORE join.
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        const r = supabase.realtime.setAuth(token) as unknown;
        if (r && typeof (r as Promise<void>).then === "function") {
          await (r as Promise<void>);
        }
      }
      if (cancelled) return;

      let ch = supabase.channel(channelName);
      for (const b of bindings) {
        ch = ch.on(
          "postgres_changes",
          {
            event: b.event ?? "INSERT",
            schema: b.schema ?? "public",
            table: b.table,
          },
          () => {
            for (const key of invalidateKeys) {
              void queryClient.invalidateQueries({ queryKey: key });
            }
          },
        );
      }
      channel = ch.subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
    // bindings + invalidateKeys are intentionally tracked via their serialized
    // keys (above) so fresh array literals from callers don't thrash the socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, queryClient, channelName, bindingsKey, keysKey]);
}
