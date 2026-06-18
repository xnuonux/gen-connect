"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  Users,
  Inbox,
  Radio,
  GitBranch,
  Zap,
  Workflow,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const tabs = [
  { href: "/pipeline", label: "pipeline", icon: Users },
  { href: "/unibox", label: "unibox", icon: Inbox },
  { href: "/signals", label: "signals", icon: Radio },
  { href: "/campaigns", label: "campaigns", icon: GitBranch },
  { href: "/triggers", label: "triggers", icon: Zap },
  { href: "/sequences", label: "sequences", icon: Workflow },
  { href: "/deliverability", label: "deliverability", icon: ShieldCheck },
] as const;

// the left-rail nav. client-only so it can light the active tab off the path.
// forest green stays off navigation (it is gen's content signature, not a nav
// accent) ... the active tab reads in elevated surface + a neutral left bar.
// the gen link is the one exception: it IS a gen surface, so it wears the green.
export function RailNav() {
  const pathname = usePathname();
  const active = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="flex-1 py-4 px-3 space-y-0.5">
      <Link
        href={"/gen" as Route}
        aria-current={active("/gen") ? "page" : undefined}
        className={cn(
          "planetarium flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-gen-accent hover:translate-x-0.5 hover:bg-gen-accent-soft",
          active("/gen") && "bg-gen-accent-soft",
        )}
      >
        <Sparkles className="h-4 w-4 stroke-[1.25]" />
        <span>gen</span>
      </Link>
      <div className="my-1.5 h-px bg-lunari-surface-elevated" />
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const on = active(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href as Route}
            aria-current={on ? "page" : undefined}
            className={cn(
              "planetarium relative flex items-center gap-3 px-3 py-2 rounded-md text-sm",
              on
                ? "bg-lunari-surface-elevated text-lunari-cream"
                : "text-lunari-cream/80 hover:translate-x-0.5 hover:text-lunari-cream hover:bg-lunari-surface-elevated",
            )}
          >
            {on ? (
              <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-lunari-cream/50" />
            ) : null}
            <Icon className="h-4 w-4 stroke-[1.25]" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
