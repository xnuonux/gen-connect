import { PageHeader } from "@/components/shared/PageHeader";
import { listContacts } from "@/lib/supabase/contacts";
import { PipelineKanban } from "./PipelineKanban";

// the pipeline board. contacts load server-side through RLS, then the kanban
// takes over on the client for drag, optimistic moves, and selection.
export default async function PipelinePage() {
  const contacts = await listContacts();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-8 pb-5 pt-6">
        <PageHeader
          title="pipeline"
          subtitle="every contact, every stage, every breath of the campaign."
        />
      </div>
      <PipelineKanban initialContacts={contacts} />
    </div>
  );
}
