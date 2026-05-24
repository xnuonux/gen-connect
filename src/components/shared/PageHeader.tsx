// the shared page header ... title, optional subtitle, optional right-side
// actions slot. every workspace tab leans on this.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-medium tracking-tight text-lunari-cream">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-lunari-neutral-400">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
