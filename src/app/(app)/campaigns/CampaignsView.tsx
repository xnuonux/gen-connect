"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { GitBranch, Clock, Mail, Split, GitFork, Flag } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { fetchSequences, getSequenceAction } from "@/app/actions/sequences";
import { compileRun, type CompiledStep } from "@/lib/sequences/compile";
import { spintaxCombos } from "@/lib/sequences/spintax";
import { RunDueButton } from "./RunDueButton";
import type {
  NodeKind,
  SequenceRecord,
  SequenceStatus,
  SequenceSummary,
} from "@/lib/types/sequence";

const STATUS_STYLE: Record<SequenceStatus, string> = {
  draft: "bg-lunari-surface-elevated text-lunari-neutral-400",
  active: "bg-gen-accent-soft text-gen-accent",
  paused: "bg-lunari-surface-elevated text-lunari-gold",
  archived: "bg-lunari-surface-elevated text-lunari-neutral-500",
};

const STEP_ICON: Record<NodeKind, typeof Mail> = {
  start: Flag,
  send: Mail,
  wait: Clock,
  condition: Split,
  branch: GitFork,
  end: Flag,
};

function MonoLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
      {children}
    </span>
  );
}

// the campaigns console: the ledger on the left, a live detail pane on the right ...
// the compiled journey (reusing the same compiler the editor previews with), the
// step-by-step shape with per-send variant + spintax breakdown, the enrolled/reply
// counts, and a per-campaign "run due sends". a sequence IS a campaign once contacts
// enroll, so this reads the same gc_sequences the editor writes ... no dead-end.
export function CampaignsView({ initial }: { initial: SequenceSummary[] }) {
  const { data: sequences = initial } = useQuery({
    queryKey: ["sequences"],
    queryFn: fetchSequences,
    initialData: initial,
    refetchInterval: 30_000,
  });

  const [selectedId, setSelectedId] = useState<string | null>(
    initial[0]?.id ?? null,
  );

  const { data: detail, isFetching } = useQuery({
    queryKey: ["sequence", selectedId],
    queryFn: () => (selectedId ? getSequenceAction(selectedId) : null),
    enabled: !!selectedId,
  });

  const selectedSummary =
    sequences.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
      {/* the ledger */}
      <div className="surface-raised overflow-hidden rounded-lg border border-lunari-surface-elevated bg-lunari-surface">
        <div className="border-b border-lunari-surface-elevated px-4 py-2.5">
          <MonoLabel>campaigns · {sequences.length}</MonoLabel>
        </div>
        <ul>
          {sequences.map((s, i) => (
            <li
              key={s.id}
              className="reveal-up border-b border-lunari-surface-elevated last:border-b-0"
              style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}
            >
              <button
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={cn(
                  "planetarium flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-lunari-surface-elevated",
                  s.id === selectedId && "bg-lunari-surface-elevated",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-lunari-cream">
                  {s.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em]",
                    STATUS_STYLE[s.status],
                  )}
                >
                  {s.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* the detail pane */}
      {selectedSummary ? (
        <CampaignDetail
          key={selectedSummary.id}
          summary={selectedSummary}
          detail={detail ?? null}
          loading={isFetching && !detail}
        />
      ) : (
        <div className="surface-raised flex items-center justify-center rounded-lg border border-lunari-surface-elevated bg-lunari-surface px-6 py-12 text-center text-sm text-lunari-neutral-400">
          pick a campaign to see its journey.
        </div>
      )}
    </div>
  );
}

function CampaignDetail({
  summary,
  detail,
  loading,
}: {
  summary: SequenceSummary;
  detail: SequenceRecord | null;
  loading: boolean;
}) {
  const steps: CompiledStep[] = detail ? compileRun(detail.graph).steps : [];
  const nodeById = new Map(
    (detail?.graph.nodes ?? []).map((n) => [n.id, n]),
  );

  return (
    <div className="reveal-up surface-raised space-y-5 rounded-lg border border-lunari-surface-elevated bg-lunari-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            className="truncate text-[20px] text-lunari-cream"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            {summary.name}
          </h2>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em]",
                STATUS_STYLE[summary.status],
              )}
            >
              {summary.status}
            </span>
            <span className="font-mono text-[10px] text-lunari-neutral-500">
              v{summary.version}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {summary.status === "active" ? (
            <RunDueButton sequenceId={summary.id} />
          ) : null}
          <Link
            href={{ pathname: "/sequences", query: { id: summary.id } }}
            className="planetarium flex items-center gap-1.5 rounded-md border border-lunari-surface-elevated px-3 py-2 text-xs text-lunari-neutral-400 hover:bg-lunari-surface-elevated hover:text-lunari-cream"
          >
            <GitBranch className="h-4 w-4 stroke-[1.25]" />
            <span>open in editor</span>
          </Link>
        </div>
      </div>

      {/* the numbers */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="enrolled" value={summary.enrolledCount} />
        <Stat label="replies" value={summary.replyCount} accent />
        <Stat label="steps" value={summary.nodeCount} />
      </div>

      {/* the journey ... the compiled run, the same one the editor previews. */}
      <div>
        <MonoLabel>the journey</MonoLabel>
        {loading ? (
          <p className="mt-3 text-sm text-lunari-neutral-500">
            loading the journey ...
          </p>
        ) : steps.length === 0 ? (
          <p className="mt-3 text-sm text-lunari-neutral-500">
            nothing wired yet ... open the editor to build the sequence.
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {steps.map((step, i) => {
              const Icon = STEP_ICON[step.kind];
              const node = nodeById.get(step.nodeId);
              const data = (node?.data ?? {}) as Record<string, unknown>;
              const variants = Array.isArray(data.variants)
                ? (data.variants as unknown[]).filter(
                    (v) =>
                      v &&
                      typeof (v as Record<string, unknown>).body === "string" &&
                      typeof (v as Record<string, unknown>).weight === "number" &&
                      ((v as Record<string, unknown>).weight as number) > 0,
                  ).length
                : 0;
              const body = typeof data.body === "string" ? data.body : "";
              const combos = step.kind === "send" ? spintaxCombos(body) : 1;
              return (
                <li
                  key={`${step.nodeId}-${i}`}
                  className="flex items-start gap-3 rounded-md border border-lunari-surface-elevated bg-lunari-black/30 px-3 py-2"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-lunari-surface-elevated">
                    <Icon className="h-3.5 w-3.5 stroke-[1.25] text-lunari-neutral-400" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-lunari-cream">
                        {step.title}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-lunari-neutral-500">
                        {step.offsetLabel}
                      </span>
                    </div>
                    {step.kind === "send" ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-lunari-neutral-500">
                        {variants > 0 ? (
                          <span className="text-gen-accent">
                            {variants + 1}-way a/b
                          </span>
                        ) : null}
                        {combos > 1 ? <span>{combos} spintax variations</span> : null}
                        {variants === 0 && combos <= 1 ? (
                          <span>single body</span>
                        ) : null}
                      </div>
                    ) : null}
                    {step.detail ? (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-lunari-neutral-500">
                        {step.detail}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-lunari-surface-elevated bg-lunari-black/30 p-3">
      <MonoLabel>{label}</MonoLabel>
      <div
        className={cn(
          "mt-1 font-mono text-xl tabular-nums",
          accent ? "text-gen-accent" : "text-lunari-cream",
        )}
      >
        {value.toLocaleString("en-US")}
      </div>
    </div>
  );
}
