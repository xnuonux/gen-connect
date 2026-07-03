import { Check, Clock, Globe, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils/cn";
import { deliverabilitySummary } from "@/lib/deliverability/summary";
import { listSendingDomains } from "@/lib/supabase/sending-domains";
import { SendingDomains } from "./SendingDomains";

// the deliverability dashboard ... listmonk-tier visibility: send mode, live
// volume + health (delivered / bounce rate / complaint rate / suppression off the
// gc_deliverability_events ledger), the recent-events stream the resend webhook
// feeds, the readiness checklist (live/pending, honest), and the spf/dkim/dmarc
// sending-domains wizard. warmup tracking on a verified domain is the remaining
// piece. see .claude/skills/deliverability.

type CheckStatus = "live" | "pending";

const CHECKLIST: { label: string; status: CheckStatus; note: string }[] = [
  {
    label: "content + voice scrub",
    status: "live",
    note: "every send runs the voice scrub ... no em-dashes, no spam-trigger phrasing.",
  },
  {
    label: "test-mode safety",
    status: "live",
    note: "in test mode a real lead is never emailed ... the send redirects to your inbox.",
  },
  {
    label: "list-unsubscribe header",
    status: "live",
    note: "every send carries rfc 8058 one-click unsubscribe (gmail + yahoo, 2024), honored at /api/unsubscribe.",
  },
  {
    label: "suppression list",
    status: "live",
    note: "hard bounces, complaints + unsubscribes are checked on every send ... a suppressed address is never emailed again.",
  },
  {
    label: "bounce + complaint auto-pause",
    status: "live",
    note: "the resend webhook feeds the ledger; cross the complaint or bounce line and active sequences auto-pause.",
  },
  {
    label: "jurisdiction gate",
    status: "live",
    note: "cold mail to a strict-opt-in eu country is blocked unless consent is on file. uk / france / us pass.",
  },
  {
    label: "spf / dkim / dmarc",
    status: "pending",
    note: "the dns wizard verifies your sending domain before a live send fires.",
  },
  {
    label: "warmup ramp",
    status: "pending",
    note: "new inboxes ramp 5 to 50 over 14 days ... tracked once sending is live.",
  },
];

function pct(r: number): string {
  return `${(r * 100).toFixed(2)}%`;
}

function rateTone(rate: number, threshold: number): "ok" | "warn" | "alert" {
  if (rate >= threshold) return "alert";
  if (rate >= threshold * 0.5) return "warn";
  return "ok";
}

function fmtTime(iso: string): string {
  return new Date(iso).toISOString().slice(5, 16).replace("T", " ");
}

const WARMUP: { day: string; cap: string }[] = [
  { day: "day 1", cap: "5" },
  { day: "day 3", cap: "10" },
  { day: "day 5", cap: "20" },
  { day: "day 7", cap: "30" },
  { day: "day 10", cap: "40" },
  { day: "day 14", cap: "50" },
  { day: "day 30+", cap: "plan" },
];

function MonoLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
      {children}
    </span>
  );
}

function VolumeCard({
  label,
  value,
  delayMs = 0,
}: {
  label: string;
  value: number;
  delayMs?: number;
}) {
  return (
    <div
      className="reveal-up surface-raised rounded-lg border border-lunari-surface-elevated bg-lunari-surface p-4"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <MonoLabel>{label}</MonoLabel>
      <div className="mt-2 font-mono text-2xl tabular-nums text-lunari-cream">
        {value.toLocaleString("en-US")}
      </div>
    </div>
  );
}

function HealthStat({
  label,
  value,
  tone = "ok",
  delayMs = 0,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "alert";
  delayMs?: number;
}) {
  return (
    <div
      className="reveal-up surface-raised rounded-lg border border-lunari-surface-elevated bg-lunari-surface p-4"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <MonoLabel>{label}</MonoLabel>
      <div
        className={cn(
          "mt-2 font-mono text-2xl tabular-nums",
          tone === "alert"
            ? "text-lunari-crimson"
            : tone === "warn"
              ? "text-lunari-gold"
              : "text-lunari-cream",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default async function DeliverabilityPage() {
  const [s, sendingDomains] = await Promise.all([
    deliverabilitySummary(),
    listSendingDomains(),
  ]);
  const live = s.sendMode === "live";

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-8 py-6">
      <PageHeader
        title="deliverability"
        subtitle="the inbox is the product ... your send mode, real volume, and the readiness checklist every send answers to."
      />

      {/* send mode banner ... the focal card of the page (are you safe to send?) */}
      <div className="surface-focal rounded-lg border border-lunari-surface-elevated p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 stroke-[1.25] text-lunari-neutral-400" />
            <MonoLabel>send mode</MonoLabel>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em]",
                live
                  ? "bg-lunari-surface-elevated text-lunari-gold"
                  : "bg-lunari-surface-elevated text-lunari-neutral-400",
              )}
            >
              {s.sendMode}
            </span>
          </div>
          <span className="font-mono text-[11px] text-lunari-neutral-500">
            from {s.sendFromDomain}
          </span>
        </div>
        <p className="mt-2 text-sm text-lunari-neutral-400">
          {live
            ? `sends reach real recipients from ${s.sendFromDomain}. every one still passes the voice scrub.`
            : "test mode ... every send redirects to your own inbox, tagged [test -> the lead], so no real lead is touched while you dial it in. flip to live only on a verified domain."}
        </p>
      </div>

      {/* volume ... real, from the send ledger */}
      <div>
        <MonoLabel>send volume</MonoLabel>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <VolumeCard label="today" value={s.sendsToday} delayMs={0} />
          <VolumeCard label="last 7 days" value={s.sends7d} delayMs={45} />
          <VolumeCard label="all time" value={s.sendsTotal} delayMs={90} />
        </div>
      </div>

      {/* deliverability health ... live, off the events ledger + suppression */}
      <div>
        <MonoLabel>deliverability health</MonoLabel>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HealthStat
            label="delivered"
            value={s.delivered.toLocaleString("en-US")}
            delayMs={0}
          />
          <HealthStat
            label="bounce rate"
            value={pct(s.bounceRate)}
            tone={rateTone(s.bounceRate, s.bouncePauseRate)}
            delayMs={45}
          />
          <HealthStat
            label="complaint rate"
            value={pct(s.complaintRate)}
            tone={rateTone(s.complaintRate, s.complaintPauseRate)}
            delayMs={90}
          />
          <HealthStat
            label="suppressed"
            value={s.suppressed.toLocaleString("en-US")}
            delayMs={135}
          />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-lunari-neutral-500">
          rates measured against {s.sentLedger.toLocaleString("en-US")} logged sends.
          auto-pause trips at {pct(s.complaintPauseRate)} complaints or{" "}
          {pct(s.bouncePauseRate)} bounces.
        </p>
      </div>

      {/* recent events ... the live stream from the resend webhook */}
      {s.recent.length > 0 && (
        <div className="surface-raised rounded-lg border border-lunari-surface-elevated bg-lunari-surface p-4">
          <MonoLabel>recent events</MonoLabel>
          <ul className="mt-3 space-y-1.5">
            {s.recent.map((e, i) => (
              <li
                key={`${e.type}-${e.at}-${i}`}
                className="flex items-center justify-between gap-3 text-[12px]"
              >
                <span className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-lunari-neutral-400">
                  {e.type}
                </span>
                <span className="min-w-0 flex-1 truncate text-lunari-neutral-500">
                  {e.email ?? ""}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-lunari-neutral-500">
                  {fmtTime(e.at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* readiness checklist ... honest live/pending status */}
      <div className="surface-raised rounded-lg border border-lunari-surface-elevated bg-lunari-surface p-4">
        <div className="flex items-center gap-2.5">
          <MonoLabel>pre-send readiness</MonoLabel>
        </div>
        <ul className="mt-3 space-y-2.5">
          {CHECKLIST.map((c) => {
            const isLive = c.status === "live";
            const Icon = isLive ? Check : Clock;
            return (
              <li key={c.label} className="flex items-start gap-3">
                <Icon
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 stroke-[1.5]",
                    isLive ? "text-lunari-cream" : "text-lunari-neutral-500",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-lunari-cream">{c.label}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em]",
                        isLive
                          ? "bg-lunari-surface-elevated text-lunari-cream/80"
                          : "bg-lunari-surface-elevated text-lunari-neutral-500",
                      )}
                    >
                      {isLive ? "live" : "pending"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-lunari-neutral-500">
                    {c.note}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* sending domains ... the spf/dkim/dmarc wizard */}
      <div className="surface-raised rounded-lg border border-lunari-surface-elevated bg-lunari-surface p-4">
        <SendingDomains initial={sendingDomains} />
      </div>

      {/* the warmup ramp */}
      <div className="surface-raised rounded-lg border border-lunari-surface-elevated bg-lunari-surface p-4">
        <MonoLabel>warmup ramp</MonoLabel>
        <p className="mt-1 text-[11px] text-lunari-neutral-500">
          the daily cap a new inbox follows before it sends at full volume.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {WARMUP.map((w) => (
            <div
              key={w.day}
              className="rounded-md border border-lunari-surface-elevated bg-lunari-black/40 px-2.5 py-1.5"
            >
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-lunari-neutral-500">
                {w.day}
              </div>
              <div className="font-mono text-sm tabular-nums text-lunari-cream">
                {w.cap}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* sending identity + the honest deferral */}
      <div className="surface-raised rounded-lg border border-lunari-surface-elevated bg-lunari-surface p-4">
        <div className="flex items-center gap-2.5">
          <Globe className="h-4 w-4 stroke-[1.25] text-lunari-neutral-400" />
          <MonoLabel>sending domain</MonoLabel>
        </div>
        <div className="mt-2 font-mono text-sm text-lunari-cream">
          {s.sendFromDomain}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-lunari-neutral-500">
          sends currently go out from {s.sendFromDomain}. add + verify the domains
          you send from in the wizard above ... in live mode a send is refused until
          its domain passes spf + dkim + mx.
        </p>
      </div>
    </div>
  );
}
