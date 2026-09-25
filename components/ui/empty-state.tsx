import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Dentro de um painel: sem borda tracejada, menos altura. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-8" : "rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14",
        className
      )}
    >
      <div className={cn("flex items-center justify-center rounded-2xl bg-secondary text-primary", compact ? "mb-3 h-10 w-10" : "mb-4 h-14 w-14")}>
        {icon}
      </div>
      <h3 className="font-sans text-sm font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-ink-faint">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
