"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, ArrowDown } from "lucide-react";
import { fetchContacts } from "@/app/actions/contacts";
import { ContactDrawer } from "@/components/shared/ContactDrawer";
import { StageChip } from "@/components/shared/StageChip";
import { FlameScore } from "@/components/shared/FlameScore";
import { cn } from "@/lib/utils/cn";
import { KANBAN_STAGES, type Contact } from "@/lib/types/contact";
import { formatDistanceToNowStrict } from "date-fns";

type SortKey = "name" | "company" | "stage" | "warmth" | "updated";
type SortDir = "asc" | "desc";

const STAGE_ORDER = new Map(KANBAN_STAGES.map((s, i) => [s, i]));

function initials(name: string | null): string {
  if (!name) return "?";
  const letters = name
    .trim()
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("");
  return (letters.slice(0, 2) || "?").toUpperCase();
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDistanceToNowStrict(d);
}

// the twenty-grade dense record table ... the same RLS contacts the kanban
// reads (shared react-query cache), sortable, row-click opens the same drawer.
// self-contained so the working kanban is untouched ... the view toggle swaps
// between them.
export function PipelineTable({
  initialContacts,
}: {
  initialContacts: Contact[];
}) {
  const { data: contacts } = useQuery({
    queryKey: ["contacts"],
    queryFn: fetchContacts,
    initialData: initialContacts,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "company" ? "asc" : "desc");
    }
  }

  const rows = useMemo(() => {
    const board = contacts.filter((c) => STAGE_ORDER.has(c.stage as never));
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (c: Contact): string | number => {
      switch (sortKey) {
        case "name":
          return (c.name ?? "").toLowerCase();
        case "company":
          return (c.company?.name ?? "").toLowerCase();
        case "stage":
          return STAGE_ORDER.get(c.stage as never) ?? 99;
        case "warmth":
          return c.warmthScore;
        case "updated":
          return new Date(c.lastActionAt ?? c.createdAt).getTime() || 0;
      }
    };
    return [...board].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [contacts, sortKey, sortDir]);

  const cols: { key: SortKey; label: string; className?: string }[] = [
    { key: "name", label: "name" },
    { key: "company", label: "company" },
    { key: "stage", label: "stage" },
    { key: "warmth", label: "warmth" },
    { key: "updated", label: "last touch" },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-auto px-8 pb-6">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10 bg-lunari-black">
          <tr>
            {cols.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className="cursor-pointer select-none border-b border-lunari-surface-elevated px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400 hover:text-lunari-cream"
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key ? (
                    sortDir === "asc" ? (
                      <ArrowUp className="h-3 w-3 stroke-[1.5]" />
                    ) : (
                      <ArrowDown className="h-3 w-3 stroke-[1.5]" />
                    )
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const company = c.company?.name ?? null;
            return (
              <tr
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "planetarium cursor-pointer hover:bg-lunari-surface-elevated/50",
                  selectedId === c.id && "bg-lunari-surface-elevated/60",
                )}
              >
                <td className="border-b border-lunari-surface-elevated/60 px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lunari-surface font-mono text-[9px] text-lunari-neutral-400">
                      {initials(c.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-lunari-cream">
                        {c.name ?? "unnamed contact"}
                      </div>
                      {c.title ? (
                        <div className="truncate text-xs text-lunari-neutral-500">
                          {c.title}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="border-b border-lunari-surface-elevated/60 px-3 py-2 text-lunari-cream/80">
                  <span className="truncate">{company ?? "..."}</span>
                </td>
                <td className="border-b border-lunari-surface-elevated/60 px-3 py-2">
                  <StageChip stage={c.stage} />
                </td>
                <td className="border-b border-lunari-surface-elevated/60 px-3 py-2">
                  <FlameScore score={c.warmthScore} />
                </td>
                <td className="border-b border-lunari-surface-elevated/60 px-3 py-2 font-mono text-[10px] text-lunari-neutral-500">
                  {relTime(c.lastActionAt ?? c.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rows.length === 0 ? (
        <div className="px-3 py-10 text-center text-sm text-lunari-neutral-400">
          no leads yet ... import a list or paste a linkedin url to get started.
        </div>
      ) : null}

      <ContactDrawer
        contactId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
