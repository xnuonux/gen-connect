"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { ContactDrawerPanel } from "@/components/shared/ContactDrawerPanel";
import { fetchContactDetail } from "@/app/actions/contacts";
import { resolveFootprintAction } from "@/app/actions/footprint";

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
  const open = contactId !== null;

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
    <ContactDrawerPanel
      detail={detail}
      resolving={resolve.isPending}
      onResolveFootprint={() => resolve.mutate()}
      onClose={onClose}
      draftHref={`/draft/${detail.id}`}
    />
  );
}
