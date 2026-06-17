"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  listThreads,
  getThreadMessages,
  getThreadHead,
  logOutboundEmail,
  type UniboxThread,
  type UniboxMessage,
} from "@/lib/supabase/unibox";
import { getVoiceProfile } from "@/lib/supabase/voice";
import { draftReply, type ReplyTranscriptLine } from "@/lib/ai/reply";
import { sendDraftEmail } from "@/lib/email/send";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

// react-query refetch surface for the thread list.
export async function fetchThreads(): Promise<UniboxThread[]> {
  const user = await requireUser();
  if (!user) return [];
  return listThreads();
}

// the transcript for the selected thread.
export async function fetchThreadMessages(
  threadId: string,
): Promise<UniboxMessage[]> {
  const user = await requireUser();
  if (!user) return [];
  return getThreadMessages(threadId);
}

export type DraftReplyResult =
  | { ok: true; reply: string; angle: string; confidence: number }
  | { ok: false; error: string };

const ThreadInput = z.object({ threadId: z.string().uuid() });

// draft the user's next reply for a thread, in their voice, with a confidence.
export async function draftReplyAction(
  rawInput: unknown,
): Promise<DraftReplyResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in to draft a reply ..." };

  const parsed = ThreadInput.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "that thread didn't look right ... refresh." };
  }

  try {
    const [messages, head, voiceProfile] = await Promise.all([
      getThreadMessages(parsed.data.threadId),
      getThreadHead(parsed.data.threadId),
      getVoiceProfile(),
    ]);

    const transcript: ReplyTranscriptLine[] = messages.map((m) => ({
      who: m.direction === "inbound" ? "them" : "me",
      body: m.body,
    }));

    const drafted = await draftReply({
      transcript,
      voiceProfile,
      contactName: head?.contactName ?? null,
    });

    return { ok: true, ...drafted };
  } catch (err) {
    console.error("[unibox] reply draft failed", err);
    return {
      ok: false,
      error: "the reply didn't land ... give it another shot in a moment.",
    };
  }
}

export type SendReplyResult =
  | { ok: true; mode: "test" | "live"; deliveredTo: string }
  | { ok: false; error: string };

const SendInput = z.object({
  threadId: z.string().uuid(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(8000),
});

// send the reply through the test-mode-safe boundary, then log it back into the
// thread so the inbox shows the loop closing.
export async function sendReplyAction(
  rawInput: unknown,
): Promise<SendReplyResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in to send ..." };

  const parsed = SendInput.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "that reply didn't look right ... try again." };
  }

  try {
    const head = await getThreadHead(parsed.data.threadId);
    if (!head?.contactEmail) {
      return {
        ok: false,
        error: "no email on this contact ... enrich them first.",
      };
    }

    const subject =
      parsed.data.subject ??
      (head.lastSubject ? `re: ${head.lastSubject}` : "re: your note");

    const result = await sendDraftEmail({
      to: head.contactEmail,
      subject,
      body: parsed.data.body,
    });

    if (!result.sent) {
      return {
        ok: false,
        error: result.error ?? "the send didn't go through ... try again.",
      };
    }

    if (head.contactId) {
      await logOutboundEmail({
        contactId: head.contactId,
        subject,
        body: parsed.data.body,
        externalId: result.id ?? null,
      });
    }

    return { ok: true, mode: result.mode, deliveredTo: result.deliveredTo };
  } catch (err) {
    console.error("[unibox] send failed", err);
    return { ok: false, error: "couldn't send that ... give it another shot." };
  }
}
