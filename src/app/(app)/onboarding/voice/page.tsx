import { getVoiceProfile } from "@/lib/supabase/voice";
import { PageHeader } from "@/components/shared/PageHeader";
import { VoiceOnboarding } from "./VoiceOnboarding";

// the magic moment ... show gen the user's voice. their existing voice
// profile (if any) loads server-side so we can branch the ui on whether
// this is a first extraction or a re-extraction.
export default async function VoiceOnboardingPage() {
  const existing = await getVoiceProfile();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-8 pb-5 pt-6">
        <PageHeader
          title="your voice"
          subtitle={
            existing?.active_for_outreach
              ? "your voice profile is active. add more samples to sharpen it."
              : "show gen your voice ... every draft from here on adapts to it."
          }
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <VoiceOnboarding existing={existing} />
      </div>
    </div>
  );
}
