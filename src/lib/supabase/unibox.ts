import { createClient } from "@/lib/supabase/server";

export type UniboxContact = {
  id: string;
  name: string | null;
  email: string | null;
  title: string | null;
  company: string | null;
};

export type UniboxThread = {
  id: string;
  channel: string;
  status: string;
  lastMessageAt: string | null;
  unreadCount: number;
  contact: UniboxContact | null;
  preview: string | null;
  lastDirection: "inbound" | "outbound" | null;
};

export type UniboxMessage = {
  id: string;
  direction: "inbound" | "outbound";
  subject: string | null;
  body: string;
  sentAt: string | null;
};

type RawThread = {
  id: string;
  channel: string | null;
  status: string | null;
  last_message_at: string | null;
  unread_count: number | null;
  contact:
    | {
        id: string;
        name: string | null;
        email: string | null;
        title: string | null;
        company: { name: string | null } | null;
      }
    | null;
};

// the inbox list. threads newest-first, each with its contact + a one-line
// preview of the latest message. RLS scopes the read ... no user_id filter.
export async function listThreads(): Promise<UniboxThread[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_unibox_threads")
    .select(
      "id, channel, status, last_message_at, unread_count, contact:gc_contacts(id, name, email, title, company:gc_companies(name))",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) throw new Error(error.message);
  const threads = (data ?? []) as unknown as RawThread[];

  // one extra query for the latest-message preview per thread. ordered desc,
  // first hit per thread wins. bounded by the 200-thread cap above.
  const ids = threads.map((t) => t.id);
  const previews = new Map<string, { body: string; direction: string }>();
  if (ids.length > 0) {
    const { data: msgs } = await supabase
      .from("gc_unibox_messages")
      .select("thread_id, body, direction, sent_at")
      .in("thread_id", ids)
      .order("sent_at", { ascending: false })
      // scale the window to the thread count so a few chatty threads cannot
      // starve quieter ones of a preview row.
      .limit(Math.max(ids.length * 5, 50));
    for (const m of (msgs ?? []) as Array<{
      thread_id: string;
      body: string | null;
      direction: string;
    }>) {
      if (!previews.has(m.thread_id)) {
        previews.set(m.thread_id, {
          body: m.body ?? "",
          direction: m.direction,
        });
      }
    }
  }

  return threads.map((t) => {
    const p = previews.get(t.id);
    return {
      id: t.id,
      channel: t.channel ?? "email",
      status: t.status ?? "open",
      lastMessageAt: t.last_message_at,
      unreadCount: t.unread_count ?? 0,
      contact: t.contact
        ? {
            id: t.contact.id,
            name: t.contact.name,
            email: t.contact.email,
            title: t.contact.title,
            company: t.contact.company?.name ?? null,
          }
        : null,
      preview: p?.body ?? null,
      lastDirection:
        p?.direction === "inbound" || p?.direction === "outbound"
          ? p.direction
          : null,
    };
  });
}

// the full transcript for one thread, oldest-first (reading order).
export async function getThreadMessages(
  threadId: string,
): Promise<UniboxMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_unibox_messages")
    .select("id, direction, subject, body, sent_at")
    .eq("thread_id", threadId)
    .order("sent_at", { ascending: true })
    .limit(200);

  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{
    id: string;
    direction: string;
    subject: string | null;
    body: string | null;
    sent_at: string | null;
  }>).map((m) => ({
    id: m.id,
    direction: m.direction === "inbound" ? "inbound" : "outbound",
    subject: m.subject,
    body: m.body ?? "",
    sentAt: m.sent_at,
  }));
}

// the head a reply needs: who to send to + a subject to thread under. used by
// the send action, RLS-scoped through the session client.
export async function getThreadHead(threadId: string): Promise<{
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  lastSubject: string | null;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_unibox_threads")
    .select(
      "id, contact:gc_contacts(id, name, email), messages:gc_unibox_messages(subject, sent_at)",
    )
    .eq("id", threadId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as {
    contact: { id: string; name: string | null; email: string | null } | null;
    messages: Array<{ subject: string | null; sent_at: string | null }> | null;
  };

  const lastSubject =
    (row.messages ?? [])
      .filter((m) => m.subject)
      .sort((a, b) => (a.sent_at ?? "").localeCompare(b.sent_at ?? ""))
      .at(-1)?.subject ?? null;

  return {
    contactId: row.contact?.id ?? null,
    contactName: row.contact?.name ?? null,
    contactEmail: row.contact?.email ?? null,
    lastSubject,
  };
}

// zero a thread's unread count when it is opened. RLS-scoped, best-effort.
export async function markThreadRead(threadId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("gc_unibox_threads")
    .update({ unread_count: 0 })
    .eq("id", threadId);
}

// an outbound reply is a touch ... keep the contact fresh in the pipeline.
export async function touchContact(contactId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("gc_contacts")
    .update({ last_action_at: new Date().toISOString() })
    .eq("id", contactId);
}

// log a sent email into the unibox: append an outbound message to the given
// thread (or find/create the contact's email thread), then record a 'sent'
// deliverability event so bounce/complaint webhooks can resolve the owner by
// resend's external id and the dashboard can count sends. RLS-scoped via the
// session client. lets a send show up in the inbox, closing the loop visibly.
export async function logOutboundEmail(args: {
  contactId: string;
  subject: string;
  body: string;
  externalId?: string | null; // resend's email id
  messageId?: string | null; // our rfc Message-ID (threadId anchor)
  toEmail?: string | null; // the INTENDED recipient (the lead), not the test inbox
  threadId?: string | null; // append here when known (a reply); else find/create
}): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;

  let threadId: string | null = args.threadId ?? null;
  if (!threadId) {
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
  }
  if (!threadId) return;

  const now = new Date().toISOString();
  await supabase.from("gc_unibox_messages").insert({
    user_id: userId,
    thread_id: threadId,
    direction: "outbound",
    subject: args.subject,
    body: args.body,
    // prefer our threadId-anchored Message-ID; fall back to resend's id.
    message_id_header: args.messageId ?? args.externalId ?? null,
    sent_at: now,
  });
  await supabase
    .from("gc_unibox_threads")
    .update({ last_message_at: now })
    .eq("id", threadId);

  // the 'sent' ledger row: the join key for inbound bounce/complaint resolution
  // and the denominator for the deliverability rates.
  if (args.externalId) {
    await supabase.from("gc_deliverability_events").insert({
      user_id: userId,
      contact_id: args.contactId,
      event_type: "sent",
      email: args.toEmail ?? null,
      external_id: args.externalId,
      message_id: args.messageId ?? null,
      occurred_at: now,
    });
  }
}
