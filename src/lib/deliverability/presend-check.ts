import { createClient } from "@/lib/supabase/server";
import {
  presendVerdict,
  type PresendVerdict,
} from "@/lib/deliverability/presend";

// the server-side wrapper around the pure presend verdict ... loads the contact's
// country + consent + suppression status (RLS-scoped) and returns the read the
// composer / draft studio shows BEFORE a send. kind 'cold' for a first touch,
// 'reply' inside a thread.
export async function presendForContact(
  contactId: string,
  kind: "cold" | "reply",
): Promise<PresendVerdict | null> {
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("gc_contacts")
    .select("email, country, jurisdiction_consent")
    .eq("id", contactId)
    .maybeSingle();
  if (!c) return null;

  let suppressed = false;
  const email = c.email as string | null;
  if (email) {
    const { data: s } = await supabase
      .from("gc_suppression")
      .select("id")
      .eq("email", email.toLowerCase())
      .limit(1)
      .maybeSingle();
    suppressed = !!s;
  }

  return presendVerdict({
    suppressed,
    country: (c.country as string | null) ?? null,
    consent: (c.jurisdiction_consent as boolean | null) ?? null,
    kind,
  });
}
