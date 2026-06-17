import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { listSequences } from "@/lib/supabase/sequences";
import { cn } from "@/lib/utils/cn";
import type { SequenceStatus } from "@/lib/types/sequence";

// campaigns reads the same gc_sequences the editor writes ... a sequence IS a
// campaign once contacts enroll. this is the at-a-glance ledger: who is running,
// how many are in, how many replied. clicking a row opens it on the canvas.

const STATUS_STYLE: Record<SequenceStatus, string> = {
  draft: "bg-lunari-surface-elevated text-lunari-neutral-400",
  active: "bg-gen-accent-soft text-gen-accent",
  paused: "bg-lunari-surface-elevated text-lunari-gold",
  archived: "bg-lunari-surface-elevated text-lunari-neutral-500",
};

export default async function CampaignsPage() {
  const sequences = await listSequences();

  return (
    <div className="space-y-6 px-8 py-6">
      <PageHeader
        title="campaigns"
        subtitle="sequences as visual instruments ... enrolled counts, replies, status, step by step."
      />

      {sequences.length === 0 ? (
        <ComingSoon
          label="campaigns"
          line="no campaigns running yet. build a sequence on the canvas, then enroll a segment from the pipeline and watch the steps fire."
          cta={{ href: "/sequences", label: "open the sequence editor" }}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-lunari-surface-elevated bg-lunari-surface">
          <div className="grid grid-cols-12 gap-2 border-b border-lunari-surface-elevated px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
            <span className="col-span-5">campaign</span>
            <span className="col-span-2">status</span>
            <span className="col-span-2 text-right">steps</span>
            <span className="col-span-1 text-right">in</span>
            <span className="col-span-2 text-right">replies</span>
          </div>
          <ul>
            {sequences.map((s) => (
              <li key={s.id} className="border-b border-lunari-surface-elevated last:border-b-0">
                <Link
                  href={{ pathname: "/sequences", query: { id: s.id } }}
                  className="planetarium grid grid-cols-12 items-center gap-2 px-4 py-3 hover:bg-lunari-surface-elevated"
                >
                  <span className="col-span-5 truncate text-sm text-lunari-cream">
                    {s.name}
                  </span>
                  <span className="col-span-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em]",
                        STATUS_STYLE[s.status],
                      )}
                    >
                      {s.status}
                    </span>
                  </span>
                  <span className="col-span-2 text-right font-mono text-xs tabular-nums text-lunari-neutral-400">
                    {s.nodeCount}
                  </span>
                  <span className="col-span-1 text-right font-mono text-xs tabular-nums text-lunari-neutral-400">
                    {s.enrolledCount}
                  </span>
                  <span className="col-span-2 text-right font-mono text-xs tabular-nums text-lunari-cream">
                    {s.replyCount}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
