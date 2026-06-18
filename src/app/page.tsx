import Link from "next/link";

export default function Home() {
  return (
    <main className="lunari-canvas relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* a deeper bloom focused behind the hero ... the light in the room */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(42% 50% at 50% 42%, var(--gen-accent-soft) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 flex max-w-2xl flex-col items-center text-center">
        <div className="mb-9 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.32em] text-lunari-neutral-400">
          <span className="h-1 w-1 rounded-full bg-gen-accent" />
          lunari titans
          <span className="h-1 w-1 rounded-full bg-gen-accent" />
        </div>

        <h1
          className="text-6xl tracking-tight md:text-7xl"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          gen connect
        </h1>

        {/* the gold hairline ... a single thread of light, the one gold moment */}
        <div className="mt-6 h-px w-24 bg-gradient-to-r from-transparent via-lunari-gold to-transparent opacity-70" />

        <p className="mt-7 max-w-xl text-balance text-lg leading-relaxed text-lunari-cream/75 md:text-xl">
          the outreach tool where every email sounds like you wrote it and every
          campaign feels like a real instrument.
        </p>

        <Link
          href="/pipeline"
          className="planetarium surface-raised mt-10 rounded-md bg-gen-accent px-8 py-3 font-medium tracking-wide text-lunari-cream hover:bg-gen-accent/90 hover:shadow-[0_0_44px_-8px_var(--gen-accent)]"
        >
          open the pipeline
        </Link>

        <div className="mt-16 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-lunari-neutral-500">
          <span>voice-matched</span>
          <span className="text-gen-accent">·</span>
          <span>signal-driven</span>
          <span className="text-gen-accent">·</span>
          <span>closer instinct</span>
        </div>
      </div>
    </main>
  );
}
