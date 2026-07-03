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
        {/* top bar ... the hero band. the dollars-not-fuel stat is the focal moment
            ("the tool prints money"), not a label crammed in a toolbar. the ticker
            becomes mono-labeled stat chips that stagger in, and survives to sm (not md). */}
        <header className="border-b border-lunari-surface-elevated bg-lunari-surface/60 px-6 py-3.5 backdrop-blur">
          <div className="flex items-center gap-6">
            <div className="reveal-up min-w-0">
              <HeroStat cents={stats.opportunitiesCents} />
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-500">
                in opportunities since launch
              </div>
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-3">
              {/* chips show from lg up: the fixed 240px rail leaves too little room for
                  three chips + the palette launcher below lg, where they'd clip. */}
              <div className="hidden items-center gap-2 lg:flex">
                <StatChip label="sends today" value={stats.sendsToday} delayMs={40} />
                <StatChip label="replies" value={stats.replies} delayMs={80} />
                <StatChip label="booked" value={stats.booked} accent delayMs={120} />
              </div>
              <CommandPalette />
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

// a mono-labeled momentum chip for the hero band ... the ticker, but designed. reveals
// with a staggered delay so the band has follow-through instead of snapping in flat.
// the booked chip carries the one forest-green accent (gold stays reserved for the $).
function StatChip({
  label,
  value,
  accent = false,
  delayMs,
}: {
  label: string;
  value: number;
  accent?: boolean;
  delayMs: number;
}) {
  return (
    <div
      className="reveal-up surface-raised rounded-md border border-lunari-surface-elevated px-2.5 py-1"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
        {label}
      </div>
      <div
        className={`font-mono text-sm tabular-nums ${accent ? "text-gen-accent" : "text-lunari-cream"}`}
      >
        {value.toLocaleString("en-US")}
      </div>
    </div>
  );
}
