import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  type UIMessage,
} from "ai";
import { models } from "@/lib/ai/anthropic";
import { buildGenTools } from "@/lib/ai/gen-tools";
import { createClient } from "@/lib/supabase/server";

// the Gen copilot agent loop. opus plans, the tools execute, multi-step until
// the brief is done. auth-gated ... every tool acts as the signed-in user
// through the same session-bound supabase client (RLS). streaming route per
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
- be honest about limits: if a tool returns nothing, or a provider is not configured, say so plainly. never invent leads or pretend a tool ran.
- keep the user oriented: say what you are about to do, do it, then report what landed.

guardrails: catchall emails are deliverable-but-unconfirmed ... fine to load, just flag them. never load more than the user asked for. one batch at a time.`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return new Response("sign in to talk to gen", { status: 401 });
  }

  let messages: UIMessage[];
  try {
    const body = (await req.json()) as { messages?: UIMessage[] };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response("nothing to send ... type something first.", {
        status: 400,
      });
    }
    messages = body.messages;
  } catch {
    return new Response("that didn't parse ... refresh and try again.", {
      status: 400,
    });
  }
  const modelMessages = await convertToModelMessages(messages);

  // deferred hardening: this route spends real money per call (hunter,
  // millionverifier, opus). v1 leans on auth + the per-request stopWhen cap.
  // a per-user rate limit + per-user/day spend ceiling (upstash + usage_events)
  // is the next hardening chunk ... non-negotiable before this goes multi-user.
  const result = streamText({
    model: models.planner,
    system: SYSTEM,
    messages: modelMessages,
    tools: buildGenTools(auth.user.id),
    stopWhen: stepCountIs(12),
  });

  return result.toUIMessageStreamResponse();
}
