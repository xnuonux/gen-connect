"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sparkles,
  Send,
  Flame,
  Inbox as InboxIcon,
  CornerDownLeft,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils/cn";
import {
  fetchThreads,
  fetchThreadMessages,
  draftReplyAction,
  sendReplyAction,
  markThreadReadAction,
} from "@/app/actions/unibox";
import type { UniboxThread } from "@/lib/supabase/unibox";

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

// the unibox ... a gmail-grade 3-pane (threads / transcript / contact), with a
// gen-drafted reply composer that writes in the user's voice and sends through
// the test-mode-safe boundary. tables + the outbound logger already exist, so
// this is read + draft + send, no migration.
export function UniboxView({
  initialThreads,
}: {
  initialThreads: UniboxThread[];
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(
    initialThreads[0]?.id ?? null,
  );
  const [composer, setComposer] = useState("");
  const [meta, setMeta] = useState<{ angle: string; confidence: number } | null>(
    null,
  );

  const { data: threads } = useQuery({
    queryKey: ["unibox-threads"],
    queryFn: fetchThreads,
    initialData: initialThreads,
  });

  const selected = threads.find((t) => t.id === selectedId) ?? null;

  const { data: messages, isLoading: msgsLoading } = useQuery({
    queryKey: ["unibox-messages", selectedId],
    queryFn: () => fetchThreadMessages(selectedId as string),
    enabled: selectedId !== null,
  });

  const draftMut = useMutation({
    mutationFn: async () => {
      const r = await draftReplyAction({ threadId: selectedId });
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSuccess: (r) => {
      setComposer(r.reply);
      setMeta({ angle: r.angle, confidence: r.confidence });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "the draft didn't land."),
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const r = await sendReplyAction({ threadId: selectedId, body: composer });
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSuccess: (r) => {
      toast.success(
        r.mode === "live"
          ? `sent to ${r.deliveredTo}.`
          : `test send ... landed in ${r.deliveredTo}.`,
      );
      setComposer("");
      setMeta(null);
      void queryClient.invalidateQueries({
        queryKey: ["unibox-messages", selectedId],
      });
      void queryClient.invalidateQueries({ queryKey: ["unibox-threads"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "couldn't send that."),
  });

  function selectThread(id: string) {
    setSelectedId(id);
    setComposer("");
    setMeta(null);
    // optimistically clear the unread dot, then persist + reconcile.
    const target = threads.find((t) => t.id === id);
    if (target && target.unreadCount > 0) {
      queryClient.setQueryData<UniboxThread[]>(["unibox-threads"], (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, unreadCount: 0 } : t)),
      );
      void markThreadReadAction(id).then(() =>
        queryClient.invalidateQueries({ queryKey: ["unibox-threads"] }),
      );
    }
  }

  function onComposerKey(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (composer.trim() && !sendMut.isPending) sendMut.mutate();
    }
  }

  return (
    <div className="grid h-full grid-cols-[320px_1fr_340px] overflow-hidden">
      {/* thread list */}
      <aside className="flex min-h-0 flex-col border-r border-lunari-surface-elevated bg-lunari-surface">
        <div className="flex items-center justify-between border-b border-lunari-surface-elevated px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
            unibox
          </span>
          <span className="font-mono text-[10px] tabular-nums text-lunari-neutral-500">
            {threads.length}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {threads.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-lunari-neutral-400">
              your inbox is quiet ... sends land here and replies thread in. fire
              one from the pipeline to start the loop.
            </div>
          ) : (
            threads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={t.id === selectedId}
                onSelect={() => selectThread(t.id)}
              />
            ))
          )}
        </div>
      </aside>

      {/* transcript + composer */}
      <section className="flex min-h-0 flex-col">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <InboxIcon className="h-6 w-6 stroke-[1.25] text-lunari-neutral-500" />
            <p className="text-sm text-lunari-neutral-400">
              select a thread to read it.
            </p>
          </div>
        ) : (
          <>
            <header className="border-b border-lunari-surface-elevated px-6 py-3.5">
              <div className="text-sm text-lunari-cream">
                {selected.contact?.name ?? "unknown contact"}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-500">
                {selected.channel} · {selected.status}
                {selected.contact?.email ? ` · ${selected.contact.email}` : ""}
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
              {msgsLoading ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-12 w-2/3 animate-pulse rounded-lg bg-lunari-surface-elevated",
                        i % 2 === 1 && "ml-auto",
                      )}
                    />
                  ))}
                </div>
              ) : (messages ?? []).length === 0 ? (
                <p className="text-center text-sm text-lunari-neutral-500">
                  no messages yet on this thread.
                </p>
              ) : (
                (messages ?? []).map((m) => (
                  <MessageBubble
                    key={m.id}
                    outbound={m.direction === "outbound"}
                    subject={m.subject}
                    body={m.body}
                    at={relTime(m.sentAt)}
                  />
                ))
              )}
            </div>

            {/* composer */}
            <div className="border-t border-lunari-surface-elevated bg-lunari-surface px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => draftMut.mutate()}
                  disabled={draftMut.isPending}
                  className="planetarium flex items-center gap-2 rounded-md border border-gen-accent/40 bg-gen-accent-soft px-3 py-1.5 text-xs font-medium text-gen-accent hover:bg-gen-accent-soft disabled:opacity-50"
                >
                  <Sparkles
                    className={cn(
                      "h-4 w-4 stroke-[1.25]",
                      draftMut.isPending && "animate-pulse",
                    )}
                  />
                  <span>
                    {draftMut.isPending ? "gen is writing ..." : "gen draft"}
                  </span>
                </button>
                {meta ? (
                  <span className="flex items-center gap-1.5 rounded-full border border-gen-accent/40 bg-gen-accent-soft px-2 py-0.5 font-mono text-[10px] text-gen-accent">
                    <Flame className="h-3 w-3 stroke-[1.5]" />
                    <span className="tabular-nums">{meta.confidence}</span>
                    <span className="text-gen-accent/70">· {meta.angle}</span>
                  </span>
                ) : null}
              </div>
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={onComposerKey}
                rows={3}
                placeholder="write a reply, or let gen draft one ..."
                className="w-full resize-none rounded-md border border-lunari-surface-elevated bg-lunari-black/40 px-3 py-2 text-sm text-lunari-cream placeholder:text-lunari-neutral-500 focus:outline-none focus:ring-1 focus:ring-gen-accent"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="font-mono text-[10px] text-lunari-neutral-500">
                  cmd+enter to send
                </span>
                <button
                  type="button"
                  onClick={() => sendMut.mutate()}
                  disabled={!composer.trim() || sendMut.isPending}
                  className="planetarium flex items-center gap-2 rounded-md bg-gen-accent px-3 py-1.5 text-xs font-medium text-lunari-cream hover:bg-gen-accent/90 disabled:cursor-not-allowed disabled:bg-lunari-surface-elevated disabled:text-lunari-neutral-500"
                >
                  <Send className="h-4 w-4 stroke-[1.25]" />
                  <span>{sendMut.isPending ? "sending ..." : "send"}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* contact rail */}
      <aside className="flex min-h-0 flex-col border-l border-lunari-surface-elevated bg-lunari-surface p-4">
        <span className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
          contact
        </span>
        {selected?.contact ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lunari-surface-elevated font-mono text-[10px] text-lunari-neutral-400">
                {initials(selected.contact.name)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm text-lunari-cream">
                  {selected.contact.name ?? "unknown"}
                </div>
                {selected.contact.title ? (
                  <div className="truncate text-xs text-lunari-neutral-500">
                    {selected.contact.title}
                  </div>
                ) : null}
              </div>
            </div>
            {selected.contact.company ? (
              <Field label="company" value={selected.contact.company} />
            ) : null}
            {selected.contact.email ? (
              <Field label="email" value={selected.contact.email} mono />
            ) : null}
            <Link
              href={`/draft/${selected.contact.id}` as Route}
              className="planetarium flex items-center gap-1.5 rounded-md border border-lunari-surface-elevated bg-lunari-surface px-3 py-2 text-xs text-lunari-cream hover:bg-lunari-surface-elevated"
            >
              <CornerDownLeft className="h-3.5 w-3.5 stroke-[1.25]" />
              <span>open in draft studio</span>
            </Link>
          </div>
        ) : (
          <p className="text-xs text-lunari-neutral-400">no contact selected.</p>
        )}
      </aside>
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  onSelect,
}: {
  thread: UniboxThread;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "planetarium mb-1 flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left",
        active
          ? "bg-lunari-surface-elevated"
          : "hover:bg-lunari-surface-elevated/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm text-lunari-cream">
          {thread.contact?.name ?? "unknown contact"}
        </span>
        <span className="shrink-0 font-mono text-[9px] text-lunari-neutral-500">
          {relTime(thread.lastMessageAt)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {thread.unreadCount > 0 ? (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gen-accent" />
        ) : null}
        <span className="truncate text-xs text-lunari-neutral-400">
          {thread.lastDirection === "outbound" ? "you ... " : ""}
          {thread.preview ?? "no messages yet"}
        </span>
      </div>
    </button>
  );
}

function MessageBubble({
  outbound,
  subject,
  body,
  at,
}: {
  outbound: boolean;
  subject: string | null;
  body: string;
  at: string;
}) {
  return (
    <div className={cn("flex flex-col", outbound ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3.5 py-2.5",
          outbound
            ? "bg-gen-accent-soft text-lunari-cream"
            : "bg-lunari-surface-elevated text-lunari-cream/90",
        )}
      >
        {subject ? (
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-lunari-neutral-400">
            {subject}
          </div>
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
      </div>
      <span className="mt-1 font-mono text-[9px] text-lunari-neutral-500">
        {outbound ? "you" : "them"}
        {at ? ` · ${at} ago` : ""}
      </span>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md bg-lunari-black/40 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-lunari-neutral-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 truncate text-xs text-lunari-cream/80",
          mono && "font-mono",
        )}
      >
        {value}
      </div>
    </div>
  );
}
