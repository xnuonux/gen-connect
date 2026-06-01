import { generateText, type UIMessage } from "ai";
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

const TERMINAL_TOOL_STATES = new Set(["output-available", "output-error"]);

// the provider-portable subset of a message's parts. the forever-thread gets
// replayed to whichever model is live ... deepseek now, anthropic when its key
// is funded, a fallback later ... so the stored + replayed context has to be
// identical for both. we keep only what convertToModelMessages turns into
// provider-neutral model content, and drop the cross-provider hazards:
//   - reasoning parts: deepseek emits them bare (no signature), anthropic then
//     drops signature-less thinking with a warning, and a leading signature-less
//     thinking block beside a tool_use can hard-400 anthropic. non-load-bearing
//     for the agent loop (compaction already drops reasoning), so strip it.
//   - any providerMetadata / providerOptions: namespaced to the producing
//     provider, alien (or rejected) by the other. we rebuild clean parts.
//   - non-terminal tool parts (input-streaming / input-available): emit an
//     orphan tool-call with no paired result ... invalid for BOTH providers.
//   - provider-executed tool parts + source / file / data parts: provider-
//     specific, or never reach the model anyway.
//   - step-start boundaries: dropping them collapses a turn into one block, so
//     a text-step-then-tool-step never replays as two consecutive assistant
//     messages (a cross-provider validation risk). verified clean against the
//     real convertToModelMessages.
// pure + idempotent: feed it portable parts and you get the same parts back.
// role lets us drop tool parts off a user turn (only assistants make tool calls
// ... a tool part on a user turn is malformed or client-smuggled).
export function toPortableParts(
  parts: unknown[],
  role?: "user" | "assistant",
): unknown[] {
  if (!Array.isArray(parts)) return [];
  const out: unknown[] = [];
  for (const p of parts) {
    const part = p as {
      type?: string;
      text?: string;
      state?: string;
      toolName?: string;
      toolCallId?: string;
      input?: unknown;
      rawInput?: unknown;
      output?: unknown;
      errorText?: string;
    };
    const type = part?.type;
    if (typeof type !== "string") continue;

    if (type === "text") {
      if (typeof part.text === "string" && part.text.length > 0) {
        out.push({ type: "text", text: part.text });
      }
      continue;
    }
    const isStaticTool = type.startsWith("tool-");
    const isDynamicTool = type === "dynamic-tool";
    if (isStaticTool || isDynamicTool) {
      // tool parts are only valid on assistant turns ... drop them off a user
      // turn (dropped at the model layer anyway, this keeps the row role-correct).
      if (role === "user") continue;
      // only terminal client-tool calls round-trip cleanly to both providers.
      if (!part.state || !TERMINAL_TOOL_STATES.has(part.state)) continue;
      const clean: Record<string, unknown> = {
        type,
        toolCallId: part.toolCallId,
        state: part.state,
        // a tool-input-error stashes the model's args in rawInput (input is
        // undefined); recover them so we never replay an undefined-input
        // tool-call ... both providers reject that.
        input: part.input ?? part.rawInput ?? {},
      };
      if (isDynamicTool && part.toolName) clean.toolName = part.toolName;
      if (part.state === "output-error") {
        clean.errorText = part.errorText ?? "tool failed";
      } else {
        clean.output = part.output;
      }
      out.push(clean);
      continue;
    }
    // reasoning, step-start, source-*, file, data-*, provider-executed,
    // unknown: drop.
  }
  return out;
}

// a message carries no model-relevant content once normalized if it has no text
// and no tool parts (e.g. an interrupted turn that only ever emitted reasoning).
// we neither store nor replay these ... empty turns are noise.
function hasContent(parts: unknown[]): boolean {
  return parts.some((p) => {
    const t = (p as { type?: string })?.type;
    return (
      t === "text" || t === "dynamic-tool" || (typeof t === "string" && t.startsWith("tool-"))
    );
  });
}

// shape the replay list so it is structurally valid for BOTH providers, not just
// deepseek (which is lenient). nothing here is provider-specific ... it keeps the
// sequence legal for either:
//   - coalesce adjacent same-role turns. a turn interrupted before its assistant
//     reply lands leaves an orphaned trailing user turn (the user turn is
//     persisted up front), so the next user turn would sit right beside it.
//     providers reject two user (or two assistant) messages back to back. we
//     merge them, preserving the orphan's content instead of dropping it.
//   - ensure the first turn is a user turn. compaction can leave the recent
//     window starting on an assistant reply, which anthropic rejects (the first
//     message must be user). drop leading non-user turns.
export function prepareReplayMessages(messages: UIMessage[]): UIMessage[] {
  const coalesced: UIMessage[] = [];
  for (const m of messages) {
    const prev = coalesced[coalesced.length - 1];
    if (prev && prev.role === m.role) {
      prev.parts = [
        ...(prev.parts as unknown[]),
        ...(m.parts as unknown[]),
      ] as UIMessage["parts"];
    } else {
      coalesced.push({
        ...m,
        parts: [...(m.parts as unknown[])] as UIMessage["parts"],
      });
    }
  }
  let start = 0;
  while (start < coalesced.length && coalesced[start]?.role !== "user") {
    start++;
  }
  return coalesced.slice(start);
}

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
  return rows
    .reverse()
    .map((r) => ({
      id: r.msg_id,
      role: r.role,
      // normalize on the way out so every replay + hydration is provider-
      // portable, even for rows written before this landed.
      parts: toPortableParts(Array.isArray(r.parts) ? r.parts : [], r.role),
    }))
    .filter((m) => hasContent(m.parts));
}

// persist one message, idempotent on (conversation_id, msg_id).
export async function persistMessage(
  userId: string,
  conversationId: string,
  msg: { id: string; role: "user" | "assistant"; parts: unknown[] },
): Promise<void> {
  // store the provider-portable subset so the thread is provider-neutral by
  // construction ... no reasoning blocks or provider metadata to diverge on.
  const parts = toPortableParts(msg.parts ?? [], msg.role);
  if (!hasContent(parts)) return; // never store an empty / reasoning-only turn

  const supabase = await createClient();
  await supabase.from("gc_gen_messages").upsert(
    {
      user_id: userId,
      conversation_id: conversationId,
      msg_id: msg.id,
      role: msg.role,
      parts,
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
