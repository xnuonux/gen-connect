import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { RunDueButton } from "./RunDueButton";
import { CampaignsView } from "./CampaignsView";
import { listSequences } from "@/lib/supabase/sequences";

// campaigns reads the same gc_sequences the editor writes ... a sequence IS a
// campaign once contacts enroll. the ledger on the left, a live detail pane on the
// right (the compiled journey, per-send variant + spintax breakdown, the counts, a
// per-campaign run). the tab is a real console now, not a list that dead-ends.

export default async function CampaignsPage() {
  const sequences = await listSequences();
  const hasActive = sequences.some((s) => s.status === "active");

  return (
    <div className="space-y-6 px-8 py-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="campaigns"
          subtitle="sequences as visual instruments ... enrolled counts, replies, status, step by step."
        />
        {hasActive ? <RunDueButton /> : null}
      </div>

      {sequences.length === 0 ? (
        <ComingSoon
          label="campaigns"
          line="no campaigns running yet. build a sequence on the canvas, then enroll a segment from the pipeline and watch the steps fire."
          cta={{ href: "/sequences", label: "open the sequence editor" }}
        />
      ) : (
        <CampaignsView initial={sequences} />
      )}
    </div>
  );
}
