"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  X,
  Sparkles,
  Globe,
  Link2,
  BadgeCheck,
  Radar,
  Loader2,
  MapPin,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { FlameScore } from "@/components/shared/FlameScore";
import { StageChip } from "@/components/shared/StageChip";
import type { ContactDetail, ContactPresenceLink } from "@/lib/types/contact";

function initials(name: string | null): string {
  if (!name) return "?";
  const letters = name
    .trim()
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("");
  return (letters.slice(0, 2) || "?").toUpperCase();
}

function prettyUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

// the lunari mono-label signature for a section divider.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
      {children}
    </span>
  );
}

function LinkRow({ link }: { link: ContactPresenceLink }) {
  const Icon = link.platform === "website" ? Globe : Link2;
  const label = link.handle ? `@${link.handle}` : prettyUrl(link.url);
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className="planetarium group flex items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 hover:border-lunari-surface-elevated hover:bg-lunari-surface-elevated"
    >
      <Icon className="h-4 w-4 shrink-0 stroke-[1.25] text-lunari-neutral-400" />
      <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
        {link.platform}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-lunari-cream/90">
        {label}
      </span>
      {link.verified ? (
        <BadgeCheck
          className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-lunari-cream/70"
          aria-label="verified by the person"
        />
      ) : null}
    </a>
  );
}

type ContactDrawerPanelProps = {
  detail: ContactDetail;
  resolving?: boolean;
  onResolveFootprint: () => void;
  onClose: () => void;
  draftHref: string;
};

// the presentational side drawer: scrim + a right-anchored panel with a sticky
// header, a scrollable middle, and a sticky draft-outreach footer. all data +
// handlers come in as props ... the container (ContactDrawer) owns the fetch +
// the resolve mutation. lunari tokens only, burgundy reserved for gen actions +
// the gen-authored hook, gold untouched.
export function ContactDrawerPanel({
  detail,
  resolving = false,
  onResolveFootprint,
  onClose,
  draftHref,
}: ContactDrawerPanelProps) {
  const company = detail.company?.name ?? null;
  const subtitle = [detail.title, company].filter(Boolean).join("  ·  ");
  const presence = detail.presence;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="close panel"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-lunari-black/60"
      />

      <aside className="planetarium absolute right-0 top-0 flex h-full w-[360px] flex-col border-l border-lunari-surface-elevated bg-lunari-surface shadow-2xl shadow-lunari-black/70">
        {/* sticky header */}
        <header className="flex items-center gap-3 border-b border-lunari-surface-elevated px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lunari-black font-mono text-xs text-lunari-neutral-400">
            {initials(detail.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-lunari-cream">
              {detail.name ?? "unnamed contact"}
            </p>
            {subtitle ? (
              <p className="truncate text-xs text-lunari-neutral-400">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="planetarium flex h-7 w-7 items-center justify-center rounded-md text-lunari-neutral-400 hover:bg-lunari-surface-elevated hover:text-lunari-cream"
          >
            <X className="h-4 w-4 stroke-[1.25]" />
          </button>
        </header>

        {/* scrollable middle */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="flex items-center justify-between">
            <StageChip stage={detail.stage} />
            <FlameScore score={detail.warmthScore} />
          </div>

          {presence?.bio ? (
            <p className="text-xs leading-relaxed text-lunari-neutral-400">
              {presence.bio}
            </p>
          ) : null}

          {detail.location || detail.email || detail.linkedinUrl ? (
            <div className="space-y-1.5">
              {detail.location ? (
                <div className="flex items-center gap-2.5 text-xs text-lunari-cream/90">
                  <MapPin className="h-4 w-4 shrink-0 stroke-[1.25] text-lunari-neutral-400" />
                  <span className="truncate">{detail.location}</span>
                </div>
              ) : null}
              {detail.email ? (
                <div className="flex items-center gap-2.5 text-xs text-lunari-cream/90">
                  <Mail className="h-4 w-4 shrink-0 stroke-[1.25] text-lunari-neutral-400" />
                  <span className="truncate">{detail.email}</span>
                </div>
              ) : null}
              {detail.linkedinUrl ? (
                <a
                  href={detail.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="planetarium flex items-center gap-2.5 text-xs text-lunari-cream/90 hover:text-lunari-cream"
                >
                  <Link2 className="h-4 w-4 shrink-0 stroke-[1.25] text-lunari-neutral-400" />
                  <span className="truncate">{prettyUrl(detail.linkedinUrl)}</span>
                </a>
              ) : null}
            </div>
          ) : null}

          {/* the presence person-graph ... the "find the person" payoff */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>presence</SectionLabel>
              {presence ? (
                <span className="font-mono text-[10px] text-lunari-neutral-500">
                  {presence.sources.join(" + ")}
                </span>
              ) : null}
            </div>

            {presence && presence.links.length > 0 ? (
              <ul className="-mx-2 space-y-0.5">
                {presence.links.map((link) => (
                  <li key={`${link.platform}:${link.url}`}>
                    <LinkRow link={link} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-md border border-dashed border-lunari-surface-elevated px-3 py-4 text-center">
                <p className="text-xs text-lunari-neutral-400">
                  no public presence pulled yet ... find the socials + site
                  they&apos;ve published themselves.
                </p>
                <button
                  type="button"
                  onClick={onResolveFootprint}
                  disabled={resolving}
                  className="planetarium mt-3 inline-flex items-center gap-1.5 rounded-md border border-gen-accent/40 bg-gen-accent-soft px-3 py-1.5 text-xs font-medium text-gen-accent hover:bg-gen-accent/20 disabled:opacity-60"
                >
                  {resolving ? (
                    <Loader2 className="h-4 w-4 animate-spin stroke-[1.5]" />
                  ) : (
                    <Radar className="h-4 w-4 stroke-[1.5]" />
                  )}
                  <span>{resolving ? "finding ..." : "find their presence"}</span>
                </button>
              </div>
            )}
          </section>

          {/* the hook ... gen-authored material the drafter opens with. burgundy
              marks gen-authored content per the design system. */}
          {detail.hook ? (
            <section className="space-y-2">
              <SectionLabel>hook</SectionLabel>
              <p className="rounded-md border-l-2 border-gen-accent bg-gen-accent-soft px-3 py-2 text-xs leading-relaxed text-lunari-cream/90">
                {detail.hook}
              </p>
            </section>
          ) : null}
        </div>

        {/* sticky footer */}
        <footer className="border-t border-lunari-surface-elevated p-4">
          <Link
            href={draftHref as Route}
            className={cn(
              "planetarium flex items-center justify-center gap-1.5 rounded-md",
              "border border-gen-accent/40 bg-gen-accent-soft px-3 py-2",
              "text-sm font-medium text-gen-accent hover:bg-gen-accent/20",
            )}
          >
            <Sparkles className="h-4 w-4 stroke-[1.25]" />
            <span>draft outreach</span>
          </Link>
        </footer>
      </aside>
    </div>
  );
}
