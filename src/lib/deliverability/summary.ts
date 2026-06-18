import { createClient } from "@/lib/supabase/server";

// the deliverability read model ... RLS-scoped, never throws (a stats hiccup must
// not blank the dashboard). real, live numbers: the send mode + the send volume
// from the gc_usage_events kind='send_email' ledger (the same ledger the top-bar
// ticker counts). the live bounce/complaint/reputation half lands with the send
// pipeline (railway) + the inbound webhook ... this is honest visibility of what
// exists today, not a mock with invented metrics.

export type DeliverabilitySummary = {
  sendMode: "test" | "live";
  sendFromDomain: string;
  sendsToday: number;
  sends7d: number;
  sendsTotal: number;
};

function domainOf(from: string): string {
  const m = from.match(/@([^>\s]+)/);
  return (m?.[1] ?? from).trim();
}

function startOfUtcDayIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

export async function deliverabilitySummary(): Promise<DeliverabilitySummary> {
  const sendMode: "test" | "live" =
    (process.env.GEN_SEND_MODE ?? "test").toLowerCase() === "live"
      ? "live"
      : "test";
  const sendFromDomain = domainOf(process.env.GEN_SEND_FROM ?? "gen@lunari.pro");

  try {
    const supabase = await createClient();
    const [today, week, total] = await Promise.all([
      supabase
        .from("gc_usage_events")
        .select("*", { count: "exact", head: true })
        .eq("kind", "send_email")
        .gte("occurred_at", startOfUtcDayIso()),
      supabase
        .from("gc_usage_events")
        .select("*", { count: "exact", head: true })
        .eq("kind", "send_email")
        .gte("occurred_at", daysAgoIso(7)),
      supabase
        .from("gc_usage_events")
        .select("*", { count: "exact", head: true })
        .eq("kind", "send_email"),
    ]);
    return {
      sendMode,
      sendFromDomain,
      sendsToday: today.count ?? 0,
      sends7d: week.count ?? 0,
      sendsTotal: total.count ?? 0,
    };
  } catch {
    return { sendMode, sendFromDomain, sendsToday: 0, sends7d: 0, sendsTotal: 0 };
  }
}
