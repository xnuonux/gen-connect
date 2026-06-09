import { createClient } from "@/lib/supabase/server";

// the top-bar workspace ticker. cheap exact head-counts (no rows pulled),
// RLS-scoped to the signed-in user. never throws ... a stats hiccup must not
// blank the whole app shell, so it degrades to zeros.
export type WorkspaceStats = {
  sendsToday: number;
  replies: number;
  booked: number;
};

function startOfUtcDayIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

export async function workspaceStats(): Promise<WorkspaceStats> {
  try {
    const supabase = await createClient();
    const [sends, replies, booked] = await Promise.all([
      // sends are logged to the cost ledger as kind='send_email'; count today's.
      supabase
        .from("gc_usage_events")
        .select("*", { count: "exact", head: true })
        .eq("kind", "send_email")
        .gte("occurred_at", startOfUtcDayIso()),
      // pipeline reply + booked signals ... the stages carry the truth.
      supabase
        .from("gc_contacts")
        .select("*", { count: "exact", head: true })
        .eq("stage", "replied"),
      supabase
        .from("gc_contacts")
        .select("*", { count: "exact", head: true })
        .eq("stage", "booked"),
    ]);
    return {
      sendsToday: sends.count ?? 0,
      replies: replies.count ?? 0,
      booked: booked.count ?? 0,
    };
  } catch {
    return { sendsToday: 0, replies: 0, booked: 0 };
  }
}
