import { PageHeader } from "@/components/shared/PageHeader";
import { GenChat } from "./GenChat";

// the Gen copilot. tell it what you need in plain language; it runs the loop
// (find -> verify -> load -> enrich -> draft) with the tool belt.
export default function GenPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-8 pb-4 pt-6">
        <PageHeader
          title="gen"
          subtitle="tell gen what you need ... it finds the leads, verifies the emails, loads them, enriches, drafts. you just talk."
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-8 pb-6">
        <GenChat />
      </div>
    </div>
  );
}
