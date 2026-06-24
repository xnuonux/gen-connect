"use client";

import { useState } from "react";
import { Check, X, Plus, RefreshCw, Copy, Globe, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { expectedRecords } from "@/lib/deliverability/dns";
import { addDomainAction, checkDomainAction } from "@/app/actions/sending-domains";
import type { SendingDomain } from "@/lib/supabase/sending-domains";
import type { DnsCheck } from "@/lib/deliverability/dns-verify";

function Pill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em]",
        ok ? "text-gen-accent" : "text-lunari-neutral-500",
      )}
    >
      {ok ? (
        <Check className="h-3 w-3 stroke-[2]" />
      ) : (
        <X className="h-3 w-3 stroke-[2]" />
      )}
      {label}
    </span>
  );
}

export function SendingDomains({ initial }: { initial: SendingDomain[] }) {
  const [domains, setDomains] = useState<SendingDomain[]>(initial);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Record<string, DnsCheck>>({});
  const [expanded, setExpanded] = useState<string | null>(initial[0]?.id ?? null);

  async function onAdd() {
    const d = input.trim();
    if (!d) return;
    setAdding(true);
    const r = await addDomainAction({ domain: d });
    setAdding(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setDomains(r.domains);
    setInput("");
    toast.success("domain added ... add the records below, then check dns.");
  }

  async function onCheck(dom: SendingDomain) {
    setCheckingId(dom.id);
    const r = await checkDomainAction({ id: dom.id, domain: dom.domain });
    setCheckingId(null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    setDomains(r.domains);
    setLastCheck((m) => ({ ...m, [dom.id]: r.check }));
    const ready = r.check.spf && r.check.dkim && r.check.mx;
    if (ready) toast.success("verified ... this domain is send-ready.");
    else toast.message("not verified yet ... records can take time to propagate.");
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(
      () => toast.success("copied."),
      () => toast.error("couldn't copy ... select it by hand."),
    );
  }

  return (
    <div>
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunari-neutral-400">
        sending domains
      </span>
      <p className="mt-1 text-[11px] leading-relaxed text-lunari-neutral-500">
        authenticate a domain before a live send ... spf + dkim + mx make it
        send-ready (the 2024 bulk-sender rules reject mail without them); dmarc is
        strongly recommended on top.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onAdd();
          }}
          placeholder="yourdomain.com"
          className="flex-1 rounded-md border border-lunari-surface-elevated bg-lunari-black/40 px-3 py-2 font-mono text-sm text-lunari-cream placeholder:text-lunari-neutral-500 focus:border-gen-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={adding}
          className="planetarium flex items-center gap-2 rounded-md bg-gen-accent px-3 py-2 text-xs font-medium text-lunari-cream hover:bg-gen-accent/90 disabled:cursor-not-allowed disabled:bg-lunari-surface-elevated disabled:text-lunari-neutral-500"
        >
          <Plus className="h-4 w-4 stroke-[1.5]" />
          <span>{adding ? "adding ..." : "add"}</span>
        </button>
      </div>

      {domains.length === 0 ? (
        <p className="mt-3 text-xs text-lunari-neutral-500">
          no sending domain yet ... add the one you&apos;ll send from.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {domains.map((d) => {
            const check = lastCheck[d.id];
            const recs = expectedRecords(d.domain);
            const open = expanded === d.id;
            const verified = d.status === "verified";
            return (
              <div
                key={d.id}
                className="surface-raised overflow-hidden rounded-lg border border-lunari-surface-elevated bg-lunari-surface"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : d.id)}
                    className="planetarium flex items-center gap-2 text-left"
                  >
                    <Globe
                      className={cn(
                        "h-4 w-4 stroke-[1.25]",
                        verified ? "text-gen-accent" : "text-lunari-neutral-400",
                      )}
                    />
                    <span className="font-mono text-sm text-lunari-cream">{d.domain}</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 stroke-[1.5] text-lunari-neutral-500 transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>
                  <div className="flex items-center gap-3">
                    <Pill label="spf" ok={check ? check.spf : d.spfVerified} />
                    <Pill label="dkim" ok={check ? check.dkim : d.dkimVerified} />
                    {check ? <Pill label="mx" ok={check.mx} /> : null}
                    <Pill label="dmarc" ok={check ? check.dmarc : d.dmarcVerified} />
                    <button
                      type="button"
                      onClick={() => onCheck(d)}
                      disabled={checkingId === d.id}
                      className="planetarium flex items-center gap-1.5 rounded-md border border-lunari-surface-elevated bg-lunari-surface px-2.5 py-1.5 text-[11px] text-lunari-cream hover:bg-lunari-surface-elevated disabled:opacity-40"
                    >
                      <RefreshCw
                        className={cn(
                          "h-3.5 w-3.5 stroke-[1.5]",
                          checkingId === d.id && "animate-spin",
                        )}
                      />
                      <span>{checkingId === d.id ? "checking ..." : "check dns"}</span>
                    </button>
                  </div>
                </div>

                {open ? (
                  <div className="space-y-2 border-t border-lunari-surface-elevated px-4 py-3">
                    {recs.map((rec) => (
                      <div
                        key={rec.kind}
                        className="rounded-md border border-lunari-surface-elevated bg-lunari-black/30 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-lunari-neutral-400">
                            {rec.kind} · {rec.type}
                            {rec.priority ? ` · priority ${rec.priority}` : ""}
                          </span>
                          <button
                            type="button"
                            onClick={() => copy(rec.value)}
                            className="planetarium text-lunari-neutral-500 hover:text-lunari-cream"
                            aria-label={`copy ${rec.kind} value`}
                          >
                            <Copy className="h-3.5 w-3.5 stroke-[1.5]" />
                          </button>
                        </div>
                        <div className="mt-1.5 grid grid-cols-[3rem_1fr] gap-x-2 gap-y-0.5">
                          <span className="font-mono text-[10px] text-lunari-neutral-500">host</span>
                          <span className="break-all font-mono text-xs text-lunari-cream">{rec.host}</span>
                          <span className="font-mono text-[10px] text-lunari-neutral-500">value</span>
                          <span className="break-all font-mono text-xs text-lunari-cream">{rec.value}</span>
                        </div>
                        {rec.note ? (
                          <p className="mt-1.5 text-[11px] leading-relaxed text-lunari-neutral-500">
                            {rec.note}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
