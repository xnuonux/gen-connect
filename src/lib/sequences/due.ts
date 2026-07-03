import type { CompiledStep } from "@/lib/sequences/compile";

// pure: given a compiled run, the enrollment's cursor, and how long the contact has
// been enrolled, return the steps that have come due (in order) after the cursor. this
// is the entire timing decision behind the executor, lifted out of the io so it can be
// tested with fixtures ... a step only comes due once its cumulative offset from
// enrollment has elapsed, and since the cursor only ever moves forward through the
// run, a send never fires twice. type-only import of CompiledStep keeps this module
// free of any server dependency (the node test imports it directly).
export function dueSteps(
  steps: CompiledStep[],
  currentNodeId: string | null,
  elapsedMs: number,
): CompiledStep[] {
  let idx = steps.findIndex((s) => s.nodeId === currentNodeId);
  if (idx < 0) idx = 0; // no cursor yet ... treat as parked at the start step
  const out: CompiledStep[] = [];
  for (let j = idx + 1; j < steps.length; j += 1) {
    const step = steps[j];
    if (!step) break;
    if (step.offsetMs > elapsedMs) break; // not due yet ... everything after waits too
    out.push(step);
  }
  return out;
}
