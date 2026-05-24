export default function SignalsPage() {
  return (
    <div className="px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-medium tracking-tight">signals</h1>
        <p className="text-sm text-lunari-neutral-400 mt-1">
          live feed of trigger-worthy events. apify substrate, gen-scored.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* deterministic placeholder scores ... random in render is impure and
            breaks under react strict mode + the react-hooks/purity rule. real
            scores arrive week 4 with the apify orchestrator. */}
        {[8, 6, 9].map((score, i) => (
          <div
            key={i}
            className="planetarium rounded-lg border border-lunari-surface-elevated bg-lunari-surface p-4 hover:border-gen-accent/40"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-lunari-neutral-400">
                placeholder signal
              </span>
              <span className="font-mono text-xs text-gen-accent">
                {score}/10
              </span>
            </div>
            <div className="text-sm mb-2">a hiring post at sample co</div>
            <div className="text-xs text-lunari-neutral-400">
              signal scoring lands week 4 with the apify orchestrator.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
