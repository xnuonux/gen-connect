"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  listThreads,
  getThreadMessages,
  getThreadHead,
  logOutboundEmail,
  markThreadRead,
  touchContact,
  type UniboxThread,
  type UniboxMessage,
} from "@/lib/supabase/unibox";
import { getVoiceProfile } from "@/lib/supabase/voice";
import { updateContactStage } from "@/lib/supabase/contacts";
import { recordOutcome } from "@/lib/supabase/outcomes";
import { draftReply, type ReplyTranscriptLine } from "@/lib/ai/reply";
import { sendDraftEmail } from "@/lib/email/send";
import { scrubVoice } from "@/lib/ai/scrub";

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

// clear a thread's unread dot when the user opens it.
export async function markThreadReadAction(threadId: string): Promise<void> {
  const user = await requireUser();
  if (!user) return;
  await markThreadRead(threadId);
}

export type MarkBookedResult = { ok: true } | { ok: false; error: string };

// the win moment from inside the inbox: they said yes. move the contact to
// booked + log a meeting to the opportunity ledger so the hero stat moves and
// the gold pulse can fire. dollar value lands later via the drawer's log-a-win.
export async function markBookedAction(
  rawInput: unknown,
): Promise<MarkBookedResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in first ..." };

  const parsed = z
    .object({ contactId: z.string().uuid() })
    .safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "that contact didn't look right ... refresh." };
  }

  try {
    await updateContactStage(parsed.data.contactId, "booked");
    await recordOutcome(user.id, {
      contactId: parsed.data.contactId,
      eventType: "meeting_booked",
      dollarValue: 0,
      note: "booked from the unibox",
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[unibox] mark booked failed", err);
    return { ok: false, error: "couldn't mark that booked ... try again." };
  }
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

    // scrub once so the persisted transcript matches the sent email exactly ...
    // nothing reaches the unibox un-scrubbed, even a user-typed em-dash.
    const cleanBody = scrubVoice(parsed.data.body);

    const result = await sendDraftEmail({
      to: head.contactEmail,
      subject,
      body: cleanBody,
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
        body: cleanBody,
        externalId: result.id ?? null,
      });
      // an outbound reply is a touch ... keep them fresh in the pipeline.
      await touchContact(head.contactId);
    }

    return { ok: true, mode: result.mode, deliveredTo: result.deliveredTo };
  } catch (err) {
    console.error("[unibox] send failed", err);
    return { ok: false, error: "couldn't send that ... give it another shot." };
  }
}
