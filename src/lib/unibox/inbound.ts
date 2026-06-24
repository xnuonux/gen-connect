import { createAdminClient } from "@/lib/supabase/admin";
import {
  candidateThreadIds,
  stripQuotedReply,
  type InboundEmail,
} from "@/lib/unibox/threading";
import { shouldAutoPause, suppressionReasonFor } from "@/lib/deliverability/rate";

// the webhook side of the unibox. it runs with NO session, so every write goes
// through the service-role admin client with user_id set explicitly ... rls is
// bypassed, so the owning user is resolved deterministically and never guessed.

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

type ResolvedTarget = {
  userId: string;
  threadId: string;
  contactId: string | null;
};

// a candidate threadId is real only if the row exists. returns its owner.
async function lookupThread(
  admin: Admin,
  threadId: string,
): Promise<ResolvedTarget | null> {
  const { data } = await admin
    .from("gc_unibox_threads")
    .select("id, user_id, contact_id")
    .eq("id", threadId)
    .maybeSingle();
  if (!data) return null;
  return {
    userId: data.user_id as string,
    threadId: data.id as string,
    contactId: (data.contact_id as string | null) ?? null,
  };
}

// fallback resolution by the sender's email. only fires when EXACTLY ONE user
// owns a contact with that email ... 0 (unknown) or 2+ (ambiguous cross-user)
// both park the message rather than risk routing a reply to the wrong account.
async function lookupByFromEmail(
  admin: Admin,
  email: string,
): Promise<ResolvedTarget | null> {
  const { data } = await admin
    .from("gc_contacts")
    .select("id, user_id")
    // exact, case-insensitive: rows are stored lowercased on write, and ilike
    // would treat a literal "_" / "%" in an address as a wildcard.
    .eq("email", email.toLowerCase())
    .limit(2);
  if (!data || data.length !== 1) return null;
  const c = data[0] as { id: string; user_id: string };
  const threadId = await findOrCreateEmailThread(admin, c.user_id, c.id);
  return { userId: c.user_id, threadId, contactId: c.id };
}

async function findOrCreateEmailThread(
  admin: Admin,
  userId: string,
  contactId: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("gc_unibox_threads")
    .select("id")
    .eq("user_id", userId)
    .eq("contact_id", contactId)
    .eq("channel", "email")
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created } = await admin
    .from("gc_unibox_threads")
    .insert({
      user_id: userId,
      contact_id: contactId,
      channel: "email",
      status: "open",
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return created!.id as string;
}

// dedupe: has this exact inbound message already landed for this user?
async function alreadyIngested(
  admin: Admin,
  userId: string,
  key: string | null,
): Promise<boolean> {
  if (!key) return false;
  const { data } = await admin
    .from("gc_unibox_messages")
    .select("id")
    .eq("user_id", userId)
    .eq("message_id_header", key)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// a reply lifts the contact to 'replied' ... but never downgrades a contact who
// is already further along (booked/closed/do_not_contact stay put).
async function setContactReplied(
  admin: Admin,
  contactId: string,
): Promise<void> {
  const { data } = await admin
    .from("gc_contacts")
    .select("stage")
    .eq("id", contactId)
    .maybeSingle();
  const stage = data?.stage as string | undefined;
  const upgradeable = ["cold", "enriched", "drafted", "sequenced"];
  if (stage && upgradeable.includes(stage)) {
    await admin
      .from("gc_contacts")
      .update({ stage: "replied", last_action_at: new Date().toISOString() })
      .eq("id", contactId);
  }
}

// ingest one inbound reply: resolve the thread, dedupe, append the message,
// bump the thread (unread + reopen + last_message_at), lift the contact. returns
// whether it matched a known thread so the webhook can report it.
export async function ingestInbound(
  email: InboundEmail,
): Promise<{ matched: boolean; threadId?: string }> {
  const admin = createAdminClient();
  if (!admin) return { matched: false };

  let target: ResolvedTarget | null = null;
  for (const tid of candidateThreadIds(email)) {
    target = await lookupThread(admin, tid);
    if (target) break;
  }
  if (!target && email.fromEmail) {
    target = await lookupByFromEmail(admin, email.fromEmail);
  }
  if (!target) return { matched: false };

  const dedupeKey = email.providerId ?? email.messageId;
  if (await alreadyIngested(admin, target.userId, dedupeKey)) {
    return { matched: true, threadId: target.threadId };
  }

  const now = new Date().toISOString();
  const { error: insertErr } = await admin.from("gc_unibox_messages").insert({
    user_id: target.userId,
    thread_id: target.threadId,
    direction: "inbound",
    subject: email.subject,
    body: stripQuotedReply(email.text),
    message_id_header: dedupeKey,
    in_reply_to: email.inReplyTo,
    sent_at: now,
  });
  if (insertErr) {
    // a concurrent / redelivered webhook already inserted this exact reply ...
    // the partial unique index (user_id, message_id_header) caught the race, so
    // skip the bump + the stage-lift rather than double-count it.
    if (insertErr.code === "23505") return { matched: true, threadId: target.threadId };
    throw new Error(insertErr.message);
  }

  const { data: t } = await admin
    .from("gc_unibox_threads")
    .select("unread_count, status")
    .eq("id", target.threadId)
    .maybeSingle();
  const status = t?.status as string | undefined;
  await admin
    .from("gc_unibox_threads")
    .update({
      unread_count: ((t?.unread_count as number | undefined) ?? 0) + 1,
      last_message_at: now,
      // a reply reopens an archived/closed thread; otherwise leave it as is.
      status: status === "archived" || status === "closed" ? "open" : status ?? "open",
    })
    .eq("id", target.threadId);

  if (target.contactId) await setContactReplied(admin, target.contactId);

  return { matched: true, threadId: target.threadId };
}

// resolve the owner of a sending event by joining on the originating 'sent' row
// (external_id is resend's email id, which we logged at send time). this avoids
// cross-user email ambiguity entirely.
async function resolveEventOwner(
  admin: Admin,
  externalId: string | null,
  recipientEmail: string | null,
): Promise<{ userId: string; contactId: string | null; email: string | null } | null> {
  if (externalId) {
    const { data } = await admin
      .from("gc_deliverability_events")
      .select("user_id, contact_id, email")
      .eq("external_id", externalId)
      .eq("event_type", "sent")
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        userId: data.user_id as string,
        contactId: (data.contact_id as string | null) ?? null,
        email: ((data.email as string | null) ?? recipientEmail) ?? null,
      };
    }
  }
  if (recipientEmail) {
    const { data } = await admin
      .from("gc_contacts")
      .select("id, user_id")
      .eq("email", recipientEmail.toLowerCase())
      .limit(2);
    if (data && data.length === 1) {
      const c = data[0] as { id: string; user_id: string };
      return { userId: c.user_id, contactId: c.id, email: recipientEmail };
    }
  }
  return null;
}

// suppress an address (idempotent). check-then-insert against the functional
// unique index (user_id, lower(email)); the index still guards a race.
async function suppress(
  admin: Admin,
  userId: string,
  email: string,
  reason: "hard_bounce" | "complaint",
): Promise<void> {
  const lowered = email.toLowerCase();
  const { data: existing } = await admin
    .from("gc_suppression")
    .select("id")
    .eq("user_id", userId)
    .eq("email", lowered)
    .limit(1)
    .maybeSingle();
  if (existing) return;
  await admin
    .from("gc_suppression")
    .insert({ user_id: userId, email: lowered, reason, source: "resend_webhook" });
}

// rolling 30-day deliverability counts -> auto-pause the user's active sequences
// + enrollments when the complaint or bounce rate crosses its line.
async function maybeAutoPause(admin: Admin, userId: string): Promise<void> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const countOf = async (eventType: string): Promise<number> => {
    const { count } = await admin
      .from("gc_deliverability_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", eventType)
      .gte("occurred_at", since);
    return count ?? 0;
  };
  const [sent, complaints, bounces] = await Promise.all([
    countOf("sent"),
    countOf("complained"),
    countOf("bounced"),
  ]);
  const verdict = shouldAutoPause({ sent, complaints, bounces });
  if (!verdict.pause) return;
  await admin
    .from("gc_sequences")
    .update({ status: "paused" })
    .eq("user_id", userId)
    .eq("status", "active");
  await admin
    .from("gc_sequence_enrollments")
    .update({ status: "paused" })
    .eq("user_id", userId)
    .eq("status", "active");
}

// ingest a resend sending event (delivered / bounced / complained / opened ...).
// logs it (deduped by check-then-insert on the unique key), suppresses on a hard
// bounce or complaint, and auto-pauses if a rate crossed.
export async function ingestDeliverabilityEvent(args: {
  eventType: string;
  externalId: string | null;
  recipientEmail: string | null;
  messageId: string | null;
  raw: unknown;
}): Promise<{ matched: boolean }> {
  const admin = createAdminClient();
  if (!admin) return { matched: false };

  const owner = await resolveEventOwner(admin, args.externalId, args.recipientEmail);
  if (!owner) return { matched: false };

  // dedupe on (user_id, external_id, event_type).
  if (args.externalId) {
    const { data: dup } = await admin
      .from("gc_deliverability_events")
      .select("id")
      .eq("user_id", owner.userId)
      .eq("external_id", args.externalId)
      .eq("event_type", args.eventType)
      .limit(1)
      .maybeSingle();
    if (dup) return { matched: true };
  }

  await admin.from("gc_deliverability_events").insert({
    user_id: owner.userId,
    contact_id: owner.contactId,
    event_type: args.eventType,
    email: owner.email,
    external_id: args.externalId,
    message_id: args.messageId,
    raw: (args.raw ?? {}) as Record<string, unknown>,
    occurred_at: new Date().toISOString(),
  });

  const reason = suppressionReasonFor(args.eventType);
  if (reason && owner.email) {
    await suppress(admin, owner.userId, owner.email, reason);
    await maybeAutoPause(admin, owner.userId);
  }

  return { matched: true };
}
