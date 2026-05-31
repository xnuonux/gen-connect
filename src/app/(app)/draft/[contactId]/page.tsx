import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVoiceProfile } from "@/lib/supabase/voice";
import { getLatestDraftForContact } from "@/lib/supabase/drafts";
import { PageHeader } from "@/components/shared/PageHeader";
import { DraftStudio } from "./DraftStudio";

// the draft studio for one contact. loads the contact, their latest draft (if
// any), and whether their voice profile is active ... all server-side, RLS
// scoped. the 5-angle generation itself fires from the client on demand.
export default async function DraftPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("gc_contacts")
    .select("id, name, title, company:gc_companies(name, domain)")
    .eq("id", contactId)
    .maybeSingle();

  if (!row) notFound();

  const c = row as unknown as {
    id: string;
    name: string | null;
    title: string | null;
    company: { name: string | null; domain: string | null } | null;
  };

  const [draft, voice] = await Promise.all([
    getLatestDraftForContact(contactId),
    getVoiceProfile(),
  ]);

  const who = [c.name ?? "this contact", c.title, c.company?.name]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-8 pb-5 pt-6">
        <PageHeader
          title="draft studio"
          subtitle={`five angles for ${who}. the judge picks a winner ... you get the final say.`}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <DraftStudio
          contact={{
            id: c.id,
            name: c.name,
            title: c.title,
            company: c.company?.name ?? null,
          }}
          initialDraft={draft}
          voiceActive={voice?.active_for_outreach ?? false}
        />
      </div>
    </div>
  );
}
