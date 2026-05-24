import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* subtle radial gradient */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 50% 30%, var(--gen-accent-soft) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl">
        <div className="mb-8 flex items-center gap-3 text-xs tracking-[0.3em] uppercase text-lunari-neutral-400">
          <span className="h-1 w-1 rounded-full bg-gen-accent" />
          lunari titans
          <span className="h-1 w-1 rounded-full bg-gen-accent" />
        </div>

        <h1
          className="font-serif text-6xl md:text-7xl mb-6 tracking-tight"
          style={{ fontFamily: "var(--font-cinzel)" }}
        >
          gen connect
        </h1>

        <p className="text-lg md:text-xl text-lunari-cream/80 mb-10 text-balance leading-relaxed lowercase">
          the outreach tool where every email sounds like you wrote it and every
          campaign feels like a real instrument.
        </p>

        <Link
          href="/pipeline"
          className="planetarium px-8 py-3 rounded-md bg-gen-accent text-lunari-cream hover:bg-gen-accent/90 hover:scale-[1.02] font-medium tracking-wide"
        >
          open the pipeline
        </Link>

        <div className="mt-16 flex items-center gap-2 text-xs tracking-[0.2em] uppercase text-lunari-neutral-500 font-mono">
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
