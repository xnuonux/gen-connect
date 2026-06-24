import { createClient } from "@supabase/supabase-js";

// the service-role client. it BYPASSES rls, so it is only ever for trusted
// server contexts that cannot run as a signed-in user ... webhooks (inbound
// mail, bounce/complaint events) where there is no session but we know the
// owning user_id and set it explicitly on every write.
//
// never import this into anything reachable from the browser path. returns null
// when the service key is not configured so callers degrade gracefully instead
// of throwing at import time.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
