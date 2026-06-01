import { createClient } from "@/lib/supabase/server";

// the free/paid line. gen reads a user's tier to gate the money-costing actions
// (find / verify / enrich / draft / send). zero-cost surfaces never check this.
export type Tier = "free" | "paid";

// standalone signups have no entitlement row, so they default to FREE ... the
// safe + cheap default. gen owns this table for the standalone; when this
// integrates into LUNARI, re-point this one helper at LUNARI's plan source and
// the rest of the code (which only knows "free" | "paid") is untouched. tier is
// written by the system (billing on conversion), never by the user (RLS denies
// user writes), so this can't be self-escalated.
export async function getUserTier(userId: string): Promise<Tier> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("gc_user_entitlements")
      .select("tier")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.tier === "paid" ? "paid" : "free";
  } catch {
    return "free";
  }
}
