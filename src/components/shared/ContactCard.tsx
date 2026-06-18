import Link from "next/link";
import type { Route } from "next";
import { formatDistanceToNowStrict } from "date-fns";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { FlameScore } from "@/components/shared/FlameScore";
import type { Contact } from "@/lib/types/contact";

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const letters = parts.map((part) => part[0] ?? "").join("");
  return (letters.slice(0, 2) || "?").toUpperCase();
}

function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNowStrict(date);
}

type ContactCardProps = {
  contact: Contact;
  selected?: boolean;
  dragging?: boolean;
  // when set, a selected card reveals a "draft outreach" link to the studio.
  draftHref?: string;
} & React.ComponentPropsWithRef<"div">;

// the presentational contact card. no drag logic lives here ... KanbanCard
// wraps this with dnd-kit, and the side panel will reuse it untouched.
export function ContactCard({
  contact,
  selected = false,
  dragging = false,
  draftHref,
  className,
  ...props
}: ContactCardProps) {
  const company = contact.company?.name ?? null;
  const subtitle = [contact.title, company].filter(Boolean).join("  ·  ");
  const stamp = relativeTime(contact.lastActionAt ?? contact.createdAt);

  return (
    <div
      className={cn(
        "planetarium surface-raised select-none rounded-md border bg-lunari-surface p-3",
        "border-lunari-surface-elevated hover:-translate-y-px hover:bg-lunari-surface-elevated",
        selected && "border-gen-accent ring-1 ring-gen-accent",
        dragging && "rotate-[1deg] shadow-xl shadow-lunari-black/70",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lunari-black font-mono text-[10px] text-lunari-neutral-400">
          {initials(contact.name)}
        </span>
        <span className="truncate text-sm font-medium text-lunari-cream">
          {contact.name ?? "unnamed contact"}
        </span>
      </div>

      {subtitle ? (
        <p className="mt-2 truncate text-xs text-lunari-neutral-400">
          {subtitle}
        </p>
      ) : null}

      {/* the why-they're-here breadcrumb ... only on signal-sourced cards. */}
      {contact.source === "signal" && contact.provenance ? (
        <p className="mt-1.5 flex items-start gap-1 text-[11px] text-lunari-neutral-500">
          <span aria-hidden>↳</span>
          <span className="truncate">{contact.provenance}</span>
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <FlameScore score={contact.warmthScore} />
        {stamp ? (
          <span className="font-mono text-[10px] text-lunari-neutral-500">
            {stamp}
          </span>
        ) : null}
      </div>

      {selected && draftHref && !dragging ? (
        <Link
          href={draftHref as Route}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="planetarium mt-3 flex items-center justify-center gap-1.5 rounded-md border border-gen-accent/40 bg-gen-accent-soft px-2.5 py-1.5 text-xs font-medium text-gen-accent hover:bg-gen-accent/20"
        >
          <Sparkles className="h-4 w-4 stroke-[1.25]" />
          <span>draft outreach</span>
        </Link>
      ) : null}
    </div>
  );
}
