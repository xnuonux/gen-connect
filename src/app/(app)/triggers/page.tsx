import { fetchTriggers } from "@/app/actions/triggers";
import { TriggersView } from "./TriggersView";

// server-loaded so the first paint is real triggers. the client view owns the
// builder + the live dry-run test against recent hits.
export default async function TriggersPage() {
  const triggers = await fetchTriggers();
  return <TriggersView initialTriggers={triggers} />;
}
