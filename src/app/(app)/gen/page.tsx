import type { UIMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import {
  getOrCreateConversation,
  loadRecentMessages,
} from "@/lib/supabase/gen-memory";
import { PageHeader } from "@/components/shared/PageHeader";
import { GenChat } from "./GenChat";

// the Gen copilot. one persistent forever-thread per user ... it loads here so
// you pick up exactly where you left off, with gen's running memory of your
// work folded in.
export default async function GenPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  let conversationId = "";
  let summary: string | null = null;
  let initialMessages: UIMessage[] = [];
  if (auth.user) {
    const convo = await getOrCreateConversation(auth.user.id);
    conversationId = convo.id;
    summary = convo.summary;
    initialMessages = (await loadRecentMessages(
      convo.id,
    )) as unknown as UIMessage[];
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-8 pb-4 pt-6">
        <PageHeader
          title="gen"
          subtitle="tell gen what you need ... it finds the leads, verifies the emails, loads them, enriches, drafts, sends. you just talk, and it remembers."
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-8 pb-6">
        <GenChat
          conversationId={conversationId}
          initialMessages={initialMessages}
          summary={summary}
        />
      </div>
    </div>
  );
}
