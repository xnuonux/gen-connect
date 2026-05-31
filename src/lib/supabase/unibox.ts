import { createClient } from "@/lib/supabase/server";

// log a sent email into the unibox: find or create the contact's email thread,
// then append an outbound message. RLS-scoped via the session client. lets a
// send show up in the inbox, closing the loop visibly.
export async function logOutboundEmail(args: {
  contactId: string;
  subject: string;
  body: string;
  externalId?: string | null;
}): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;

  let threadId: string | null = null;
  const { data: existing } = await supabase
    .from("gc_unibox_threads")
    .select("id")
    .eq("contact_id", args.contactId)
    .eq("channel", "email")
    .limit(1)
    .maybeSingle();

  if (existing) {
    threadId = existing.id as string;
  } else {
    const { data: created } = await supabase
      .from("gc_unibox_threads")
      .insert({
        user_id: userId,
        contact_id: args.contactId,
        channel: "email",
        status: "open",
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    threadId = (created?.id as string) ?? null;
  }
  if (!threadId) return;

  await supabase.from("gc_unibox_messages").insert({
    user_id: userId,
    thread_id: threadId,
    direction: "outbound",
    subject: args.subject,
    body: args.body,
    message_id_header: args.externalId ?? null,
    sent_at: new Date().toISOString(),
  });
  await supabase
    .from("gc_unibox_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", threadId);
}
