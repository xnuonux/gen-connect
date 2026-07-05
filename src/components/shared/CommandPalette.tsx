"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Search, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  filterCommands,
  type PaletteCommand,
  type ContactHit,
} from "@/lib/commands/registry";
import { searchContactsAction } from "@/app/actions/contacts";

// the cmd+K command palette ... the keyboard twin of the copilot. hand-rolled
// (no cmdk dep) for full token control + react 19 safety. opens on cmd/ctrl+K,
// filters the registry, arrows move, enter runs, esc closes. forest-green ring only
// on gen-authored actions, never on nav.
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [contacts, setContacts] = useState<ContactHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(open);
  const wasOpenRef = useRef(false);

  // the palette is the copilot's keyboard twin: the static nav/do rows, a
  // synthetic "ask gen" row that carries the query, and live contact hits.
  const staticResults = useMemo(() => filterCommands(query), [query]);
  const results = useMemo<PaletteCommand[]>(() => {
    const list: PaletteCommand[] = [...staticResults];
    const q = query.trim();
    if (q.length > 0) {
      list.push({
        id: "ask-gen-dynamic",
        label: `ask gen: "${q}"`,
        group: "do",
        kind: "ask",
        query: q,
        gen: true,
        hint: "opens the copilot",
      });
    }
    for (const c of contacts) {
      list.push({
        id: `contact-${c.id}`,
        label: c.name ?? c.email ?? "unknown contact",
        group: "contacts",
        kind: "contact",
        contactId: c.id,
        hint: c.company ?? c.email ?? undefined,
      });
    }
    return list;
  }, [staticResults, contacts, query]);

  // live contact search feeds the "contacts" group. debounced; RLS scopes the
  // hits to the user. under two chars clears (never a match-everything). every
  // setState lands inside the deferred timeout, never synchronously in the effect
  // body ... keeps clear of the set-state-in-effect rule the whole app honors.
  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      if (q.length < 2) {
        setContacts([]);
        return;
      }
      void searchContactsAction(q).then((hits) => {
        if (!cancelled) setContacts(hits);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const run = useCallback(
    (cmd: PaletteCommand | undefined) => {
      if (!cmd) return;
      close();
      const kind = cmd.kind ?? "nav";
      if (kind === "ask") {
        router.push(`/gen?q=${encodeURIComponent(cmd.query ?? "")}` as Route);
      } else if (kind === "contact" && cmd.contactId) {
        router.push(`/draft/${cmd.contactId}` as Route);
      } else if (cmd.href) {
        router.push(cmd.href);
      }
    },
    [close, router],
  );

  // keep openRef current for the global handler without re-registering it.
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // the global open shortcut. cmd+K (mac) / ctrl+K. closing via the shortcut
  // routes through close() so query + active never go stale for the next open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (openRef.current) close();
        else setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // focus the input when the palette opens; on a real close, land keyboard
  // users back on the launcher. ref access lives in this effect, never in
  // render or a render-created handler (the react-hooks/refs rule).
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      inputRef.current?.focus();
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  const groups = useMemo(() => {
    const order: PaletteCommand["group"][] = ["go to", "do", "contacts"];
    return order
      .map((g) => ({ group: g, items: results.filter((c) => c.group === g) }))
      .filter((s) => s.items.length > 0);
  }, [results]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="planetarium flex items-center gap-2 rounded-md border border-lunari-surface-elevated bg-lunari-black/40 px-2.5 py-1 text-xs text-lunari-neutral-400 hover:text-lunari-cream"
        aria-label="open command palette"
      >
        <Search className="h-3.5 w-3.5 stroke-[1.25]" />
        <span className="font-mono text-[10px] tracking-[0.1em]">jump to ...</span>
        <kbd className="rounded border border-lunari-surface-elevated px-1 font-mono text-[9px] text-lunari-neutral-500">
          cmd k
        </kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[18vh]">
          <button
            type="button"
            aria-label="close command palette"
            onClick={close}
            className="absolute inset-0 cursor-default bg-lunari-black/70 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="command palette"
            onKeyDown={onListKey}
            className="reveal-up relative w-full max-w-lg overflow-hidden rounded-xl border border-lunari-surface-elevated bg-lunari-surface shadow-2xl shadow-black/70"
          >
            <div className="flex items-center gap-2.5 border-b border-lunari-surface-elevated px-4">
              <Search className="h-4 w-4 shrink-0 stroke-[1.25] text-lunari-neutral-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="jump to a tab, or ask gen ..."
                className="w-full bg-transparent py-3.5 text-sm text-lunari-cream placeholder:text-lunari-neutral-500 focus:outline-none"
              />
            </div>

            <div className="max-h-80 overflow-y-auto p-1.5">
              {results.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-lunari-neutral-400">
                  nothing matches ... try a tab name.
                </div>
              ) : (
                groups.map((section) => (
                  <div key={section.group} className="mb-1">
                    <div className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-500">
                      {section.group}
                    </div>
                    {section.items.map((cmd) => {
                      const idx = results.indexOf(cmd);
                      const on = idx === active;
                      return (
                        <button
                          key={cmd.id}
                          type="button"
                          onMouseMove={() => setActive(idx)}
                          onClick={() => run(cmd)}
                          className={cn(
                            "planetarium flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm",
                            on
                              ? "bg-lunari-surface-elevated text-lunari-cream"
                              : "text-lunari-cream/80",
                            cmd.gen && on && "ring-1 ring-gen-accent",
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span className={cn(cmd.gen && "text-gen-accent")}>
                              {cmd.label}
                            </span>
                            {cmd.hint ? (
                              <span className="font-mono text-[10px] text-lunari-neutral-500">
                                {cmd.hint}
                              </span>
                            ) : null}
                          </span>
                          {on ? (
                            <CornerDownLeft className="h-3.5 w-3.5 stroke-[1.25] text-lunari-neutral-400" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
