import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  sendDraftEmail,
  SEND_FROM,
  IS_LIVE,
  sendFromDomain,
  type SendResult,
} from "@/lib/email/send";
import { buildReplyTo, buildMessageId } from "@/lib/email/thread-token";
import { unsubscribeHeaders, canSpamFooter } from "@/lib/email/compliance";
import { isSuppressed } from "@/lib/email/suppression";
import { isDomainVerified } from "@/lib/supabase/sending-domains";
import { guardDecision } from "@/lib/email/guard";
import { logOutboundEmail } from "@/lib/supabase/unibox";

export type GuardedSendResult = SendResult & {
  suppressed?: boolean;
  blocked?: boolean;
};

// find (or create) the contact's email thread so the send can carry a routing
// token even on a cold first-touch. session client / rls.
async function resolveThreadId(
  userId: string,
  contactId: string,
  db?: SupabaseClient,
): Promise<string | null> {
  const supabase = db ?? (await createClient());
  const { data: existing } = await supabase
    .from("gc_unibox_threads")
    .select("id")
    .eq("user_id", userId)
    .eq("contact_id", contactId)
    .eq("channel", "email")
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created } = await supabase
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
  return (created?.id as string) ?? null;
}

// THE send path ... everything routes through here. enforces, in order:
//  1. suppression hard-gate (a suppressed address is never emailed)
//  2. rfc 8058 one-click unsubscribe headers on every send
//  3. a can-spam physical-address footer on cold first-touches
//  4. thread routing (reply-to token + stable Message-ID)
//  5. the outbound log + the 'sent' deliverability ledger row
// the test-mode redirect still applies underneath (sendDraftEmail).
export async function guardedSend(args: {
  userId: string;
  contactId: string;
  to: string;
  subject: string;
  body: string;
  kind: "cold" | "reply";
  threadId?: string | null;
  // an injected service-role client (the autonomous cron, which has no session).
  // every gate here is scoped by userId / contactId, so it stays correct without
  // rls. omit it and the send runs through the session client exactly as before.
  db?: SupabaseClient;
}): Promise<GuardedSendResult> {
  // gather the gate inputs (only what each gate needs), then let the pure
  // guardDecision enforce the order + the verdict. this keeps the io here and
  // the ordering logic ... the safety-critical part ... in one tested function.
  const suppressed = await isSuppressed(args.userId, args.to, args.db);

  const fromDomain = sendFromDomain();
  // the live-send domain gate makes the sending-domains wizard load-bearing, not
  // informational. only read the verification state when a real send is at stake.
  let domainVerified = true;
  if (IS_LIVE)
    domainVerified = await isDomainVerified(fromDomain, args.db, args.userId);

  // jurisdiction (gdpr/eprivacy) only applies to a cold first-touch; replies pass.
  let country: string | null = null;
  let consent: boolean | null = null;
  if (args.kind === "cold") {
    const supabase = args.db ?? (await createClient());
    const { data: c } = await supabase
      .from("gc_contacts")
      .select("country, jurisdiction_consent")
      .eq("id", args.contactId)
      .eq("user_id", args.userId)
      .maybeSingle();
    country = (c?.country as string | null) ?? null;
    consent = (c?.jurisdiction_consent as boolean | null) ?? null;
  }

  const verdict = guardDecision({
    suppressed,
    isLive: IS_LIVE,
    domainVerified,
    fromDomain,
    country,
    consent,
    kind: args.kind,
  });
  if (!verdict.allow) {
    return {
      sent: false,
      mode: verdict.mode,
      intendedFor: args.to,
      deliveredTo: "",
      suppressed: verdict.suppressed,
      blocked: verdict.blocked,
      error: verdict.error,
    };
  }

  const threadId =
    args.threadId ??
    (await resolveThreadId(args.userId, args.contactId, args.db));

  // 2 + 4. headers: unsubscribe (always) + a threadId-anchored Message-ID.
  const headers: Record<string, string> = {
    ...unsubscribeHeaders(args.userId, args.to),
  };
  const replyTo = threadId
    ? buildReplyTo(threadId, SEND_FROM) ?? undefined
    : undefined;
  const messageId = threadId
    ? buildMessageId(threadId, SEND_FROM, randomUUID().slice(0, 8))
    : undefined;
  if (messageId) headers["Message-ID"] = messageId;

  // 3. footer: only on cold first-touches (replies are relationship mail).
  const wireBody =
    args.kind === "cold"
      ? `${args.body}\n${canSpamFooter(args.userId, args.to)}`
      : args.body;

  const result = await sendDraftEmail({
    to: args.to,
    subject: args.subject,
    body: wireBody,
    replyTo,
    headers,
  });

  // 5. log the human body (not the footer) + the 'sent' ledger row.
  if (result.sent) {
    await logOutboundEmail({
      contactId: args.contactId,
      threadId: threadId ?? undefined,
      subject: args.subject,
      body: args.body,
      externalId: result.id ?? null,
      messageId: messageId ?? null,
      toEmail: args.to,
      userId: args.userId,
      db: args.db,
    });
  }

  return result;
}
