"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PLANS, PLAN_KEYS, type PlanKey } from "@/lib/billing/plans";
import { createCheckoutAction } from "@/app/actions/billing";

// the plan voice ... what each room is for, in dom register. kept here (not in the
// pure PLANS config) so the config stays data-only.
const TAGLINES: Record<PlanKey, string> = {
  creator: "for the solo founder opening their first doors.",
  pro: "more inboxes, more signal sources, more room to run.",
};
const FEATURES: Record<PlanKey, string[]> = {
  creator: [
    "~80 qualified leads a month",
    "voice-matched 5-angle drafts",
    "signal-timed outreach",
    "the unibox + live replies",
  ],
  pro: [
    "~200 qualified leads a month",
    "everything in creator",
    "more sending inboxes",
    "more signal agents",
  ],
};

// the upgrade surface. plan cards wired to the proven createCheckoutAction ... on
// a clean session it hands back a stripe url and we send the browser there; when
// billing isn't switched on yet the action returns a voice-checked message and we
// toast it (never a dead button, never a raw stripe error). gen-accent carries the
// cta (gold is spoken for by the top-bar hero ... one gold per screen).
export function BillingView({
  tier,
  currentPlan,
  status,
  stripeConfigured,
  billingResult,
}: {
  tier: "free" | "paid";
  currentPlan: string | null;
  status: string | null;
  stripeConfigured: boolean;
  billingResult: string | null;
}) {
  const [pending, setPending] = useState<PlanKey | null>(null);

  async function upgrade(plan: PlanKey) {
    setPending(plan);
    try {
      const r = await createCheckoutAction({ plan });
      if (!r.ok) {
        toast.error(r.error);
        setPending(null);
        return;
      }
      window.location.assign(r.url);
    } catch {
      toast.error("couldn't start checkout ... give it another shot.");
      setPending(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
        plans
      </span>
      <h1
        style={{ fontFamily: "var(--font-cinzel)" }}
        className="mt-2 text-[28px] leading-tight text-lunari-cream"
      >
        open more doors.
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-lunari-neutral-400">
        one fuel is one fully-worked lead ... found, verified, enriched, and
        drafted in your voice. pick the room you need.
      </p>

      {billingResult === "success" ? (
        <div className="reveal-up mt-6 rounded-lg border border-gen-accent/40 bg-gen-accent-soft px-4 py-3 text-sm text-gen-accent">
          you&apos;re in. welcome to gen connect ... let&apos;s open some doors.
        </div>
      ) : billingResult === "cancelled" ? (
        <div className="mt-6 rounded-lg border border-lunari-surface-elevated bg-lunari-surface px-4 py-3 text-sm text-lunari-neutral-400">
          checkout cancelled ... no charge. upgrade whenever you&apos;re ready.
        </div>
      ) : null}

      {!stripeConfigured ? (
        <div className="mt-6 rounded-lg border border-lunari-surface-elevated bg-lunari-surface px-4 py-3 text-sm text-lunari-neutral-400">
          billing opens at launch ... these are the rooms you&apos;ll choose from.
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {PLAN_KEYS.map((key, i) => {
          const plan = PLANS[key];
          const isCurrent = tier === "paid" && currentPlan === key;
          return (
            <div
              key={key}
              className={cn(
                "reveal-up surface-raised flex flex-col rounded-xl border bg-lunari-surface p-6",
                isCurrent
                  ? "border-gen-accent/50 shadow-[0_0_28px_-12px_var(--gen-accent)]"
                  : "border-lunari-surface-elevated",
              )}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
                  {plan.label}
                </span>
                {isCurrent ? (
                  <span className="flex items-center gap-1 rounded-full border border-gen-accent/40 bg-gen-accent-soft px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-gen-accent">
                    <Check className="h-3 w-3 stroke-[2]" /> current
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="font-mono text-[40px] leading-none tabular-nums text-lunari-cream">
                  ${plan.monthlyUsd}
                </span>
                <span className="text-sm text-lunari-neutral-500">/ mo</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-lunari-neutral-400">
                {TAGLINES[key]}
              </p>

              <ul className="mt-4 space-y-2">
                {FEATURES[key].map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-lunari-cream/85"
                  >
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 stroke-[1.5] text-gen-accent" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => upgrade(key)}
                disabled={isCurrent || pending !== null}
                className={cn(
                  "planetarium mt-6 flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium",
                  isCurrent
                    ? "cursor-default border border-lunari-surface-elevated bg-lunari-surface text-lunari-neutral-500"
                    : "bg-gen-accent text-lunari-cream hover:bg-gen-accent/90 disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {isCurrent ? (
                  "your current plan"
                ) : pending === key ? (
                  "opening checkout ..."
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 stroke-[1.25]" />
                    <span>upgrade to {plan.label}</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-6 font-mono text-[11px] text-lunari-neutral-500">
        {tier === "paid"
          ? `you're on ${currentPlan ?? "a paid plan"}${status ? ` · ${status}` : ""}.`
          : "you're on the free plan ... import, organize, and see your pipeline. upgrade to let gen find, draft, and send for you."}
      </p>
    </div>
  );
}
