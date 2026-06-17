import { listSequences, getSequence } from "@/lib/supabase/sequences";
import { SequenceEditor } from "./SequenceEditor";

// server-loaded so the first paint is the real canvas. ?id= deep-links a specific
// sequence (campaigns links here); otherwise the most-recent one opens. the client
// editor owns the graph editing, the inspector, and the save/activate gate.
export default async function SequencesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const sp = await searchParams;
  const sequences = await listSequences();
  const wantId =
    sp.id && sequences.some((s) => s.id === sp.id) ? sp.id : sequences[0]?.id;
  const initialActive = wantId ? await getSequence(wantId) : null;

  return (
    <SequenceEditor
      initialSequences={sequences}
      initialActive={initialActive}
    />
  );
}
