import { cn } from "@/lib/utils";

/**
 * Superfícies tingidas do Dashboard (prints 5–11): cada métrica e cada painel
 * na própria cor — fundo em degradê claro, borda da cor, rótulo colorido. As
 * variantes `dark:` escurecem o fundo em vez de estourar o tom claro.
 */
export type Tint = "sky" | "emerald" | "rose" | "violet" | "amber" | "orange" | "cyan" | "blue" | "fuchsia";

const SURFACE: Record<Tint, string> = {
  sky: "border-sky-300/60 from-sky-50 to-sky-100/70 dark:border-sky-400/25 dark:from-sky-400/12 dark:to-sky-400/5",
  emerald: "border-emerald-300/60 from-emerald-50 to-teal-100/60 dark:border-emerald-400/25 dark:from-emerald-400/12 dark:to-emerald-400/5",
  rose: "border-rose-300/60 from-rose-50 to-pink-100/60 dark:border-rose-400/25 dark:from-rose-400/12 dark:to-rose-400/5",
  violet: "border-violet-300/60 from-violet-50 to-indigo-100/60 dark:border-violet-400/25 dark:from-violet-400/12 dark:to-violet-400/5",
  amber: "border-amber-300/70 from-amber-50 to-orange-50 dark:border-amber-400/25 dark:from-amber-400/12 dark:to-amber-400/5",
  orange: "border-orange-300/60 from-orange-50 to-amber-50 dark:border-orange-400/25 dark:from-orange-400/12 dark:to-orange-400/5",
  cyan: "border-cyan-300/60 from-cyan-50 to-sky-100/60 dark:border-cyan-400/25 dark:from-cyan-400/12 dark:to-cyan-400/5",
  blue: "border-blue-300/60 from-blue-50 to-indigo-100/50 dark:border-blue-400/25 dark:from-blue-400/12 dark:to-blue-400/5",
  fuchsia: "border-fuchsia-300/60 from-fuchsia-50 to-violet-100/60 dark:border-fuchsia-400/25 dark:from-fuchsia-400/12 dark:to-fuchsia-400/5",
};

export const TINT_TEXT: Record<Tint, string> = {
  sky: "text-sky-700 dark:text-sky-300",
  emerald: "text-emerald-700 dark:text-emerald-300",
  rose: "text-rose-700 dark:text-rose-300",
  violet: "text-violet-700 dark:text-violet-300",
  amber: "text-amber-700 dark:text-amber-300",
  orange: "text-orange-700 dark:text-orange-300",
  cyan: "text-cyan-700 dark:text-cyan-300",
  blue: "text-blue-700 dark:text-blue-300",
  fuchsia: "text-fuchsia-700 dark:text-fuchsia-300",
};

const ICON: Record<Tint, string> = {
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
  orange: "bg-orange-100 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300",
  cyan: "bg-cyan-100 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-300",
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300",
  fuchsia: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-400/15 dark:text-fuchsia-300",
};

const STRIP: Record<Tint, string> = {
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  cyan: "bg-cyan-500",
  blue: "bg-blue-600",
  fuchsia: "bg-fuchsia-500",
};

/** Indicador do topo (print 5): rótulo em caixa alta, ícone num círculo, número grande. */
export function TintStat({
  tint,
  label,
  value,
  hint,
  icon,
}: {
  tint: Tint;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border bg-linear-to-br p-4 shadow-panel", SURFACE[tint])}>
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-[11px] font-semibold tracking-wide uppercase", TINT_TEXT[tint])}>{label}</p>
        <span
          aria-hidden
          className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full [&_svg]:h-3.5 [&_svg]:w-3.5", ICON[tint])}
        >
          {icon}
        </span>
      </div>
      <p className="font-display mt-2 text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Painel de seção (prints 6–11): faixa colorida no topo, título na cor. */
export function TintPanel({
  tint,
  title,
  icon,
  action,
  className,
  children,
}: {
  tint: Tint;
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border bg-linear-to-br shadow-panel", SURFACE[tint], className)}>
      <div className={cn("h-1", STRIP[tint])} />
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <h2 className={cn("flex items-center gap-2 font-sans text-sm font-semibold", TINT_TEXT[tint])}>
          {icon && <span className="[&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
          {title}
        </h2>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
