import { listThreads } from "@/lib/supabase/unibox";
import { UniboxView } from "./UniboxView";

// server-loaded so the first paint is real threads, no loading flash. the
// 3-pane view takes over on the client for selection + drafting + sending.
export default async function UniboxPage() {
  const threads = await listThreads();
  return <UniboxView initialThreads={threads} />;
}
