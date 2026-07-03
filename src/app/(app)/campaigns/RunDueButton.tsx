"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { tickDueSequencesAction } from "@/app/actions/sequences";

// the in-app executor trigger ... walks every active enrollment and fires the sends
// that have come due, test-mode-safe. this is what makes campaigns actually send
// without waiting on the deferred autonomous cron ... you press it, gen runs the tick,
// the replies thread into the unibox. the button reports exactly what happened so a
// no-op tick ("nothing due yet") never reads as a silent failure.
export function RunDueButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await tickDueSequencesAction({});
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const { sent, completed, failed, scanned, mode } = r.result;
      if (scanned === 0) {
        toast("no active enrollments yet ... enroll a segment first.");
      } else if (sent === 0 && completed === 0 && failed === 0) {
        toast("nothing due yet ... the next sends are still on the clock.");
      } else {
        const bits = [
          sent > 0 ? `sent ${sent}${mode === "test" ? " (test)" : ""}` : null,
          completed > 0 ? `${completed} finished` : null,
          failed > 0 ? `${failed} stopped` : null,
        ].filter(Boolean);
        toast.success(bits.join(" ... "));
      }
      router.refresh();
    } catch {
      toast.error("the run didn't land ... give it another shot.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className={cn(
        "planetarium flex items-center gap-2 rounded-md border border-gen-accent/40 bg-gen-accent-soft px-3 py-2 text-xs font-medium text-gen-accent",
        "hover:bg-gen-accent/20 disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      <Zap className={cn("h-4 w-4 stroke-[1.25]", busy && "animate-pulse")} />
      <span>{busy ? "running ..." : "run due sends"}</span>
    </button>
  );
}
