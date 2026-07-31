import { createClient } from "@/lib/supabase/server";

// gc_user_settings (v0_1_19) ... one row per user for prefs that do not deserve
// their own table. first resident: the cal.com booking link the user drops into
// outreach, so a booking can auto-mark the contact booked via the webhook.

export type UserSettings = {
  calcomBookingUrl: string | null;
};

// the caller's settings row. RLS scopes it to the session; a missing row reads
// as all-null settings.
export async function getUserSettings(): Promise<UserSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_user_settings")
    .select("calcom_booking_url")
    .maybeSingle();

  if (error) {
    throw new Error(`could not load settings ... ${error.message}`);
  }
  return {
    calcomBookingUrl: (data?.calcom_booking_url as string | null) ?? null,
  };
}

// upsert the caller's cal.com booking link (null clears it). the user id comes
// from the session server-side, never from the client; RLS + the pk keep it to
// one row per user.
export async function upsertCalcomBookingUrl(url: string | null): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("sign in first ...");

  const { error } = await supabase.from("gc_user_settings").upsert(
    { user_id: auth.user.id, calcom_booking_url: url },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(`could not save the booking link ... ${error.message}`);
  }
}
