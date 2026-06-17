import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";

export default function CampaignsPage() {
  return (
    <div className="space-y-6 px-8 py-6">
      <PageHeader
        title="campaigns"
        subtitle="sequences as visual instruments ... enrolled counts, replies, booked, step by step."
      />
      <ComingSoon
        label="campaigns"
        line="no campaigns running yet. build a sequence on the canvas, then enroll a segment from the pipeline and watch the steps fire."
        cta={{ href: "/sequences", label: "open the sequence editor" }}
      />
    </div>
  );
}
