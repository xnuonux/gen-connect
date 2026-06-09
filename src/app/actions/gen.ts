"use server";

import type { UIMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import {
  getConversation,
  loadRecentMessages,
} from "@/lib/supabase/gen-memory";

// re-read the persisted forever-thread for the chat UI. used to reconcile the
// client view after a tab-switch unmounts the live useChat stream: the server's
// consumeStream persists the assistant reply regardless of the client, so once
// the turn finishes the reply is here ... the chat polls this until it lands.
// RLS-scoped: getConversation only returns the convo if it's the caller's.
export async function fetchGenThread(
  conversationId: string,
): Promise<UIMessage[]> {
  if (!conversationId) return [];
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const convo = await getConversation(conversationId);
  if (!convo) return [];

  return (await loadRecentMessages(convo.id)) as unknown as UIMessage[];
}
