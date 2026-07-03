"use client";

import { useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Table2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeInvalidate } from "@/lib/supabase/use-realtime-invalidate";
import { PipelineKanban } from "./PipelineKanban";
import { PipelineTable } from "./PipelineTable";
import { type Contact } from "@/lib/types/contact";

type View = "board" | "table";
const KEY = "gc-pipeline-view";
const EVENT = "gc-pipeline-view-change";

// persist the board/table choice across sessions in localStorage, read through
// useSyncExternalStore so it stays lint-clean (no setState-in-effect) and
// hydration-safe (server snapshot is always 'board', the client reconciles).
function getSnapshot(): View {
  if (typeof window === "undefined") return "board";
  return window.localStorage.getItem(KEY) === "table" ? "table" : "board";
}
function getServerSnapshot(): View {
  return "board";
}
function subscribe(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}
function setView(v: View) {
  try {
    window.localStorage.setItem(KEY, v);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // localStorage blocked (private mode) ... the toggle just won't persist.
  }
}

export function PipelineView({
  initialContacts,
}: {
  initialContacts: Contact[];
}) {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const queryClient = useQueryClient();
  const [supabase] = useState(() => createClient());

  // the board comes alive when gen acts. the copilot + the signal auto-fire path
  // insert / move / tag / enrich contacts server-side; this realtime channel on
  // gc_contacts (v0_1_17) refetches the shared ["contacts"] query the instant a
  // change lands, so whichever view is open fills itself in ... no manual reload.
  // rls scopes the socket to the caller's own rows. the 30s poll in the queries is
  // the belt-and-suspenders floor if the socket ever drops.
  useRealtimeInvalidate({
    supabase,
    channelName: "gc-contacts-pipeline",
    bindings: [
      { table: "gc_contacts", event: "INSERT" },
      { table: "gc_contacts", event: "UPDATE" },
    ],
    queryClient,
    invalidateKeys: [["contacts"]],
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 px-8 pb-3">
        <ToggleButton
          active={view === "board"}
          onClick={() => setView("board")}
          icon={<LayoutGrid className="h-4 w-4 stroke-[1.25]" />}
          label="board"
        />
        <ToggleButton
          active={view === "table"}
          onClick={() => setView("table")}
          icon={<Table2 className="h-4 w-4 stroke-[1.25]" />}
          label="table"
        />
      </div>
      {view === "board" ? (
        <PipelineKanban initialContacts={initialContacts} />
      ) : (
        <PipelineTable initialContacts={initialContacts} />
      )}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "planetarium flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em]",
        active
          ? "bg-lunari-surface-elevated text-lunari-cream"
          : "text-lunari-neutral-500 hover:text-lunari-cream",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
