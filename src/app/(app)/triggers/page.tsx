import { PageHeader } from "@/components/shared/PageHeader";
import { ComingSoon } from "@/components/shared/ComingSoon";

export default function TriggersPage() {
  return (
    <div className="space-y-6 px-8 py-6">
      <PageHeader
        title="triggers"
        subtitle="the rules engine ... when a thing happens, the right thing fires."
      />
      <ComingSoon
        label="triggers"
        line="no triggers yet. triggers fire off signal hits ... a promotion, a launch, someone searching for a tool like yours ... so they light up once the signals layer is live."
        cta={{ href: "/signals", label: "see signals" }}
      />
    </div>
  );
}
