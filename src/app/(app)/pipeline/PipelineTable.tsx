"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowDown, X, Tag, Ban, Loader2 } from "lucide-react";
import {
  fetchContacts,
  bulkMoveStageAction,
  bulkTagAction,
} from "@/app/actions/contacts";
import { fetchSequences, enrollContactsAction } from "@/app/actions/sequences";
import { toast } from "sonner";
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

// the twenty-grade dense record table ... the same RLS contacts the kanban reads
// (shared react-query cache), sortable, multi-select with a bulk action bar, and
// row-click opens the same drawer. self-contained so the kanban is untouched.
export function PipelineTable({
  initialContacts,
}: {
  initialContacts: Contact[];
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: contacts } = useQuery({
    queryKey: ["contacts"],
    queryFn: fetchContacts,
    initialData: initialContacts,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [tagText, setTagText] = useState("");
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

  // pick a row ... shift-click extends from the last anchor across the sorted view
  // (the handoff's "multi-select via shift-click in table"), a plain click toggles
  // one + moves the anchor.
  function pick(id: string, shiftKey: boolean, index: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (shiftKey && anchorIndex !== null) {
        const lo = Math.min(anchorIndex, index);
        const hi = Math.max(anchorIndex, index);
        for (let k = lo; k <= hi; k += 1) {
          const rid = rows[k]?.id;
          if (rid) next.add(rid);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    if (!shiftKey) setAnchorIndex(index);
  }
  function toggleAll() {
    setPicked((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );
  }
  function clearPicked() {
    setPicked(new Set());
  }

  const ids = useMemo(() => Array.from(picked), [picked]);

  const bulkMove = useMutation({
    mutationFn: async (stage: string) => {
      const r = await bulkMoveStageAction({ contactIds: ids, stage });
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSuccess: (r) => {
      toast.success(`moved ${r.count}.`);
      clearPicked();
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      router.refresh();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "that didn't land."),
  });

  const bulkTag = useMutation({
    mutationFn: async (tag: string) => {
      const r = await bulkTagAction({ contactIds: ids, tags: [tag] });
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSuccess: (r) => {
      toast.success(`tagged ${r.count}.`);
      setTagText("");
      clearPicked();
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      router.refresh();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "couldn't tag those."),
  });

  // the sequences list for the enroll picker ... only fetched once a selection
  // exists (the bar is the only consumer), shares the ['sequences'] cache.
  const { data: sequences = [] } = useQuery({
    queryKey: ["sequences"],
    queryFn: fetchSequences,
    enabled: picked.size > 0,
  });

  const enroll = useMutation({
    mutationFn: async (sequenceId: string) => {
      const r = await enrollContactsAction({ sequenceId, contactIds: ids });
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSuccess: (r) => {
      toast.success(
        r.enrolled > 0
          ? `enrolled ${r.enrolled} ... watch the steps fire from campaigns.`
          : "already enrolled.",
      );
      clearPicked();
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["sequences"] });
      router.refresh();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "couldn't enroll those."),
  });

  const busy = bulkMove.isPending || bulkTag.isPending || enroll.isPending;

  const cols: { key: SortKey; label: string }[] = [
    { key: "name", label: "name" },
    { key: "company", label: "company" },
    { key: "stage", label: "stage" },
    { key: "warmth", label: "warmth" },
    { key: "updated", label: "last touch" },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-auto px-8 pb-24">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10 bg-lunari-surface-elevated">
          <tr>
            <th className="w-8 border-b border-lunari-surface-elevated px-3 py-2">
              <input
                type="checkbox"
                aria-label="select all"
                checked={rows.length > 0 && picked.size === rows.length}
                onChange={toggleAll}
                className="accent-gen-accent"
              />
            </th>
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
          {rows.map((c, i) => {
            const company = c.company?.name ?? null;
            const sel = picked.has(c.id);
            return (
              <tr
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "planetarium cursor-pointer hover:bg-lunari-surface-elevated/50",
                  (selectedId === c.id || sel) &&
                    "bg-lunari-surface-elevated/60",
                )}
              >
                <td
                  className="border-b border-lunari-surface-elevated/60 px-3 py-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    aria-label={`select ${c.name ?? "contact"}`}
                    checked={sel}
                    onChange={() => undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      pick(c.id, e.shiftKey, i);
                    }}
                    className="accent-gen-accent"
                  />
                </td>
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

      {/* the bulk action bar ... slides up from the bottom on selection. */}
      {picked.size > 0 ? (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-8">
          <div className="planetarium flex items-center gap-3 rounded-lg border border-lunari-surface-elevated bg-lunari-surface px-4 py-2.5 shadow-2xl shadow-lunari-black/70">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
              {picked.size} selected
            </span>
            <span className="h-4 w-px bg-lunari-surface-elevated" />
            <select
              aria-label="move to stage"
              defaultValue=""
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) bulkMove.mutate(e.target.value);
                e.currentTarget.value = "";
              }}
              className="rounded-md border border-lunari-surface-elevated bg-lunari-black px-2 py-1.5 text-xs text-lunari-cream/90 focus:outline-none"
            >
              <option value="">move to ...</option>
              {KANBAN_STAGES.map((s) => (
                <option key={s} value={s} className="bg-lunari-surface">
                  {s}
                </option>
              ))}
            </select>
            {sequences.length > 0 ? (
              <select
                aria-label="enroll in sequence"
                defaultValue=""
                disabled={busy}
                onChange={(e) => {
                  if (e.target.value) enroll.mutate(e.target.value);
                  e.currentTarget.value = "";
                }}
                className="rounded-md border border-lunari-surface-elevated bg-lunari-black px-2 py-1.5 text-xs text-lunari-cream/90 focus:outline-none"
              >
                <option value="">enroll in ...</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id} className="bg-lunari-surface">
                    {s.name}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="flex items-center gap-1.5">
              <input
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagText.trim() && !busy) {
                    bulkTag.mutate(tagText.trim());
                  }
                }}
                placeholder="tag ..."
                className="w-24 rounded-md border border-lunari-surface-elevated bg-lunari-black px-2 py-1.5 text-xs text-lunari-cream placeholder:text-lunari-neutral-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={!tagText.trim() || busy}
                onClick={() => bulkTag.mutate(tagText.trim())}
                className="planetarium flex h-7 w-7 items-center justify-center rounded-md text-lunari-neutral-400 hover:bg-lunari-surface-elevated hover:text-lunari-cream disabled:opacity-40"
                aria-label="apply tag"
              >
                <Tag className="h-4 w-4 stroke-[1.25]" />
              </button>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => bulkMove.mutate("do_not_contact")}
              className="planetarium flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-lunari-neutral-400 hover:bg-lunari-surface-elevated hover:text-lunari-crimson disabled:opacity-40"
            >
              <Ban className="h-4 w-4 stroke-[1.25]" />
              <span>dismiss</span>
            </button>
            <span className="h-4 w-px bg-lunari-surface-elevated" />
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin stroke-[1.5] text-lunari-neutral-400" />
            ) : (
              <button
                type="button"
                onClick={clearPicked}
                aria-label="clear selection"
                className="planetarium flex h-7 w-7 items-center justify-center rounded-md text-lunari-neutral-400 hover:bg-lunari-surface-elevated hover:text-lunari-cream"
              >
                <X className="h-4 w-4 stroke-[1.25]" />
              </button>
            )}
          </div>
        </div>
      ) : null}

      <ContactDrawer contactId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
