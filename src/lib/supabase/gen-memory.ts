import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { models } from "@/lib/ai/anthropic";

// the gen copilot's persistent memory: one forever-thread per user with a
// running compaction summary, so it remembers everything without the context
// (or the bill) growing unbounded. all RLS-scoped via the session client.

// the minimal UIMessage shape we persist + hydrate (id + role + parts).
export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  parts: unknown[];
};

const KEEP_RECENT = 24; // messages kept live after a compaction
const COMPACT_AT = 40; // compact once the thread passes this

// the user's single active conversation, created on first use.
export async function getOrCreateConversation(
  userId: string,
): Promise<{ id: string; summary: string | null }> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("gc_gen_conversations")
    .select("id, summary")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      id: existing.id as string,
      summary: (existing.summary as string | null) ?? null,
    };
  }
  const { data: created, error } = await supabase
    .from("gc_gen_conversations")
    .insert({ user_id: userId, status: "active" })
    .select("id, summary")
    .single();
  if (error || !created) {
    throw new Error(`could not open gen memory ... ${error?.message ?? "no row"}`);
  }
  return { id: created.id as string, summary: null };
}

// load a conversation by id, RLS-scoped ... null if it is not the caller's.
// the route uses this to validate a client-supplied id before trusting it.
export async function getConversation(
  conversationId: string,
): Promise<{ id: string; summary: string | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gc_gen_conversations")
    .select("id, summary")
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    summary: (data.summary as string | null) ?? null,
  };
}

// the recent messages for hydration + live context, oldest-first.
export async function loadRecentMessages(
  conversationId: string,
  limit = KEEP_RECENT,
): Promise<StoredMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gc_gen_messages")
    .select("msg_id, role, parts")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as {
    msg_id: string;
    role: "user" | "assistant";
    parts: unknown[];
  }[];
  return rows.reverse().map((r) => ({
    id: r.msg_id,
    role: r.role,
    parts: Array.isArray(r.parts) ? r.parts : [],
  }));
}

// persist one message, idempotent on (conversation_id, msg_id).
export async function persistMessage(
  userId: string,
  conversationId: string,
  msg: { id: string; role: "user" | "assistant"; parts: unknown[] },
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("gc_gen_messages").upsert(
    {
      user_id: userId,
      conversation_id: conversationId,
      msg_id: msg.id,
      role: msg.role,
      parts: msg.parts ?? [],
    },
    { onConflict: "conversation_id,msg_id", ignoreDuplicates: true },
  );
}

function partsToText(role: string, parts: unknown[]): string {
  const bits: string[] = [];
  for (const p of parts) {
    const part = p as { type?: string; text?: string };
    if (part?.type === "text" && part.text) {
      bits.push(part.text);
    } else if (typeof part?.type === "string" && part.type.startsWith("tool-")) {
      bits.push(`[used ${part.type.slice(5)}]`);
    }
  }
  const body = bits.join(" ").trim();
  return body ? `${role}: ${body}` : "";
}

// compact when the thread gets long: fold the oldest turns (beyond the recent
// window) into the running summary, then delete them. true compaction ... the
// gist survives, the raw old turns roll off, context + db stay bounded.
export async function maybeCompact(
  conversationId: string,
  priorSummary: string | null,
): Promise<void> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("gc_gen_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  if (!count || count <= COMPACT_AT) return;

  const toCompact = count - KEEP_RECENT;
  const { data: oldRows } = await supabase
    .from("gc_gen_messages")
    .select("id, role, parts")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(toCompact);
  const rows = (oldRows ?? []) as {
    id: string;
    role: "user" | "assistant";
    parts: unknown[];
  }[];
  if (rows.length === 0) return;

  const transcript = rows
    .map((r) => partsToText(r.role, Array.isArray(r.parts) ? r.parts : []))
    .filter(Boolean)
    .join("\n");

  let newSummary = priorSummary ?? "";
  try {
    const { text } = await generateText({
      model: models.scoutCheap,
      system:
        "you keep a tight running memory of the user's ongoing conversation with gen, their outreach operator. fold the new transcript into the prior memory: who they target, what's been found / loaded / enriched / drafted / sent, their preferences + decisions, anything gen should remember next time. lowercase, no em-dashes, under 220 words, no preamble ... just the memory.",
      prompt: `prior memory:\n${priorSummary ?? "(none yet)"}\n\nnew transcript to fold in:\n${transcript}`,
      temperature: 0.2,
    });
    newSummary = text.trim() || newSummary;
  } catch {
    return; // summarization failed ... leave the thread intact, no data loss
  }

  await supabase
    .from("gc_gen_messages")
    .delete()
    .in(
      "id",
      rows.map((r) => r.id),
    );
  await supabase
    .from("gc_gen_conversations")
    .update({ summary: newSummary })
    .eq("id", conversationId);
}
