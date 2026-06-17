"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Radio,
  Plus,
  X,
  Pause,
  Play,
  Sparkles,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { FlameScore } from "@/components/shared/FlameScore";
import {
  fetchAgents,
  fetchHits,
  createAgentAction,
  setAgentStatusAction,
  dismissHitAction,
  draftFromHitAction,
} from "@/app/actions/signals";
import {
  SIGNAL_TYPES,
  SIGNAL_LABELS,
  DISMISS_REASONS,
  DISMISS_REASON_LABELS,
  hookFromHit,
  type SignalType,
} from "@/lib/types/signal";
import type { SignalAgent, SignalHitRow } from "@/lib/supabase/signals";

function relTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDistanceToNowStrict(d);
}

function hitName(raw: Record<string, unknown>): string {
  const v =
    raw.author_name ?? raw.maker_name ?? raw.name ?? raw.company ?? "someone";
  return typeof v === "string" ? v : "someone";
}

export function SignalsView({
  initialAgents,
  initialHits,
}: {
  initialAgents: SignalAgent[];
  initialHits: SignalHitRow[];
}) {
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data: agents } = useQuery({
    queryKey: ["signal-agents"],
    queryFn: fetchAgents,
    initialData: initialAgents,
    refetchInterval: 30_000,
  });

  const { data: hits } = useQuery({
    queryKey: ["signal-hits"],
    queryFn: fetchHits,
    initialData: initialHits,
    refetchInterval: 20_000,
  });

  const live = useMemo(
    () => hits.filter((h) => h.status === "pending" || h.status === "scored"),
    [hits],
  );

  return (
    <div className="space-y-6 px-8 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-lunari-cream">
            signals
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-lunari-neutral-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gen-accent opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gen-accent" />
            </span>
            detected the moment outreach becomes relevant ... polsia schedules, gen
            detects.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="planetarium flex items-center gap-2 rounded-md bg-gen-accent px-3 py-2 text-sm font-medium text-lunari-cream hover:bg-gen-accent/90"
        >
          <Plus className="h-4 w-4 stroke-[1.25]" />
          <span>create agent</span>
        </button>
      </div>

      {/* live feed */}
      <section>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
          live feed · {live.length}
        </span>
        <div className="mt-3 space-y-2">
          {live.length === 0 ? (
            <div className="rounded-lg border border-lunari-surface-elevated bg-lunari-surface px-6 py-12 text-center text-sm text-lunari-neutral-400">
              no hits yet ... spin up an agent and gen starts watching for the
              moment. the second someone fits, it lands here.
            </div>
          ) : (
            live.map((hit) => <HitCard key={hit.id} hit={hit} />)
          )}
        </div>
      </section>

      {/* agent grid */}
      <section>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
          agents · {agents.length}
        </span>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {agents.length === 0 ? (
            <div className="col-span-full rounded-lg border border-lunari-surface-elevated bg-lunari-surface px-6 py-10 text-center text-sm text-lunari-neutral-400">
              no agents running. an agent watches one signal type for your icp.
            </div>
          ) : (
            agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)
          )}
        </div>
      </section>

      {wizardOpen ? (
        <AgentWizard
          onClose={() => setWizardOpen(false)}
          onCreated={() => {
            setWizardOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["signal-agents"] });
          }}
        />
      ) : null}
    </div>
  );
}

function HitCard({ hit }: { hit: SignalHitRow }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dismissing, setDismissing] = useState(false);

  const draft = useMutation({
    mutationFn: async () => {
      const r = await draftFromHitAction({ hitId: hit.id });
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSuccess: (r) => {
      toast.success("pulled into the pipeline ... drafting now.");
      router.push(`/draft/${r.contactId}` as Route);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "couldn't draft that."),
  });

  const dismiss = useMutation({
    mutationFn: async (reason: string) => {
      const r = await dismissHitAction({ hitId: hit.id, reason });
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSuccess: () => {
      toast.success("dismissed ... gen learns from it.");
      void queryClient.invalidateQueries({ queryKey: ["signal-hits"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "couldn't dismiss that."),
  });

  return (
    <div className="planetarium rounded-lg border border-lunari-surface-elevated bg-lunari-surface p-4 hover:border-gen-accent/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-lunari-surface-elevated px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-lunari-neutral-400">
              {SIGNAL_LABELS[hit.signalType]}
            </span>
            <span className="text-sm text-lunari-cream">
              {hitName(hit.raw)}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-lunari-cream/80">
            {hookFromHit(hit.signalType, hit.raw)}
          </p>
          {hit.aiRationale ? (
            <p className="mt-1 font-mono text-[10px] text-lunari-neutral-500">
              {hit.aiRationale}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <FlameScore
            score={(hit.aiScore ?? 0) * 10}
            loading={hit.aiScore == null}
          />
          <span className="font-mono text-[9px] text-lunari-neutral-500">
            {relTime(hit.detectedAt)} ago
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => draft.mutate()}
          disabled={draft.isPending}
          className="planetarium flex items-center gap-1.5 rounded-md bg-gen-accent px-3 py-1.5 text-xs font-medium text-lunari-cream hover:bg-gen-accent/90 disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5 stroke-[1.25]" />
          <span>{draft.isPending ? "pulling in ..." : "draft outreach"}</span>
        </button>
        {dismissing ? (
          <select
            autoFocus
            defaultValue=""
            disabled={dismiss.isPending}
            onChange={(e) => {
              if (e.target.value) dismiss.mutate(e.target.value);
            }}
            onBlur={() => setDismissing(false)}
            className="rounded-md border border-lunari-surface-elevated bg-lunari-black px-2 py-1.5 text-xs text-lunari-cream/90 focus:outline-none"
          >
            <option value="">why dismiss ...</option>
            {DISMISS_REASONS.map((r) => (
              <option key={r} value={r} className="bg-lunari-surface">
                {DISMISS_REASON_LABELS[r]}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            onClick={() => setDismissing(true)}
            className="planetarium rounded-md px-3 py-1.5 text-xs text-lunari-neutral-400 hover:bg-lunari-surface-elevated hover:text-lunari-cream"
          >
            dismiss
          </button>
        )}
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: SignalAgent }) {
  const queryClient = useQueryClient();
  const industry = Array.isArray(agent.icp.industry)
    ? (agent.icp.industry as string[]).join(", ")
    : "";

  const toggle = useMutation({
    mutationFn: async () => {
      const next = agent.status === "active" ? "paused" : "active";
      const r = await setAgentStatusAction(agent.id, next);
      if (!r.ok) throw new Error(r.error);
      return next;
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["signal-agents"] }),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "couldn't update agent."),
  });

  const active = agent.status === "active";

  return (
    <div className="rounded-lg border border-lunari-surface-elevated bg-lunari-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm text-lunari-cream">{agent.name}</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
            {SIGNAL_LABELS[agent.signalType]}
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em]",
            active
              ? "bg-gen-accent-soft text-gen-accent"
              : "bg-lunari-surface-elevated text-lunari-neutral-400",
          )}
        >
          {agent.status}
        </span>
      </div>

      {industry ? (
        <p className="mt-2 truncate text-xs text-lunari-neutral-400">
          {industry}
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-[10px] text-lunari-neutral-500">
          {agent.hitCount7d} hits · 7d
        </span>
        <button
          type="button"
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
          className="planetarium flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-lunari-neutral-400 hover:bg-lunari-surface-elevated hover:text-lunari-cream disabled:opacity-50"
        >
          {active ? (
            <>
              <Pause className="h-3.5 w-3.5 stroke-[1.25]" />
              <span>pause</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 stroke-[1.25]" />
              <span>resume</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

const WIZARD_STEPS = ["icp", "signal", "ramp", "goal"] as const;

function csv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function AgentWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [signalType, setSignalType] = useState<SignalType>("searching_for");
  const [industry, setIndustry] = useState("");
  const [geo, setGeo] = useState("");
  const [role, setRole] = useState("");
  const [precision, setPrecision] = useState(50);
  const [maxHits, setMaxHits] = useState(30);
  const [goal, setGoal] = useState("");
  const [pains, setPains] = useState("");
  const [tone, setTone] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const r = await createAgentAction({
        name: name.trim() || `${signalType} watcher`,
        signalType,
        icp: { industry: csv(industry), geo: csv(geo), role: csv(role) },
        objective: { goal: goal.trim(), pain_points: csv(pains), tone: tone.trim() },
        precision,
        maxHitsPerDay: maxHits,
      });
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSuccess: () => {
      toast.success("agent live ... gen is watching.");
      onCreated();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "couldn't create that agent."),
  });

  const last = step === WIZARD_STEPS.length - 1;

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
            <Radio className="h-4 w-4 stroke-[1.25] text-gen-accent" />
            <span className="text-sm text-lunari-cream">new signal agent</span>
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

        {/* step rail */}
        <div className="flex gap-1.5 px-5 pt-4">
          {WIZARD_STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full",
                i <= step ? "bg-gen-accent" : "bg-lunari-surface-elevated",
              )}
            />
          ))}
        </div>

        <div className="space-y-3 px-5 py-4">
          {step === 0 ? (
            <>
              <Label>your icp ... who fits</Label>
              <Field label="agent name" value={name} onChange={setName} placeholder="fintech founders watch" />
              <Field label="industry (comma sep)" value={industry} onChange={setIndustry} placeholder="fintech, dev tools" />
              <Field label="geo (comma sep)" value={geo} onChange={setGeo} placeholder="us, eu" />
              <Field label="role (comma sep)" value={role} onChange={setRole} placeholder="founder, head of growth" />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Label>the signal + how precise</Label>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
                  signal type
                </span>
                <select
                  value={signalType}
                  onChange={(e) => setSignalType(e.target.value as SignalType)}
                  className="mt-1 w-full rounded-md border border-lunari-surface-elevated bg-lunari-black px-2 py-2 text-sm text-lunari-cream focus:outline-none"
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
                    precision
                  </span>
                  <span className="font-mono text-[10px] text-lunari-neutral-400">
                    {precision < 34 ? "discovery" : precision < 67 ? "balanced" : "high precision"}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={precision}
                  onChange={(e) => setPrecision(Number(e.target.value))}
                  className="mt-2 w-full accent-gen-accent"
                />
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Label>ramp ... how many a day</Label>
              <Field
                label="max hits per day"
                value={String(maxHits)}
                onChange={(v) => setMaxHits(Math.max(1, Math.min(500, Number(v) || 30)))}
                placeholder="30"
              />
              <p className="text-xs text-lunari-neutral-500">
                overflow rolls to tomorrow, then ages out ... no silent drop.
              </p>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Label>the goal ... the 5-angle anchor</Label>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
                  what are you trying to get them to do?
                </span>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  rows={2}
                  placeholder="book a 15-min look at the voice-match flow"
                  className="mt-1 w-full resize-none rounded-md border border-lunari-surface-elevated bg-lunari-black px-2 py-2 text-sm text-lunari-cream placeholder:text-lunari-neutral-500 focus:outline-none"
                />
              </div>
              <Field label="pain points (comma sep)" value={pains} onChange={setPains} placeholder="cold drafts sound like a bot" />
              <Field label="tone note" value={tone} onChange={setTone} placeholder="peer to peer, not salesy" />
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-lunari-surface-elevated px-5 py-3.5">
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="planetarium flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-lunari-neutral-400 hover:text-lunari-cream"
          >
            <ChevronLeft className="h-4 w-4 stroke-[1.25]" />
            <span>{step === 0 ? "cancel" : "back"}</span>
          </button>
          {last ? (
            <button
              type="button"
              onClick={() => create.mutate()}
              disabled={create.isPending}
              className="planetarium flex items-center gap-1.5 rounded-md bg-gen-accent px-3 py-1.5 text-xs font-medium text-lunari-cream hover:bg-gen-accent/90 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4 stroke-[1.25]" />
              <span>{create.isPending ? "creating ..." : "create agent"}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="planetarium flex items-center gap-1.5 rounded-md bg-gen-accent px-3 py-1.5 text-xs font-medium text-lunari-cream hover:bg-gen-accent/90"
            >
              <span>next</span>
              <ChevronRight className="h-4 w-4 stroke-[1.25]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-lunari-surface-elevated bg-lunari-black px-2 py-2 text-sm text-lunari-cream placeholder:text-lunari-neutral-500 focus:outline-none focus:ring-1 focus:ring-gen-accent"
      />
    </div>
  );
}
