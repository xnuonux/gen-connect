import { createClient } from "@/lib/supabase/server";
import {
  COMPLAINT_PAUSE_RATE,
  BOUNCE_PAUSE_RATE,
} from "@/lib/deliverability/rate";

// the deliverability read model ... RLS-scoped, never throws (a stats hiccup must
// not blank the dashboard). real, live numbers: the send mode + volume + the
// health half (delivered / bounced / complained / unsubscribed + suppression
// count), ALL off the gc_deliverability_events ledger the resend webhook feeds +
// guardedSend logs. volume and the rate denominator read the SAME 'sent' rows, so
// unibox replies and copilot sends count in one place. honest visibility, no mocks.

export type RecentEvent = {
  type: string;
  email: string | null;
  at: string;
};

export type DeliverabilitySummary = {
  sendMode: "test" | "live";
  sendFromDomain: string;
  sendsToday: number;
  sends7d: number;
  sendsTotal: number;
  // the health half (gc_deliverability_events + gc_suppression):
  sentLedger: number;
  delivered: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  suppressed: number;
  bounceRate: number;
  complaintRate: number;
  complaintPauseRate: number;
  bouncePauseRate: number;
  recent: RecentEvent[];
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

const EMPTY_HEALTH = {
  sentLedger: 0,
  delivered: 0,
  bounced: 0,
  complained: 0,
  unsubscribed: 0,
  suppressed: 0,
  bounceRate: 0,
  complaintRate: 0,
};

export async function deliverabilitySummary(): Promise<DeliverabilitySummary> {
  const sendMode: "test" | "live" =
    (process.env.GEN_SEND_MODE ?? "test").toLowerCase() === "live"
      ? "live"
      : "test";
  const sendFromDomain = domainOf(process.env.GEN_SEND_FROM ?? "gen@lunari.pro");
  const base = {
    sendMode,
    sendFromDomain,
    complaintPauseRate: COMPLAINT_PAUSE_RATE,
    bouncePauseRate: BOUNCE_PAUSE_RATE,
  };

  try {
    const supabase = await createClient();
    // volume counts the 'sent' rows of the deliverability ledger ... the SAME
    // rows the health rates use as denominator, so unibox replies and copilot
    // sends land in one number (both route through guardedSend -> logOutboundEmail).
    const countSend = (since?: string) => {
      let q = supabase
        .from("gc_deliverability_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", "sent");
      if (since) q = q.gte("occurred_at", since);
      return q;
    };
    const countEvent = (eventType: string) =>
      supabase
        .from("gc_deliverability_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", eventType);

    const [today, week, total, sent, delivered, bounced, complained, unsub, supp, recentRes] =
      await Promise.all([
        countSend(startOfUtcDayIso()),
        countSend(daysAgoIso(7)),
        countSend(),
        countEvent("sent"),
        countEvent("delivered"),
        countEvent("bounced"),
        countEvent("complained"),
        countEvent("unsubscribed"),
        supabase
          .from("gc_suppression")
          .select("*", { count: "exact", head: true }),
        supabase
          .from("gc_deliverability_events")
          .select("event_type, email, occurred_at")
          .order("occurred_at", { ascending: false })
          .limit(8),
      ]);

    const sentLedger = sent.count ?? 0;
    const bounced_ = bounced.count ?? 0;
    const complained_ = complained.count ?? 0;
    const recent: RecentEvent[] = (
      (recentRes.data ?? []) as Array<{
        event_type: string;
        email: string | null;
        occurred_at: string;
      }>
    ).map((r) => ({ type: r.event_type, email: r.email, at: r.occurred_at }));

    return {
      ...base,
      sendsToday: today.count ?? 0,
      sends7d: week.count ?? 0,
      sendsTotal: total.count ?? 0,
      sentLedger,
      delivered: delivered.count ?? 0,
      bounced: bounced_,
      complained: complained_,
      unsubscribed: unsub.count ?? 0,
      suppressed: supp.count ?? 0,
      bounceRate: sentLedger > 0 ? bounced_ / sentLedger : 0,
      complaintRate: sentLedger > 0 ? complained_ / sentLedger : 0,
      recent,
    };
  } catch {
    return {
      ...base,
      sendsToday: 0,
      sends7d: 0,
      sendsTotal: 0,
      ...EMPTY_HEALTH,
      recent: [],
    };
  }
}
