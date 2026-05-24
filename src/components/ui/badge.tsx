import { cn } from "@/lib/utils/cn";

// a small mono count pill ... used on kanban column headers.
export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5",
        "bg-lunari-surface-elevated font-mono text-[10px] tabular-nums text-lunari-neutral-400",
        className,
      )}
    >
      {children}
    </span>
  );
}
