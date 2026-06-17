import { fetchAgents, fetchHits } from "@/app/actions/signals";
import { SignalsView } from "./SignalsView";

// server-loaded feed + agents so the first paint is real. the client view polls
// for new hits + owns the wizard, dismissals, and the signal -> draft bridge.
export default async function SignalsPage() {
  const [agents, hits] = await Promise.all([fetchAgents(), fetchHits()]);
  return <SignalsView initialAgents={agents} initialHits={hits} />;
}
