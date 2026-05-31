"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Sparkles, ArrowUp, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

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

export function GenChat() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/gen" }),
  });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    void sendMessage({ text });
    setInput("");
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState onPick={(t) => setInput(t)} />
        ) : (
          <div className="flex flex-col gap-4 pb-4">
            {messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}
            {busy ? (
              <div className="flex items-center gap-2 text-xs text-lunari-neutral-500">
                <Sparkles className="h-4 w-4 animate-pulse stroke-[1.25] text-gen-accent" />
                <span className="font-mono uppercase tracking-[0.15em]">
                  gen is working ...
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

function MessageRow({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const parts = message.parts as unknown as LoosePart[];

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

      {parts.map((part, i) => {
        if (part.type === "text" && part.text) {
          return (
            <div
              key={i}
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-relaxed",
                isUser
                  ? "bg-lunari-surface-elevated text-lunari-cream"
                  : "text-lunari-cream",
              )}
            >
              {part.text}
            </div>
          );
        }
        if (part.type === "tool-plan") {
          const out = part.output as { steps?: PlanStep[] } | undefined;
          const steps = out?.steps ?? part.input?.steps ?? [];
          return steps.length ? <PlanChecklist key={i} steps={steps} /> : null;
        }
        if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
          const name =
            part.type === "dynamic-tool"
              ? (part.toolName ?? "tool")
              : toolName(part.type);
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
          return (
            <div
              key={i}
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-lunari-neutral-500"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  errored
                    ? "bg-lunari-crimson"
                    : done
                      ? "bg-gen-accent"
                      : "animate-pulse bg-lunari-neutral-400",
                )}
              />
              <span>
                {TOOL_LABELS[name] ?? name}
                {detail}
              </span>
            </div>
          );
        }
        return null;
      })}
    </div>
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
