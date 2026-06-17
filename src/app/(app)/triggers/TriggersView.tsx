"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Zap, Plus, X, Pause, Play, FlaskConical, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  fetchTriggers,
  createTriggerAction,
  setTriggerStatusAction,
  testTriggerAction,
  type TriggerTestMatch,
} from "@/app/actions/triggers";
import { fetchSequences } from "@/app/actions/sequences";
import {
  SIGNAL_TYPES,
  SIGNAL_LABELS,
  type SignalType,
  type TriggerCondition,
} from "@/lib/types/signal";
import type { Trigger, TriggerStatus } from "@/lib/supabase/triggers";

// a readable one-line summary of a jsonb predicate ... the form is the editor,
// this is the at-a-glance read on each library card.
function conditionSummary(c: TriggerCondition): string {
  const parts: string[] = [];
  parts.push(c.signal_type ? SIGNAL_LABELS[c.signal_type] : "any signal");
  if (typeof c.score_gte === "number")
    parts.push(`score >= ${Number(c.score_gte).toFixed(2)}`);
  if (typeof c.detected_within_hours === "number")
    parts.push(`within ${c.detected_within_hours}h`);
  const raw = c.raw ?? {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v) && v.length) parts.push(`${k.replace(/_/g, " ")}: ${v.join("/")}`);
  }
  return parts.join("  ·  ");
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-gen-accent-soft text-gen-accent",
  dry_run: "bg-lunari-surface-elevated text-lunari-gold",
  paused: "bg-lunari-surface-elevated text-lunari-neutral-400",
};

export function TriggersView({
  initialTriggers,
}: {
  initialTriggers: Trigger[];
}) {
  const queryClient = useQueryClient();
  const [builderOpen, setBuilderOpen] = useState(false);

  const { data: triggers } = useQuery({
    queryKey: ["triggers"],
    queryFn: fetchTriggers,
    initialData: initialTriggers,
  });

  return (
    <div className="space-y-6 px-8 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-lunari-cream">
            triggers
          </h1>
          <p className="mt-1 text-sm text-lunari-neutral-400">
            the rules engine ... when a signal fits the predicate, the right thing
            fires. detect, match, act.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBuilderOpen(true)}
          className="planetarium flex items-center gap-2 rounded-md bg-gen-accent px-3 py-2 text-sm font-medium text-lunari-cream hover:bg-gen-accent/90"
        >
          <Plus className="h-4 w-4 stroke-[1.25]" />
          <span>new trigger</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {triggers.length === 0 ? (
          <div className="col-span-full rounded-lg border border-lunari-surface-elevated bg-lunari-surface px-6 py-12 text-center text-sm text-lunari-neutral-400">
            no triggers yet ... a trigger watches your signal hits and fires when
            one matches. build one and dry-run it against the hits already in.
          </div>
        ) : (
          triggers.map((t) => <TriggerCard key={t.id} trigger={t} />)
        )}
      </div>

      {builderOpen ? (
        <TriggerBuilder
          onClose={() => setBuilderOpen(false)}
          onCreated={() => {
            setBuilderOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["triggers"] });
          }}
        />
      ) : null}
    </div>
  );
}

function TriggerCard({ trigger }: { trigger: Trigger }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: async () => {
      const next: TriggerStatus =
        trigger.status === "active" ? "paused" : "active";
      const r = await setTriggerStatusAction(trigger.id, next);
      if (!r.ok) throw new Error(r.error);
      return next;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["triggers"] }),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "couldn't update trigger."),
  });

  const active = trigger.status === "active";
  const dryRun = trigger.status === "dry_run";

  return (
    <div className="rounded-lg border border-lunari-surface-elevated bg-lunari-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 shrink-0 stroke-[1.25] text-lunari-neutral-400" />
            <span className="truncate text-sm text-lunari-cream">
              {trigger.name}
            </span>
          </div>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-lunari-neutral-500">
            {conditionSummary(trigger.condition)}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em]",
            STATUS_STYLE[trigger.status] ?? STATUS_STYLE.paused,
          )}
        >
          {trigger.status === "dry_run" ? "dry run" : trigger.status}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-[10px] text-lunari-neutral-500">
          fired {trigger.fireCount}x · action: {trigger.action.kind}
        </span>
        <button
          type="button"
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
          className={cn(
            "planetarium flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-lunari-surface-elevated disabled:opacity-40",
            dryRun
              ? "text-gen-accent hover:text-gen-accent"
              : "text-lunari-neutral-400 hover:text-lunari-cream",
          )}
        >
          {active ? (
            <>
              <Pause className="h-3.5 w-3.5 stroke-[1.25]" />
              <span>pause</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 stroke-[1.25]" />
              <span>{dryRun ? "go live" : "resume"}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function TriggerBuilder({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [anySignal, setAnySignal] = useState(false);
  const [signalType, setSignalType] = useState<SignalType>("searching_for");
  const [scoreGte, setScoreGte] = useState(0.7);
  const [withinHours, setWithinHours] = useState(72);
  const [status, setStatus] = useState<"active" | "dry_run" | "paused">(
    "dry_run",
  );
  // empty = draft the 5 angles on match; a sequence id = enroll the sourced
  // contact into that sequence (the loop closes from detect to enrolled).
  const [sequenceId, setSequenceId] = useState<string>("");
  const { data: sequences = [] } = useQuery({
    queryKey: ["sequences"],
    queryFn: fetchSequences,
  });

  const condition: TriggerCondition = useMemo(() => {
    const c: TriggerCondition = {
      score_gte: scoreGte,
      detected_within_hours: withinHours,
    };
    if (!anySignal) c.signal_type = signalType;
    return c;
  }, [anySignal, signalType, scoreGte, withinHours]);

  const test = useMutation({
    mutationFn: async () => {
      const r = await testTriggerAction(condition);
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "couldn't run the test."),
  });

  const create = useMutation({
    mutationFn: async () => {
      const r = await createTriggerAction({
        name: name.trim() || `${anySignal ? "any" : signalType} trigger`,
        status,
        condition,
        action: sequenceId
          ? { kind: "enroll_in_sequence", sequence_id: sequenceId }
          : { kind: "draft" },
      });
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSuccess: () => {
      toast.success("trigger live ... it watches for the match.");
      onCreated();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "couldn't build that trigger."),
  });

  const result = test.data?.ok ? test.data : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-lunari-black/70 backdrop-blur-sm"
      />
      <div className="reveal-up relative w-full max-w-md overflow-hidden rounded-xl border border-lunari-surface-elevated bg-lunari-surface shadow-2xl shadow-lunari-black/70">
        <div className="flex items-center justify-between border-b border-lunari-surface-elevated px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 stroke-[1.25] text-gen-accent" />
            <span className="text-sm text-lunari-cream">new trigger</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="flex h-7 w-7 items-center justify-center rounded-md text-lunari-neutral-400 hover:bg-lunari-surface-elevated"
          >
            <X className="h-4 w-4 stroke-[1.25]" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
              name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="hot creator intent"
              className="mt-1 w-full rounded-md border border-lunari-surface-elevated bg-lunari-black px-2 py-2 text-sm text-lunari-cream placeholder:text-lunari-neutral-500 focus:outline-none focus:ring-1 focus:ring-gen-accent"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
                signal type
              </span>
              <label className="flex items-center gap-1.5 text-[10px] text-lunari-neutral-400">
                <input
                  type="checkbox"
                  checked={anySignal}
                  onChange={(e) => setAnySignal(e.target.checked)}
                  className="accent-gen-accent"
                />
                any
              </label>
            </div>
            <select
              value={signalType}
              disabled={anySignal}
              onChange={(e) => setSignalType(e.target.value as SignalType)}
              className="mt-1 w-full rounded-md border border-lunari-surface-elevated bg-lunari-black px-2 py-2 text-sm text-lunari-cream focus:outline-none disabled:opacity-40"
            >
              {SIGNAL_TYPES.map((t) => (
                <option key={t} value={t} className="bg-lunari-surface">
                  {SIGNAL_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
                min score
              </span>
              <span className="font-mono text-[10px] tabular-nums text-lunari-neutral-400">
                {scoreGte.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={scoreGte}
              onChange={(e) =>
                setScoreGte(Math.round(Number(e.target.value) * 100) / 100)
              }
              className="mt-2 w-full accent-gen-accent"
            />
          </div>

          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
              freshness (hours)
            </span>
            <input
              type="number"
              min={1}
              max={2160}
              value={withinHours}
              onChange={(e) =>
                setWithinHours(Math.max(1, Math.min(2160, Number(e.target.value) || 72)))
              }
              className="mt-1 w-full rounded-md border border-lunari-surface-elevated bg-lunari-black px-2 py-2 text-sm text-lunari-cream focus:outline-none"
            />
          </div>

          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
              start as
            </span>
            <div className="mt-1 flex gap-1.5">
              {(["dry_run", "active", "paused"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    "planetarium flex-1 rounded-md px-2 py-1.5 text-xs",
                    status === s
                      ? "bg-lunari-surface-elevated text-lunari-cream"
                      : "text-lunari-neutral-400 hover:bg-lunari-surface-elevated",
                  )}
                >
                  {s === "dry_run" ? "dry run" : s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
              on match
            </span>
            <select
              value={sequenceId}
              onChange={(e) => setSequenceId(e.target.value)}
              className="mt-1 w-full rounded-md border border-lunari-surface-elevated bg-lunari-black px-2 py-2 text-sm text-lunari-cream focus:outline-none"
            >
              <option value="" className="bg-lunari-surface">
                draft the 5 angles
              </option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id} className="bg-lunari-surface">
                  enroll in {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* the live dry run ... runs the real evaluator over recent hits. */}
          <div className="rounded-md border border-lunari-surface-elevated bg-lunari-black/40 p-3">
            <button
              type="button"
              onClick={() => test.mutate()}
              disabled={test.isPending}
              className="planetarium flex items-center gap-2 text-xs text-lunari-cream/90 hover:text-lunari-cream"
            >
              <FlaskConical className="h-4 w-4 stroke-[1.25] text-lunari-gold" />
              <span>
                {test.isPending ? "testing ..." : "test against recent hits"}
              </span>
            </button>
            {result ? (
              <div className="mt-2 space-y-1">
                <p className="font-mono text-[10px] text-lunari-neutral-400">
                  would catch {result.matched} of {result.total} recent hits
                </p>
                {result.sample.map((m: TriggerTestMatch, i) => (
                  <p key={i} className="truncate text-[11px] text-lunari-cream/70">
                    ↳ {m.hook}
                    {m.score != null ? ` · ${m.score.toFixed(2)}` : ""}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-lunari-surface-elevated px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="planetarium rounded-md px-3 py-1.5 text-xs text-lunari-neutral-400 hover:text-lunari-cream"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="planetarium flex items-center gap-1.5 rounded-md bg-gen-accent px-3 py-1.5 text-xs font-medium text-lunari-cream hover:bg-gen-accent/90 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4 stroke-[1.25]" />
            <span>{create.isPending ? "building ..." : "build trigger"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
