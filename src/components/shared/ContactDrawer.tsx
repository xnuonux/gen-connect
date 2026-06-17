"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { ContactDrawerPanel } from "@/components/shared/ContactDrawerPanel";
import { WinCelebration } from "@/components/shared/WinCelebration";
import { fetchContactDetail } from "@/app/actions/contacts";
import { resolveFootprintAction } from "@/app/actions/footprint";
import { logOutcomeAction } from "@/app/actions/outcomes";
import { type OutcomeType } from "@/lib/types/outcome";

// the side-drawer container: owns open/close + esc, lazy-loads the full contact
// when opened (never folded into the board query), and runs the resolve-presence
// mutation. renders the presentational ContactDrawerPanel, or a skeleton while
// the detail loads. close clears the selection in the parent.
export function ContactDrawer({
  contactId,
  onClose,
}: {
  contactId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const open = contactId !== null;
  // the gold-pulse moment ... null when idle, the quote line when a win lands.
  const [celebrate, setCelebrate] = useState<string | null>(null);
  // reset any pending celebration the instant the drawer switches contact or
  // closes. the early-return below can unmount WinCelebration before its onDone
  // timer fires, so without this a stale quote would replay on the next open.
  // render-phase reset (the documented "adjust state on prop change" pattern),
  // not an effect ... avoids the set-state-in-effect rule + the extra frame.
  const [lastContactId, setLastContactId] = useState(contactId);
  if (contactId !== lastContactId) {
    setLastContactId(contactId);
    setCelebrate(null);
  }

  // esc closes ... matches the design-system drawer contract.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["contact-detail", contactId],
    queryFn: () => fetchContactDetail(contactId as string),
    enabled: open,
    staleTime: 30_000,
  });

  const resolve = useMutation({
    mutationFn: async () => {
      const r = await resolveFootprintAction({ contactId });
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSuccess: () => {
      toast.success("pulled their public presence.");
      void queryClient.invalidateQueries({
        queryKey: ["contact-detail", contactId],
      });
      // the resolve backfills name/title, so the board card may have changed.
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "couldn't pull that presence ... try again in a moment.",
      );
    },
  });

  const logWin = useMutation({
    mutationFn: async (input: { eventType: OutcomeType; dollarValue: number }) => {
      const r = await logOutcomeAction({
        contactId,
        eventType: input.eventType,
        dollarValue: input.dollarValue,
      });
      if (!r.ok) throw new Error(r.error);
      return input;
    },
    onSuccess: (input) => {
      // the win celebration ... in voice, no em-dash. the hero number lives in
      // the server-rendered (app) layout, so refresh to climb it now.
      toast.success(
        `that's the move ... $${Math.round(input.dollarValue).toLocaleString("en-US")} on the board.`,
      );
      setCelebrate(
        `$${Math.round(input.dollarValue).toLocaleString("en-US")} on the board.`,
      );
      router.refresh();
      void queryClient.invalidateQueries({
        queryKey: ["contact-detail", contactId],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "couldn't log that win ... give it another shot.",
      );
    },
  });

  if (!open) return null;

  if (isLoading || !detail) {
    return (
      <div className="fixed inset-0 z-50">
        <button
          type="button"
          aria-label="close panel"
          onClick={onClose}
          className="absolute inset-0 cursor-default bg-lunari-black/60"
        />
        <aside className="planetarium absolute right-0 top-0 flex h-full w-[360px] flex-col border-l border-lunari-surface-elevated bg-lunari-surface">
          <header className="flex items-center justify-between border-b border-lunari-surface-elevated px-5 py-4">
            <div className="h-4 w-32 animate-pulse rounded bg-lunari-surface-elevated" />
            <button
              type="button"
              onClick={onClose}
              aria-label="close"
              className="flex h-7 w-7 items-center justify-center rounded-md text-lunari-neutral-400 hover:bg-lunari-surface-elevated"
            >
              <X className="h-4 w-4 stroke-[1.25]" />
            </button>
          </header>
          <div className="space-y-3 px-5 py-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-4 animate-pulse rounded bg-lunari-surface-elevated"
                style={{ width: `${90 - i * 12}%` }}
              />
            ))}
          </div>
        </aside>
      </div>
    );
  }

  return (
    <>
      <ContactDrawerPanel
        detail={detail}
        resolving={resolve.isPending}
        logging={logWin.isPending}
        onResolveFootprint={() => resolve.mutate()}
        onLogWin={(input) => logWin.mutate(input)}
        onClose={onClose}
        draftHref={`/draft/${detail.id}`}
      />
      <WinCelebration
        show={celebrate !== null}
        quote={celebrate ?? undefined}
        onDone={() => setCelebrate(null)}
      />
    </>
  );
}
