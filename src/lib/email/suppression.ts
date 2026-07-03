import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// is this address on the user's do-not-send list? a hard bounce, a complaint, or
// an unsubscribe lands a row in gc_suppression; this is the gate the send path
// checks before EVERY send so a suppressed address is never emailed again. reads
// through the session client (rls scopes to the user) ... or an injected service-role
// client (the autonomous cron), where the explicit user_id filter does the scoping.
export async function isSuppressed(
  userId: string,
  email: string,
  db?: SupabaseClient,
): Promise<boolean> {
  const supabase = db ?? (await createClient());
  const { data } = await supabase
    .from("gc_suppression")
    .select("id")
    .eq("user_id", userId)
    .eq("email", email.toLowerCase())
    .limit(1)
    .maybeSingle();
  return !!data;
}
