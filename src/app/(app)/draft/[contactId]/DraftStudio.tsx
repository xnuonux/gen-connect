"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Sparkles, RefreshCw, Check, Copy, ArrowLeft, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { FlameScore } from "@/components/shared/FlameScore";
import { Skeleton } from "@/components/ui/skeleton";
import {
  generateDraftAction,
  overrideAngleAction,
} from "@/app/actions/drafts";
import { enrichContactAction } from "@/app/actions/enrichment";
import { ANGLE_LABELS, type AngleType } from "@/lib/types/draft";
import type { DraftRecord, DraftAngleRecord } from "@/lib/supabase/drafts";

type StudioContact = {
  id: string;
  name: string | null;
  title: string | null;
  company: string | null;
};

// the judge's weighted total runs 0 to 55 (voice_match carries x1.5). map it
// to a 0-10 flame so it reads next to the warmth score on the pipeline.
function toFlame(weightedTotal: number): number {
  return Math.round((weightedTotal / 5.5) * 10) / 10;
}

export function DraftStudio({
  contact,
  initialDraft,
  voiceActive,
  initialHook,
  initialNeedsManual,
}: {
  contact: StudioContact;
  initialDraft: DraftRecord | null;
  voiceActive: boolean;
  initialHook: string | null;
  initialNeedsManual: boolean;
}) {
  const [draft, setDraft] = useState<DraftRecord | null>(initialDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(
    initialDraft?.user_override_angle_id ??
      initialDraft?.winning_angle_id ??
      null,
  );
  const [hook, setHook] = useState<string | null>(initialHook);
  const [needsManual, setNeedsManual] = useState<boolean>(initialNeedsManual);
  const [enriching, setEnriching] = useState(false);
  const [enrichSummary, setEnrichSummary] = useState<{
    costCents: number;
    sources: string[];
    emailStatus: string | null;
  } | null>(null);

  async function onEnrich() {
    setEnriching(true);
    const result = await enrichContactAction({ contactId: contact.id });
    setEnriching(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const newHook = result.run.fields.hook ?? null;
    setHook(newHook);
    setNeedsManual(result.run.needsManual);
    setEnrichSummary({
      costCents: result.run.totalCostCents,
      sources: result.run.results
        .filter((r) => r.status === "ok")
        .map((r) => r.source),
      emailStatus: result.run.fields.email_status ?? null,
    });
    toast.success(
      newHook
        ? "enriched ... the hook will sharpen the angles."
        : "enrichment ran ... no hook found, flagged for a manual look.",
    );
  }

  // best angle first, by the judge's weighted score.
  const ordered = useMemo(() => {
    if (!draft) return [];
    return [...draft.angles].sort(
      (a, b) => (b.score?.weighted_total ?? 0) - (a.score?.weighted_total ?? 0),
    );
  }, [draft]);

  async function onGenerate() {
    setBusy(true);
    setError(null);
    const result = await generateDraftAction({ contactId: contact.id });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    setDraft(result.draft);
    setPicked(result.draft.winning_angle_id);
    toast.success("five angles in. winner badged in burgundy.");
  }

  async function onPick(angle: DraftAngleRecord) {
    if (!draft) return;
    // optimistic, with snap-back ... same pattern as the kanban move. if the
    // override doesn't persist, the ring reverts instead of lying.
    const prev = picked;
    setPicked(angle.id);
    const result = await overrideAngleAction({
      draftId: draft.id,
      angleId: angle.id,
    });
    if (!result.ok) {
      setPicked(prev);
      toast.error(result.error);
      return;
    }
    toast.success(`locked in: ${ANGLE_LABELS[angle.angle_type]}.`);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link
        href={"/pipeline" as Route}
        className="planetarium flex w-fit items-center gap-1.5 text-xs text-lunari-neutral-400 hover:text-lunari-cream"
      >
        <ArrowLeft className="h-4 w-4 stroke-[1.25]" />
        <span>back to pipeline</span>
      </Link>

      {!voiceActive ? (
        <div className="rounded-md border border-gen-accent/40 bg-gen-accent-soft px-4 py-3 text-sm text-lunari-cream">
          drafting in the dom prior for now.{" "}
          <Link
            href={"/onboarding/voice" as Route}
            className="font-medium text-gen-accent underline-offset-2 hover:underline"
          >
            show gen your voice
          </Link>{" "}
          and every angle tightens to sound like you.
        </div>
      ) : null}

      <EnrichStrip
        hook={hook}
        needsManual={needsManual}
        enriching={enriching}
        summary={enrichSummary}
        onEnrich={onEnrich}
      />

      {!draft ? (
        busy ? (
          <GeneratingAngles />
        ) : (
          <EmptyState busy={busy} error={error} onGenerate={onGenerate} />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
              5 angles · winner badged
            </span>
            <button
              type="button"
              onClick={onGenerate}
              disabled={busy}
              className="planetarium flex items-center gap-2 rounded-md border border-lunari-surface-elevated bg-lunari-surface px-3 py-1.5 text-xs text-lunari-cream hover:bg-lunari-surface-elevated disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw
                className={cn("h-4 w-4 stroke-[1.25]", busy && "animate-spin")}
              />
              <span>{busy ? "regenerating ..." : "regenerate all five"}</span>
            </button>
          </div>

          {ordered.map((angle, i) => (
            <AngleCard
              key={angle.id}
              angle={angle}
              index={i}
              picked={picked === angle.id}
              onPick={() => onPick(angle)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EnrichStrip({
  hook,
  needsManual,
  enriching,
  summary,
  onEnrich,
}: {
  hook: string | null;
  needsManual: boolean;
  enriching: boolean;
  summary: {
    costCents: number;
    sources: string[];
    emailStatus: string | null;
  } | null;
  onEnrich: () => void;
}) {
  return (
    <div className="rounded-md border border-lunari-surface-elevated bg-lunari-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
          enrichment
        </span>
        <button
          type="button"
          onClick={onEnrich}
          disabled={enriching}
          className="planetarium flex items-center gap-2 rounded-md border border-lunari-surface-elevated bg-lunari-surface px-3 py-1.5 text-xs text-lunari-cream hover:bg-lunari-surface-elevated disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Search
            className={cn("h-4 w-4 stroke-[1.25]", enriching && "animate-pulse")}
          />
          <span>
            {enriching ? "enriching ..." : hook ? "re-enrich" : "enrich"}
          </span>
        </button>
      </div>

      {hook ? (
        <p className="mt-2 text-sm text-lunari-cream">
          hook ...{" "}
          <span className="text-lunari-cream/90">{hook}</span>
        </p>
      ) : (
        <p className="mt-2 text-xs text-lunari-neutral-400">
          no personalization hook yet. enrich to pull role context + recent
          activity ... the angles get sharper with one.
        </p>
      )}

      {needsManual ? (
        <p className="mt-1 text-xs text-lunari-neutral-400">
          needs a manual look ... no configured provider filled the required
          fields.
        </p>
      ) : null}

      {summary ? (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-lunari-neutral-500">
          {summary.sources.length
            ? `sources: ${summary.sources.join(", ")} · `
            : "no providers configured · "}
          {summary.costCents.toFixed(2)}c
          {summary.emailStatus
            ? ` · email ${summary.emailStatus}${summary.emailStatus === "valid" ? " (verified)" : ""}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

// the 8-12s opus wait ... a skeleton of the five cards beats a spinner. matches
// the design-system "skeleton, not spinner" rule + the structured-output latency.
function GeneratingAngles() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
        writing five angles, then judging them ...
      </span>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{ animationDelay: `${i * 55}ms` }}
          className="reveal-up rounded-md border border-lunari-surface-elevated bg-lunari-surface p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="h-4 w-2/3" />
          <div className="mt-2 space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  busy,
  error,
  onGenerate,
}: {
  busy: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-lunari-surface-elevated bg-lunari-surface px-6 py-16 text-center">
      <Sparkles
        className={cn(
          "h-6 w-6 stroke-[1.25] text-gen-accent",
          busy && "animate-pulse",
        )}
      />
      <div className="flex flex-col gap-1">
        <p className="text-sm text-lunari-cream">
          {busy
            ? "writing five angles, then judging them ..."
            : "no draft yet. gen writes five distinct angles, scores them, and badges the one most likely to get a reply."}
        </p>
        <p className="text-xs text-lunari-neutral-400">
          shared context · outcome promise · provocation · utility offer ·
          curiosity hook
        </p>
      </div>
      {error ? (
        <div className="rounded-md border border-lunari-crimson/40 bg-lunari-surface px-4 py-2 text-sm text-lunari-cream">
          {error}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onGenerate}
        disabled={busy}
        className="planetarium flex items-center gap-2 rounded-md bg-gen-accent px-4 py-2 text-sm font-medium text-lunari-cream hover:bg-gen-accent/90 disabled:cursor-not-allowed disabled:bg-lunari-surface-elevated disabled:text-lunari-neutral-500"
      >
        <Sparkles className="h-4 w-4 stroke-[1.25]" />
        <span>{busy ? "drafting ..." : "draft five angles"}</span>
      </button>
    </div>
  );
}

function AngleCard({
  angle,
  index,
  picked,
  onPick,
}: {
  angle: DraftAngleRecord;
  index: number;
  picked: boolean;
  onPick: () => void;
}) {
  const isWinner = angle.score?.is_winner ?? false;
  const flame = angle.score ? toFlame(angle.score.weighted_total) : 0;

  function onCopy() {
    const text = `${angle.subject}\n\n${angle.body}`;
    void navigator.clipboard.writeText(text).then(
      () => toast.success("copied ... paste it wherever you send."),
      () => toast.error("couldn't copy ... select and copy by hand."),
    );
  }

  return (
    <div
      style={{ animationDelay: `${index * 55}ms` }}
      className={cn(
        "reveal-up planetarium rounded-md border bg-lunari-surface p-4",
        picked
          ? "border-gen-accent ring-1 ring-gen-accent"
          : "border-lunari-surface-elevated",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
            {ANGLE_LABELS[angle.angle_type as AngleType]}
          </span>
          {isWinner ? (
            <span className="rounded-full border border-gen-accent/50 bg-gen-accent-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-gen-accent">
              winner
            </span>
          ) : null}
        </div>
        <FlameScore score={flame} />
      </div>

      <p className="text-sm font-medium text-lunari-cream">{angle.subject}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-lunari-cream/90">
        {angle.body}
      </p>

      {angle.score ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-lunari-neutral-500">
          <span>rel {angle.score.relevance.toFixed(0)}</span>
          <span className="text-lunari-neutral-400">
            voice {angle.score.voice_match.toFixed(0)}
          </span>
          <span>open {angle.score.opening_strength.toFixed(0)}</span>
          <span>ask {angle.score.ask_clarity.toFixed(0)}</span>
          <span>reply {angle.score.expected_reply_rate.toFixed(0)}</span>
        </div>
      ) : null}

      {angle.rationale ? (
        <p className="mt-3 text-xs italic text-lunari-neutral-400">
          why this angle ... {angle.rationale}
        </p>
      ) : null}

      {angle.score?.evidence ? (
        <details className="mt-2 text-xs text-lunari-neutral-400">
          <summary className="cursor-pointer text-lunari-neutral-500 hover:text-lunari-cream">
            the judge&apos;s read
          </summary>
          <p className="mt-1 leading-relaxed">{angle.score.evidence}</p>
        </details>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onPick}
          className={cn(
            "planetarium flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium",
            picked
              ? "bg-gen-accent text-lunari-cream"
              : "border border-lunari-surface-elevated bg-lunari-surface text-lunari-cream hover:bg-lunari-surface-elevated",
          )}
        >
          {picked ? (
            <>
              <Check className="h-4 w-4 stroke-[1.25]" />
              <span>using this angle</span>
            </>
          ) : (
            <span>use this angle</span>
          )}
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="planetarium flex items-center gap-2 rounded-md border border-lunari-surface-elevated bg-lunari-surface px-3 py-1.5 text-xs text-lunari-neutral-400 hover:bg-lunari-surface-elevated hover:text-lunari-cream"
        >
          <Copy className="h-4 w-4 stroke-[1.25]" />
          <span>copy</span>
        </button>
      </div>
    </div>
  );
}
