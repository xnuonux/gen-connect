import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";

// the honest not-yet state ... a tab that is real but unlit gets a dom-voice
// line + the actual next move, never a dead "coming soon" placeholder. matches
// the design-system empty-state rule: one sentence, one CTA, a hint of the shape.
export function ComingSoon({
  label,
  line,
  cta,
}: {
  label: string;
  line: string;
  cta?: { href: Route; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-lunari-surface-elevated bg-lunari-surface px-6 py-16 text-center">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-500">
        {label}
      </span>
      <p className="max-w-sm text-sm text-lunari-neutral-400">{line}</p>
      {cta ? (
        <Link
          href={cta.href}
          className="planetarium flex items-center gap-1.5 rounded-md border border-lunari-surface-elevated bg-lunari-surface px-3 py-1.5 text-xs text-lunari-cream hover:bg-lunari-surface-elevated"
        >
          <span>{cta.label}</span>
          <ArrowRight className="h-4 w-4 stroke-[1.25]" />
        </Link>
      ) : null}
    </div>
  );
}
