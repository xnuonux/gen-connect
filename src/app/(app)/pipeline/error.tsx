"use client";

import { useEffect } from "react";

// the pipeline failed to load. named, recoverable, voice-checked ... never a
// raw 500.
export default function PipelineError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="space-y-1.5">
        <h1 className="text-xl font-medium tracking-tight text-lunari-cream">
          the pipeline didn&apos;t load
        </h1>
        <p className="text-sm text-lunari-neutral-400">
          that didn&apos;t land ... give it another shot, or check back in a moment.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="planetarium rounded-md border border-lunari-surface-elevated bg-lunari-surface px-4 py-2 text-sm text-lunari-cream hover:bg-lunari-surface-elevated"
      >
        retry
      </button>
    </div>
  );
}
