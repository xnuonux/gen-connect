import Link from "next/link";
import type { Route } from "next";
import { Sparkles, CreditCard } from "lucide-react";
import { Providers } from "@/app/providers";
import { RailNav } from "@/app/(app)/RailNav";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { HeroStat } from "@/components/shared/HeroStat";
import { workspaceStats } from "@/lib/supabase/stats";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const stats = await workspaceStats();
  return (
    <div className="lunari-canvas flex h-screen overflow-hidden text-lunari-cream">
      {/* left rail */}
      <aside className="w-60 border-r border-lunari-surface-elevated bg-lunari-surface flex flex-col">
        <div className="px-6 py-5 border-b border-lunari-surface-elevated">
          <Link
            href="/"
            className="font-serif text-xl tracking-tight"
            style={{ fontFamily: "var(--font-cinzel)" }}
          >
            gen
          </Link>
          <div className="mt-1 text-[10px] tracking-[0.25em] uppercase text-lunari-neutral-500 font-mono">
            connect
          </div>
        </div>

        <RailNav />

        <div className="px-3 py-4 border-t border-lunari-surface-elevated space-y-3">
          <Link
            href={"/onboarding/voice" as Route}
            className="planetarium flex items-center gap-3 px-3 py-2 rounded-md text-sm text-lunari-cream/80 hover:text-lunari-cream hover:bg-lunari-surface-elevated"
          >
            <Sparkles className="h-4 w-4 stroke-[1.25] text-gen-accent" />
            <span>voice</span>
          </Link>
          <Link
            href={"/billing" as Route}
            className="planetarium flex items-center gap-3 px-3 py-2 rounded-md text-sm text-lunari-cream/80 hover:text-lunari-cream hover:bg-lunari-surface-elevated"
          >
            <CreditCard className="h-4 w-4 stroke-[1.25] text-lunari-neutral-400" />
            <span>plan</span>
          </Link>
          <div className="px-3 py-2 rounded-md bg-lunari-black/40">
            <div className="text-xs text-lunari-neutral-400 mb-1">domain</div>
            <div className="text-xs font-mono text-lunari-cream/70">
              not connected
            </div>
          </div>
        </div>
      </aside>

      {/* main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* top bar */}
        <header className="h-12 border-b border-lunari-surface-elevated bg-lunari-surface/60 backdrop-blur flex items-center px-6">
          <div className="flex items-baseline gap-2.5">
            <HeroStat cents={stats.opportunitiesCents} />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
              in opportunities since launch
            </span>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <CommandPalette />
            <div className="hidden items-center gap-4 text-xs text-lunari-neutral-400 font-mono md:flex">
              <span>sends today · {stats.sendsToday}</span>
              <span className="text-lunari-surface-elevated">|</span>
              <span>replies · {stats.replies}</span>
              <span className="text-lunari-surface-elevated">|</span>
              <span className="text-gen-accent">booked · {stats.booked}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Providers>{children}</Providers>
        </main>
      </div>
    </div>
  );
}
