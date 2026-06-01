import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type UIMessage,
} from "ai";
import { models } from "@/lib/ai/anthropic";
import { buildGenTools } from "@/lib/ai/gen-tools";
import { createClient } from "@/lib/supabase/server";
import {
  getConversation,
  getOrCreateConversation,
  loadRecentMessages,
  persistMessage,
  maybeCompact,
  toPortableParts,
  prepareReplayMessages,
} from "@/lib/supabase/gen-memory";

// the Gen copilot agent loop. the planner model plans, the tools execute,
// multi-step until the brief is done. auth-gated ... every tool acts as the
// signed-in user through the session-bound supabase client (RLS). the
// conversation persists as the user's single forever-thread (gc_gen_*), with a
// running compaction summary fed back in as memory. streaming route per
// AGENTS.md (route handlers only for webhooks + streaming).
export const maxDuration = 120;

const SYSTEM = `you are gen, the operator inside gen connect. the user talks to you in plain language and you run their outreach: find leads, verify emails, load them into the pipeline, enrich, and draft.

voice (non-negotiable): lowercase always. no em-dashes ever ... use "..." for pauses. punchy, warm, a closer not a saas bot. keep messages short.

how you work:
- for any multi-step task, call plan() FIRST with the steps (all 'pending'), then call plan() again as you go ... mark the step you are on 'active' and finished ones 'done'. the user watches this checklist, so keep it honest + current.
- map the brief to company domains yourself (you know a16z.com / sequoiacap.com are vc, stripe.com / ramp.com / vercel.com are tech, etc), then find_leads on those domains. filter by title when the brief is specific ("partners", "founders", "head of").
- ALWAYS verify_emails before loading, and drop invalid + disposable.
- NEVER load_contacts without first showing the user the candidates (the count + a few names) and getting a clear yes. loading writes to their pipeline.
- after loading you can enrich_contact + draft_angles on request, or offer to.
- you run the pipeline directly too: move_stage (use 'do_not_contact' to dismiss a bad lead), tag_contacts, bulk_enrich (up to 8 at once), and pipeline_summary for a read of where things stand. when the user asks "what's in my pipeline" reach for pipeline_summary.
- you can SEND via send_email, but sending is the ONE irreversible move. ALWAYS show the exact recipient + subject + body and get an explicit yes first, one send at a time. send_email defaults to TEST mode ... it redirects to the user's own inbox so no real lead gets emailed. when you send, say plainly which mode it went in and who it actually reached. after a real (live) send, offer to move_stage the contact to 'sequenced'.
- be honest about limits: if a tool returns nothing, or a provider is not configured, say so plainly. never invent leads or pretend a tool ran.
- keep the user oriented: say what you are about to do, do it, then report what landed.

guardrails: catchall emails are deliverable-but-unconfirmed ... fine to load, just flag them. never load more than the user asked for. one batch at a time.`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return new Response("sign in to talk to gen", { status: 401 });
  }
  const userId = auth.user.id;

  let message: UIMessage;
  let conversationId: string | undefined;
  try {
    const body = (await req.json()) as {
      message?: UIMessage;
      id?: string;
    };
    if (!body.message || !Array.isArray(body.message.parts)) {
      return new Response("nothing to send ... type something first.", {
        status: 400,
      });
    }
    message = body.message;
    conversationId = body.id;
  } catch {
    return new Response("that didn't parse ... refresh and try again.", {
      status: 400,
    });
  }

  // resolve the user's forever-thread. trust the client id only if it's
  // actually theirs (RLS) ... otherwise fall back to their own active thread.
  const convo =
    (conversationId ? await getConversation(conversationId) : null) ??
    (await getOrCreateConversation(userId));

  // normalize the incoming turn to the provider-portable subset before it
  // touches the model or the db. recent turns come back already normalized from
  // loadRecentMessages, so the whole context is provider-neutral ... identical
  // for deepseek + anthropic ... and a client can't smuggle in a provider-tagged
  // or malformed part.
  const incoming: UIMessage = {
    ...message,
    parts: toPortableParts(
      message.parts as unknown[],
      "user",
    ) as UIMessage["parts"],
  };

  // the live context = recent persisted turns + the new message. older turns
  // live in convo.summary (folded in below), not the message list.
  const recent = (await loadRecentMessages(convo.id)) as unknown as UIMessage[];
  const messages: UIMessage[] = [...recent, incoming];

  // persist the user turn up front (idempotent), so it survives even if the
  // stream errors mid-flight.
  await persistMessage(userId, convo.id, {
    id: incoming.id,
    role: "user",
    parts: incoming.parts as unknown[],
  });

  const system = convo.summary
    ? `${SYSTEM}

your running memory of your work with this user so far (build on it, do not make them repeat themselves):
${convo.summary}`
    : SYSTEM;

  // deferred hardening: this route spends real money per call (hunter,
  // millionverifier, the planner model). v1 leans on auth + the per-request
  // stopWhen cap. a per-user rate limit + per-user/day spend ceiling (upstash +
  // usage_events) is the next hardening chunk ... before this goes multi-user.
  const result = streamText({
    model: models.planner,
    system,
    // prepareReplayMessages keeps the sequence valid for BOTH providers:
    // coalesces an orphaned trailing user turn (interrupted stream) so we never
    // replay user,user, and trims any leading non-user turn left by compaction.
    // ignoreIncompleteToolCalls is the backstop against orphan tool-calls.
    messages: await convertToModelMessages(prepareReplayMessages(messages), {
      ignoreIncompleteToolCalls: true,
    }),
    tools: buildGenTools(userId),
    stopWhen: stepCountIs(12),
  });

  // drain the stream server-side so onFinish (which persists) is decoupled from
  // the client connection: a reply that finished generating still gets saved if
  // the client navigated away during the final flush. (a disconnect can still
  // truncate an in-progress generation ... the runtime cancels it ... in which
  // case only what actually streamed is captured, which is correct.) fire-and-
  // forget on purpose.
  void result.consumeStream({
    onError: (error) => {
      console.error("gen consumeStream error", error);
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // give the assistant turn a real unique id. without this the SDK ships the
    // response message with an empty id, and persistMessage's upsert on
    // (conversation_id, msg_id) with ignoreDuplicates then silently drops every
    // assistant turn after the first (they all collide on ""). this was THE bug
    // behind a reply vanishing on reload.
    generateMessageId: () => crypto.randomUUID(),
    onFinish: async ({ messages: finalMessages }) => {
      const last = finalMessages[finalMessages.length - 1];
      if (last && last.role === "assistant") {
        await persistMessage(userId, convo.id, {
          id: last.id,
          role: "assistant",
          parts: last.parts as unknown[],
        });
      }
      await maybeCompact(convo.id, convo.summary);
    },
  });
}
