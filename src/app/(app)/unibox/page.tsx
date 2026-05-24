export default function UniboxPage() {
  return (
    <div className="grid grid-cols-[320px_1fr_320px] h-full">
      {/* thread list */}
      <aside className="border-r border-lunari-surface-elevated bg-lunari-surface">
        <div className="px-4 py-3 border-b border-lunari-surface-elevated">
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-lunari-neutral-400">
            threads
          </div>
        </div>
        <div className="p-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="planetarium p-3 rounded-md bg-lunari-black/40 hover:bg-lunari-surface-elevated cursor-pointer"
            >
              <div className="text-sm">placeholder thread {i}</div>
              <div className="text-xs text-lunari-neutral-400 mt-1 truncate">
                inbound parsing wires up in week 2.
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* thread view */}
      <section className="flex flex-col">
        <div className="px-6 py-4 border-b border-lunari-surface-elevated">
          <div className="text-sm">select a thread to read</div>
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-lunari-neutral-500 font-mono">
          unibox empty ... inbound parser wires up in week 2
        </div>
        <div className="border-t border-lunari-surface-elevated p-4 bg-lunari-surface">
          <div className="rounded-md border border-lunari-surface-elevated bg-lunari-black/50 p-3 text-sm text-lunari-neutral-400">
            inline gen draft composer mounts here ... claude sonnet 4.6,
            streaming, confidence chip in burgundy.
          </div>
        </div>
      </section>

      {/* contact context */}
      <aside className="border-l border-lunari-surface-elevated bg-lunari-surface p-4">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-lunari-neutral-400 mb-3">
          contact
        </div>
        <div className="text-xs text-lunari-neutral-400">
          no contact selected
        </div>
      </aside>
    </div>
  );
}
