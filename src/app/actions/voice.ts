"use server";

import { createClient } from "@/lib/supabase/server";
import { extractVoice } from "@/lib/ai/voice-extraction";
import { upsertVoiceProfileFromExtraction } from "@/lib/supabase/voice";
import {
  ExtractVoiceInputSchema,
  VoiceFeaturesSchema,
  type VoiceFeatures,
  type VoiceSample,
} from "@/lib/types/voice";
import { z } from "zod";

export type ExtractVoiceResult =
  | { ok: true; features: VoiceFeatures }
  | { ok: false; error: string };

export type SaveVoiceProfileResult =
  | { ok: true; active: boolean; samples: number }
  | { ok: false; error: string };

// pull current user from the session-bound supabase client. all voice
// actions require a signed-in user; the proxy layer also gates the route.
async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user;
}

// step 1 of onboarding: take 3-15 samples, run sonnet 4.6 extraction,
// return the structured features for the preview screen. nothing persists
// to voice_profiles until the user clicks confirm.
export async function extractVoiceAction(
  rawInput: unknown,
): Promise<ExtractVoiceResult> {
  const user = await requireUser();
  if (!user) {
    return { ok: false, error: "sign in to extract your voice ..." };
  }

  const parsed = ExtractVoiceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "those samples didn't look right ... need 3 to 15, each at least 20 characters of body text.",
    };
  }

  try {
    const features = await extractVoice(parsed.data.samples);
    return { ok: true, features };
  } catch (error) {
    // log the real error server-side; never splice an upstream provider
    // message into a user-facing string (it can carry caps + em-dashes +
    // internals, which breaks the voice rule and leaks backend detail).
    console.error("[voice] extraction failed", error);
    return {
      ok: false,
      error: "extraction didn't land ... give it another shot in a moment.",
    };
  }
}

// step 2 of onboarding: persist the previewed features + samples. writes
// only gen-owned columns + base columns. respects column ownership ...
// never touches writing_overrides, writing_samples_count, or
// active_for_writing.
const SaveInputSchema = z.object({
  features: VoiceFeaturesSchema,
  samples: ExtractVoiceInputSchema.shape.samples,
});

export async function saveVoiceProfileAction(
  rawInput: unknown,
): Promise<SaveVoiceProfileResult> {
  const user = await requireUser();
  if (!user) {
    return { ok: false, error: "sign in to save your voice ..." };
  }

  const parsed = SaveInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "that save didn't look right ... refresh and try again.",
    };
  }

  try {
    const profile = await upsertVoiceProfileFromExtraction({
      userId: user.id,
      features: parsed.data.features,
      samples: parsed.data.samples as VoiceSample[],
    });
    return {
      ok: true,
      active: profile.active_for_outreach,
      samples: profile.outreach_samples_count,
    };
  } catch (error) {
    console.error("[voice] save failed", error);
    return {
      ok: false,
      error: "that didn't save ... try again.",
    };
  }
}
