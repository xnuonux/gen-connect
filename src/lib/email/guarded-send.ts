import { randomUUID } from "node:crypto";
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
import { jurisdictionGate } from "@/lib/deliverability/jurisdiction";
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
): Promise<string | null> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("gc_unibox_threads")
    .select("id")
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
}): Promise<GuardedSendResult> {
  // 1. suppression: refuse before a byte leaves.
  if (await isSuppressed(args.userId, args.to)) {
    return {
      sent: false,
      mode: "test",
      intendedFor: args.to,
      deliveredTo: "",
      suppressed: true,
      error: "that address is on your suppression list ... skipped, not sent.",
    };
  }

  // 1a. the live-send domain gate: a real send must leave an authenticated
  // domain (spf + dkim + mx verified in the wizard). this is what makes the
  // sending-domains wizard load-bearing, not just informational. a no-op in
  // test mode (the send redirects to the user's own inbox anyway).
  if (IS_LIVE) {
    const fromDomain = sendFromDomain();
    if (!(await isDomainVerified(fromDomain))) {
      return {
        sent: false,
        mode: "live",
        intendedFor: args.to,
        deliveredTo: "",
        blocked: true,
        error: `live send blocked ... verify ${fromDomain} in deliverability first (spf + dkim + mx).`,
      };
    }
  }

  // 1b. jurisdiction: a cold send to a strict-opt-in eu country (gdpr/eprivacy)
  // is blocked unless consent is flagged on the contact. replies always pass.
  if (args.kind === "cold") {
    const supabase = await createClient();
    const { data: c } = await supabase
      .from("gc_contacts")
      .select("country, jurisdiction_consent")
      .eq("id", args.contactId)
      .maybeSingle();
    const verdict = jurisdictionGate({
      country: (c?.country as string | null) ?? null,
      kind: "cold",
      consent: (c?.jurisdiction_consent as boolean | null) ?? null,
    });
    if (!verdict.allow) {
      return {
        sent: false,
        mode: "test",
        intendedFor: args.to,
        deliveredTo: "",
        blocked: true,
        error: `${verdict.reason}.`,
      };
    }
  }

  const threadId =
    args.threadId ?? (await resolveThreadId(args.userId, args.contactId));

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
    });
  }

  return result;
}
