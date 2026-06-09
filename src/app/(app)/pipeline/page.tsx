import Link from "next/link";
import type { Route } from "next";
import { Sparkles, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { CsvImportDialog } from "@/components/shared/CsvImportDialog";
import { listContacts } from "@/lib/supabase/contacts";
import { getVoiceProfile } from "@/lib/supabase/voice";
import { PipelineView } from "./PipelineView";

// the pipeline board. contacts load server-side through RLS, then the kanban
// takes over on the client for drag, optimistic moves, and selection. the
// voice profile read is cheap (single-row lookup) and lets us nudge the user
// toward the onboarding flow if they haven't extracted yet.
export default async function PipelinePage() {
  const [contacts, voice] = await Promise.all([
    listContacts(),
    getVoiceProfile(),
  ]);

  const voiceActive = voice?.active_for_outreach ?? false;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-8 pb-5 pt-6">
        <PageHeader
          title="pipeline"
          subtitle="every contact, every stage, every breath of the campaign."
        />
        <CsvImportDialog />
      </div>
      {voiceActive ? null : (
        <div className="px-8 pb-3">
          <Link
            href={"/onboarding/voice" as Route}
            className="planetarium flex items-center justify-between gap-4 rounded-md border border-gen-accent/40 bg-gen-accent-soft px-4 py-3 text-sm text-lunari-cream hover:border-gen-accent"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 stroke-[1.25] text-gen-accent" />
              <span>
                set up your voice ... gen drafts in the dom prior until you
                show it three of your own emails.
              </span>
            </div>
            <ArrowRight className="h-4 w-4 stroke-[1.25] text-gen-accent" />
          </Link>
        </div>
      )}
      <PipelineView initialContacts={contacts} />
    </div>
  );
}
