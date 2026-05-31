"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, Sparkles, Trash2, ArrowRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  extractVoiceAction,
  saveVoiceProfileAction,
} from "@/app/actions/voice";
import {
  VOICE_ACTIVATION_THRESHOLD,
  VOICE_MIN_SAMPLES,
  type VoiceFeatures,
  type VoiceSample,
} from "@/lib/types/voice";
import type { VoiceProfile } from "@/lib/supabase/voice";

type Step = "paste" | "extracting" | "preview" | "saving" | "done";

type Field = { id: string; subject: string; body: string };

function makeField(): Field {
  return {
    id: crypto.randomUUID(),
    subject: "",
    body: "",
  };
}

function fieldsToSamples(fields: Field[]): VoiceSample[] {
  return fields
    .map((f) => ({
      subject: f.subject.trim() || undefined,
      body: f.body.trim(),
    }))
    .filter((s) => s.body.length >= 20);
}

// the magic moment in three frames: paste -> preview -> activate. each
// transition uses the planetarium easing already in tokens.css.
export function VoiceOnboarding({
  existing,
}: {
  existing: VoiceProfile | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("paste");
  const [fields, setFields] = useState<Field[]>(() => [
    makeField(),
    makeField(),
    makeField(),
  ]);
  const [features, setFeatures] = useState<VoiceFeatures | null>(null);
  const [error, setError] = useState<string | null>(null);

  const samples = useMemo(() => fieldsToSamples(fields), [fields]);
  const canExtract =
    samples.length >= VOICE_MIN_SAMPLES && step === "paste";

  function addField() {
    if (fields.length >= 15) return;
    setFields((current) => [...current, makeField()]);
  }

  function removeField(id: string) {
    if (fields.length <= VOICE_MIN_SAMPLES) return;
    setFields((current) => current.filter((f) => f.id !== id));
  }

  function updateField(id: string, patch: Partial<Field>) {
    setFields((current) =>
      current.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
  }

  async function onExtract() {
    setError(null);
    setStep("extracting");
    const result = await extractVoiceAction({ samples });
    if (!result.ok) {
      setError(result.error);
      setStep("paste");
      toast.error(result.error);
      return;
    }
    setFeatures(result.features);
    setStep("preview");
  }

  async function onConfirm() {
    if (!features) return;
    setStep("saving");
    const result = await saveVoiceProfileAction({ features, samples });
    if (!result.ok) {
      setError(result.error);
      setStep("preview");
      toast.error(result.error);
      return;
    }
    setStep("done");
    toast.success(
      result.active
        ? `voice activated ... ${result.samples} samples in.`
        : `voice saved ... ${result.samples} of ${VOICE_ACTIVATION_THRESHOLD} samples toward activation.`,
    );
    // small dwell so the success toast registers before redirect.
    setTimeout(() => router.push("/pipeline"), 1200);
  }

  function onRedo() {
    setFeatures(null);
    setStep("paste");
  }

  if (step === "extracting" || step === "saving") {
    return (
      <LoadingFrame
        label={
          step === "extracting" ? "extracting voice ..." : "saving ..."
        }
        hint={
          step === "extracting"
            ? "reading your samples. sonnet is listening for the bits that make it sound like you."
            : "writing to the shared substrate."
        }
      />
    );
  }

  if (step === "preview" && features) {
    return (
      <PreviewFrame
        features={features}
        onConfirm={onConfirm}
        onRedo={onRedo}
        existingActive={existing?.active_for_outreach ?? false}
      />
    );
  }

  if (step === "done") {
    return (
      <LoadingFrame
        label="voice saved ..."
        hint="heading to the pipeline."
      />
    );
  }

  return (
    <PasteFrame
      fields={fields}
      samples={samples}
      error={error}
      canExtract={canExtract}
      onAdd={addField}
      onRemove={removeField}
      onUpdate={updateField}
      onExtract={onExtract}
    />
  );
}

function PasteFrame({
  fields,
  samples,
  error,
  canExtract,
  onAdd,
  onRemove,
  onUpdate,
  onExtract,
}: {
  fields: Field[];
  samples: VoiceSample[];
  error: string | null;
  canExtract: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Field>) => void;
  onExtract: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <p className="text-sm text-lunari-neutral-400">
        paste 3 to 15 of your own cold emails or outreach DMs. gen reads
        them and learns what sounds like you, not what sounds like a
        template. {VOICE_ACTIVATION_THRESHOLD} samples activates the
        per-user voice profile; below that, the dom prior fills in.
      </p>

      <div className="flex flex-col gap-4">
        {fields.map((field, i) => (
          <div
            key={field.id}
            className="planetarium rounded-md border border-lunari-surface-elevated bg-lunari-surface p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
                sample {i + 1}
              </span>
              <button
                type="button"
                onClick={() => onRemove(field.id)}
                disabled={fields.length <= VOICE_MIN_SAMPLES}
                className="planetarium flex items-center gap-1 text-xs text-lunari-neutral-500 hover:text-lunari-crimson disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="remove sample"
              >
                <Trash2 className="h-3 w-3 stroke-[1.25]" />
                <span>remove</span>
              </button>
            </div>
            <input
              type="text"
              value={field.subject}
              onChange={(e) => onUpdate(field.id, { subject: e.target.value })}
              placeholder="subject (optional)"
              className="mb-2 w-full rounded-md border border-lunari-surface-elevated bg-lunari-black px-3 py-2 text-sm text-lunari-cream placeholder:text-lunari-neutral-500 focus:border-gen-accent focus:outline-none"
            />
            <textarea
              value={field.body}
              onChange={(e) => onUpdate(field.id, { body: e.target.value })}
              placeholder="paste the email body here. min 20 characters."
              rows={6}
              className="w-full resize-y rounded-md border border-lunari-surface-elevated bg-lunari-black px-3 py-2 text-sm leading-relaxed text-lunari-cream placeholder:text-lunari-neutral-500 focus:border-gen-accent focus:outline-none"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onAdd}
          disabled={fields.length >= 15}
          className="planetarium flex items-center gap-2 rounded-md border border-lunari-surface-elevated bg-lunari-surface px-3 py-2 text-sm text-lunari-cream hover:bg-lunari-surface-elevated disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Plus className="h-4 w-4 stroke-[1.25]" />
          <span>add another</span>
        </button>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-500">
          {samples.length} / {fields.length} valid
        </span>
      </div>

      {error ? (
        <div className="rounded-md border border-lunari-crimson/40 bg-lunari-surface px-4 py-3 text-sm text-lunari-cream">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onExtract}
          disabled={!canExtract}
          className="planetarium flex items-center gap-2 rounded-md bg-gen-accent px-4 py-2 text-sm font-medium text-lunari-cream hover:bg-gen-accent/90 disabled:cursor-not-allowed disabled:bg-lunari-surface-elevated disabled:text-lunari-neutral-500"
        >
          <Sparkles className="h-4 w-4 stroke-[1.25]" />
          <span>extract voice</span>
          <ArrowRight className="h-4 w-4 stroke-[1.25]" />
        </button>
      </div>
    </div>
  );
}

function LoadingFrame({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 pt-24 text-center">
      <Sparkles className="h-6 w-6 animate-pulse stroke-[1.25] text-gen-accent" />
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
        {label}
      </div>
      <p className="text-sm text-lunari-neutral-400">{hint}</p>
    </div>
  );
}

function PreviewFrame({
  features,
  onConfirm,
  onRedo,
  existingActive,
}: {
  features: VoiceFeatures;
  onConfirm: () => void;
  onRedo: () => void;
  existingActive: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-medium tracking-tight text-lunari-cream">
          this is you
        </h2>
        <p className="text-sm text-lunari-neutral-400">
          every draft from here on adapts to this profile. read carefully
          ... if it doesn&apos;t feel like you, redo with more samples.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FeatureCard label="register">
          <span className="text-sm text-lunari-cream">
            {features.register}
          </span>
        </FeatureCard>

        <FeatureCard label="formality">
          <span className="text-sm text-lunari-cream">
            {features.formality_score.toFixed(1)} / 10
          </span>
        </FeatureCard>

        <FeatureCard label="how you open" className="md:col-span-2">
          <p className="mb-2 text-xs text-lunari-neutral-400">
            {features.salutation_style}
          </p>
          <ul className="space-y-1 text-sm text-lunari-cream">
            {features.opening_patterns.map((opener) => (
              <li key={opener} className="text-lunari-cream/90">
                &ldquo;{opener}&rdquo;
              </li>
            ))}
          </ul>
        </FeatureCard>

        <FeatureCard label="how you close" className="md:col-span-2">
          <p className="mb-2 text-xs text-lunari-neutral-400">
            {features.signoff_style}
          </p>
          <ul className="space-y-1 text-sm text-lunari-cream">
            {features.closing_patterns.map((closer) => (
              <li key={closer} className="text-lunari-cream/90">
                &ldquo;{closer}&rdquo;
              </li>
            ))}
          </ul>
        </FeatureCard>

        <FeatureCard label="your rhythm" className="md:col-span-2">
          <p className="text-sm text-lunari-cream">
            avg <span className="font-mono">{features.sentence_length_avg}</span>{" "}
            words per sentence, variance{" "}
            <span className="font-mono">
              {features.sentence_length_variance.toFixed(1)}
            </span>
            .{" "}
            <span className="text-lunari-neutral-400">
              {features.sentence_length_variance >= 4
                ? "high variance ... your cadence shifts between short hits and long arcs."
                : "tight variance ... your sentences hold a steady rhythm."}
            </span>
          </p>
        </FeatureCard>

        <FeatureCard label="punctuation + emoji">
          <p className="text-sm text-lunari-cream">
            pause marker:{" "}
            <span className="font-mono">
              {features.punctuation_style.pause_marker}
            </span>
            <br />
            em-dashes:{" "}
            <span className="font-mono">
              {features.punctuation_style.uses_em_dashes ? "yes" : "no"}
            </span>
            <br />
            exclamations:{" "}
            <span className="font-mono">
              {features.punctuation_style.exclamation_use}
            </span>
            <br />
            emoji:{" "}
            <span className="font-mono">
              {(features.emoji_signature.frequency * 100).toFixed(0)}%
              {features.emoji_signature.top_used.length > 0
                ? ` (${features.emoji_signature.top_used.join(" ")})`
                : ""}
            </span>
          </p>
        </FeatureCard>

        <FeatureCard label="vocabulary signature">
          <p className="text-sm italic text-lunari-cream/90">
            &ldquo;{features.vocabulary_signature}&rdquo;
          </p>
        </FeatureCard>

        <FeatureCard label="phrases you reach for" className="md:col-span-2">
          <ChipList items={features.idiosyncratic_phrases} tone="positive" />
        </FeatureCard>

        {features.avoided_phrases.length > 0 ? (
          <FeatureCard label="phrases you avoid" className="md:col-span-2">
            <p className="mb-2 text-xs text-lunari-neutral-400">
              these are off-voice. gen will keep them out of every draft.
            </p>
            <ChipList items={features.avoided_phrases} tone="muted" />
          </FeatureCard>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onRedo}
          className="planetarium flex items-center gap-2 rounded-md border border-lunari-surface-elevated bg-lunari-surface px-4 py-2 text-sm text-lunari-cream hover:bg-lunari-surface-elevated"
        >
          <RefreshCw className="h-4 w-4 stroke-[1.25]" />
          <span>redo with more samples</span>
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="planetarium flex items-center gap-2 rounded-md bg-gen-accent px-4 py-2 text-sm font-medium text-lunari-cream hover:bg-gen-accent/90"
        >
          <Sparkles className="h-4 w-4 stroke-[1.25]" />
          <span>
            {existingActive ? "update voice profile" : "this is me ... activate"}
          </span>
        </button>
      </div>
    </div>
  );
}

function FeatureCard({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`planetarium rounded-md border border-lunari-surface-elevated bg-lunari-surface p-4 ${className ?? ""}`}
    >
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
        {label}
      </div>
      {children}
    </div>
  );
}

function ChipList({
  items,
  tone,
}: {
  items: string[];
  tone: "positive" | "muted";
}) {
  const base =
    tone === "positive"
      ? "border-gen-accent/40 bg-gen-accent-soft text-lunari-cream"
      : "border-lunari-surface-elevated bg-lunari-black text-lunari-neutral-400 line-through";
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className={`rounded-full border px-3 py-1 text-xs ${base}`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}
