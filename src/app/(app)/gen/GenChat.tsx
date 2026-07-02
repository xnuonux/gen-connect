"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  Sparkles,
  ArrowUp,
  Check,
  Circle,
  Search,
  BadgeCheck,
  Download,
  Radar,
  PenLine,
  ListChecks,
  Send,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Markdown } from "@/components/shared/Markdown";
import { fetchGenThread } from "@/app/actions/gen";

type PlanStep = { label: string; status: "pending" | "active" | "done" };

// a loose view of a message part so we can render text + tool activity without
// fighting the union types across ai-sdk versions.
type LoosePart = {
  type: string;
  text?: string;
  state?: string;
  toolName?: string;
  input?: { steps?: PlanStep[] };
  output?:
    | { count?: number; loaded?: number; ok?: boolean; steps?: PlanStep[] }
    | unknown;
};

const TOOL_LABELS: Record<string, string> = {
  find_leads: "finding leads",
  verify_emails: "verifying emails",
  load_contacts: "loading into pipeline",
  enrich_contact: "enriching",
  draft_angles: "drafting 5 angles",
  list_contacts: "reading pipeline",
};

function toolName(partType: string): string {
  return partType.startsWith("tool-") ? partType.slice(5) : partType;
}

export function GenChat({
  conversationId,
  initialMessages,
  summary,
  seedInput,
}: {
  conversationId: string;
  initialMessages: UIMessage[];
  summary: string | null;
  // pre-seed the composer (the cmd+K "ask gen" row lands the query here via ?q=).
  // seeded, not sent ... the human still hits enter, so nothing spends on a jump.
  seedInput?: string;
}) {
  const { messages, sendMessage, status, setMessages } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/gen",
      prepareSendMessagesRequest({ messages, id }) {
        return { body: { message: messages[messages.length - 1], id } };
      },
    }),
  });
  const [input, setInput] = useState(seedInput ?? "");
  const [stalled, setStalled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";

  // a dangling user turn with no live stream = a reply we can't see. it happens
  // when you tab away mid-response: the client useChat unmounts + loses the
  // stream, but the server's consumeStream still persists the reply. so when the
  // last message is a user turn and we're not actively streaming, gen is either
  // still working server-side or just finished ... poll the persisted thread
  // until the assistant reply lands, and show a "working" state meanwhile so it
  // never looks like the reply vanished.
  const last = messages[messages.length - 1];
  const pendingReply = !busy && !!last && last.role === "user";

  useEffect(() => {
    if (!pendingReply) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      tries += 1;
      let fresh: UIMessage[] = [];
      try {
        fresh = await fetchGenThread(conversationId);
      } catch {
        // transient read hiccup ... keep waiting.
      }
      if (cancelled) return;
      const freshLast = fresh[fresh.length - 1];
      if (freshLast && freshLast.role === "assistant") {
        setStalled(false);
        setMessages(fresh);
        return;
      }
      // big multi-step turns (lead pull + verify + enrich + draft) genuinely run
      // several minutes ... observed 2.6-3.9min in dev. so the give-up has to sit
      // WELL past the longest real turn, or it would flag a still-working turn as
      // dead (the exact bug this fixes). ~160 * 3s = ~8min ... past that, the turn
      // really didn't come back, so surface it rather than spin forever.
      if (tries >= 160) {
        setStalled(true);
        return;
      }
      timer = setTimeout(tick, 3000);
    };
    timer = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pendingReply, conversationId, setMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy, pendingReply, stalled]);

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    setStalled(false);
    void sendMessage({ text });
    setInput("");
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {summary ? <MemoryBanner summary={summary} /> : null}
        {messages.length === 0 && !summary ? (
          <EmptyState onPick={(t) => setInput(t)} />
        ) : (
          <div className="flex flex-col gap-4 pb-4">
            {messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}
            {(busy || pendingReply) && !stalled ? (
              <div className="flex items-center gap-2 text-xs text-lunari-neutral-500">
                <Sparkles className="h-4 w-4 animate-pulse stroke-[1.25] text-gen-accent" />
                <span className="font-mono uppercase tracking-[0.15em]">
                  gen is working ...
                </span>
              </div>
            ) : null}
            {stalled ? (
              <div className="flex items-center gap-2 text-xs text-lunari-neutral-400">
                <Circle className="h-3 w-3 stroke-[1.25] text-lunari-neutral-500" />
                <span className="font-mono uppercase tracking-[0.15em]">
                  that reply didn&apos;t come back ... your turn is saved, ask
                  again or reload.
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="mt-4 flex items-end gap-2 rounded-md border border-lunari-surface-elevated bg-lunari-surface p-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="find me 20 partners at top vc firms, verify the emails, load the good ones ..."
          className="min-h-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm text-lunari-cream placeholder:text-lunari-neutral-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="send"
          className="planetarium flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gen-accent text-lunari-cream hover:bg-gen-accent/90 disabled:cursor-not-allowed disabled:bg-lunari-surface-elevated disabled:text-lunari-neutral-500"
        >
          <ArrowUp className="h-4 w-4 stroke-[1.25]" />
        </button>
      </form>
    </div>
  );
}

type Block =
  | { t: "text"; text: string }
  | { t: "plan"; steps: PlanStep[] }
  | {
      t: "tool";
      name: string;
      label: string;
      done: boolean;
      errored: boolean;
      detail: string;
      count: number;
    };

// collapse a message's parts into render blocks, merging consecutive tool markers
// of the same label into one (gen calling draft_angles once per contact should read
// as one "drafting 5 angles · 5x" line, not five stacked identical rows).
function toBlocks(parts: LoosePart[]): Block[] {
  const blocks: Block[] = [];
  for (const part of parts) {
    if (part.type === "text" && part.text) {
      blocks.push({ t: "text", text: part.text });
      continue;
    }
    if (part.type === "tool-plan") {
      const out = part.output as { steps?: PlanStep[] } | undefined;
      const steps = out?.steps ?? part.input?.steps ?? [];
      if (steps.length) blocks.push({ t: "plan", steps });
      continue;
    }
    if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
      const name =
        part.type === "dynamic-tool" ? (part.toolName ?? "tool") : toolName(part.type);
      const label = TOOL_LABELS[name] ?? name;
      const done = part.state === "output-available";
      const errored = part.state === "output-error";
      const out =
        part.output && typeof part.output === "object"
          ? (part.output as { count?: number; loaded?: number })
          : undefined;
      const detail =
        out?.loaded != null
          ? ` · ${out.loaded} loaded`
          : out?.count != null
            ? ` · ${out.count} found`
            : "";
      const prev = blocks[blocks.length - 1];
      if (prev && prev.t === "tool" && prev.label === label) {
        prev.count += 1;
        prev.done = done || prev.done;
        prev.errored = errored || prev.errored;
        if (detail) prev.detail = detail;
      } else {
        blocks.push({ t: "tool", name, label, done, errored, detail, count: 1 });
      }
    }
  }
  return blocks;
}

function MessageRow({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const blocks = toBlocks(message.parts as unknown as LoosePart[]);

  return (
    <div className={cn("flex flex-col gap-1.5", isUser && "items-end")}>
      {!isUser ? (
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 stroke-[1.25] text-gen-accent" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gen-accent">
            gen
          </span>
        </div>
      ) : null}

      {blocks.map((b, i) => {
        if (b.t === "text") {
          // gen replies render as markdown (tables, bold, lists ... the draft
          // scorecards become real tables); the user's own text stays verbatim.
          return isUser ? (
            <div
              key={i}
              className="max-w-[85%] whitespace-pre-wrap rounded-md bg-lunari-surface-elevated px-3 py-2 text-sm leading-relaxed text-lunari-cream"
            >
              {b.text}
            </div>
          ) : (
            <div key={i} className="w-full px-1 text-lunari-cream">
              <Markdown text={b.text} />
            </div>
          );
        }
        if (b.t === "plan") {
          return <PlanChecklist key={i} steps={b.steps} />;
        }
        return <ToolCard key={i} block={b} />;
      })}
    </div>
  );
}

function MemoryBanner({ summary }: { summary: string }) {
  return (
    <details className="mb-4 rounded-md border border-lunari-surface-elevated bg-lunari-surface/60 px-3 py-2">
      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-500">
        gen&apos;s memory of your work together
      </summary>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-lunari-neutral-400">
        {summary}
      </p>
    </details>
  );
}

function PlanChecklist({ steps }: { steps: PlanStep[] }) {
  return (
    <div className="rounded-md border border-lunari-surface-elevated bg-lunari-surface/60 px-3 py-2.5">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-500">
        plan
      </div>
      <ul className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            {s.status === "done" ? (
              <Check className="h-3.5 w-3.5 shrink-0 stroke-[1.5] text-gen-accent" />
            ) : s.status === "active" ? (
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                <span className="h-2 w-2 animate-pulse rounded-sm bg-gen-accent" />
              </span>
            ) : (
              <Circle className="h-3 w-3 shrink-0 stroke-[1.25] text-lunari-neutral-500" />
            )}
            <span
              className={cn(
                s.status === "done"
                  ? "text-lunari-neutral-400"
                  : s.status === "active"
                    ? "text-lunari-cream"
                    : "text-lunari-neutral-400",
              )}
            >
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// one icon per tool ... the belt made legible. unmapped tools fall back to Wand2.
const TOOL_ICON: Record<string, LucideIcon> = {
  find_leads: Search,
  find_leads_by_icp: Search,
  verify_emails: BadgeCheck,
  load_contacts: Download,
  import_leads: Download,
  enrich_contact: Radar,
  bulk_enrich: Radar,
  resolve_footprint: Radar,
  draft_angles: PenLine,
  list_contacts: ListChecks,
  pipeline_summary: ListChecks,
  move_stage: ListChecks,
  tag_contacts: ListChecks,
  log_outcome: Sparkles,
  send_email: Send,
};

// a living tool card ... the copilot stops reading like a terminal and starts
// feeling like a teammate at work. an icon tile, the label + fan-out count, the
// result chip (leads found / loaded), and a lifecycle indicator: a pulsing dot
// while it runs, a forest-green check when it lands, a crimson dot on error.
function ToolCard({ block }: { block: Extract<Block, { t: "tool" }> }) {
  const Icon = TOOL_ICON[block.name] ?? Wand2;
  const pending = !block.done && !block.errored;
  const detail = block.detail.replace(/^\s*·\s*/, "");
  return (
    <div
      className={cn(
        "planetarium flex items-center gap-3 rounded-md border bg-lunari-surface px-3 py-2",
        block.errored
          ? "border-lunari-crimson/40"
          : block.done
            ? "border-gen-accent/30"
            : "border-lunari-surface-elevated",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          block.done
            ? "bg-gen-accent-soft text-gen-accent"
            : "bg-lunari-surface-elevated text-lunari-neutral-400",
        )}
      >
        <Icon className={cn("h-3.5 w-3.5 stroke-[1.5]", pending && "animate-pulse")} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-lunari-cream">{block.label}</span>
          {block.count > 1 ? (
            <span className="font-mono text-[10px] text-lunari-neutral-500">
              {block.count}x
            </span>
          ) : null}
        </div>
        {detail ? (
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-lunari-neutral-500">
            {detail}
          </div>
        ) : null}
      </div>
      <span className="flex shrink-0 items-center justify-center">
        {block.errored ? (
          <span className="h-2 w-2 rounded-full bg-lunari-crimson" />
        ) : block.done ? (
          <Check className="h-4 w-4 stroke-[1.5] text-gen-accent" />
        ) : (
          <span className="h-2 w-2 animate-pulse rounded-full bg-lunari-neutral-400" />
        )}
      </span>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (t: string) => void }) {
  const prompts = [
    "find me 20 partners at top vc firms, verify the emails, load the good ones",
    "pull a handful of tech founders + ctos, then draft the first one",
    "who's in my pipeline at stripe?",
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <Sparkles className="h-7 w-7 stroke-[1.25] text-gen-accent" />
      <div className="flex flex-col gap-1">
        <p className="text-sm text-lunari-cream">
          talk to gen like you would an operator.
        </p>
        <p className="text-xs text-lunari-neutral-400">
          it finds leads, verifies, loads, enriches, and drafts ... you steer.
        </p>
      </div>
      <div className="flex flex-col items-center gap-2">
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="planetarium rounded-full border border-lunari-surface-elevated bg-lunari-surface px-3 py-1.5 text-xs text-lunari-neutral-400 hover:bg-lunari-surface-elevated hover:text-lunari-cream"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
