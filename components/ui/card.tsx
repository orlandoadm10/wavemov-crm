import { TINT_STRIP, TINT_SURFACE, TINT_TEXT, TintStat, type Tint } from "./tinted";
import { cn } from "@/lib/utils";

export function Card({
  className,
  tint,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Painel de análise dos prints (6–11): fundo tingido, faixa colorida no
   * topo. Sem `tint`, o cartão branco do guia — o padrão para formulários e
   * configurações.
   */
  tint?: Tint;
}) {
  if (tint) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-2xl border bg-linear-to-br text-card-foreground shadow-panel",
          TINT_SURFACE[tint],
          className
        )}
        {...props}
      >
        <div className={cn("h-1", TINT_STRIP[tint])} />
        {children}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card text-card-foreground shadow-panel",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
  tint,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** Mesmo `tint` do `Card`: título na cor e sem a linha divisória. */
  tint?: Tint;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 px-5 py-4",
        tint ? "pb-1" : "border-b border-border",
        className
      )}
    >
      <div className="min-w-0">
        <h3 className={cn("font-sans text-sm font-semibold", tint ? TINT_TEXT[tint] : "text-foreground")}>{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Indicador (DESIGN_GUIDE; print 5): a superfície tingida do Dashboard, na cor
 * da métrica. Mantém a API antiga (`tone`) para as telas que já o usam.
 */
const TONE_TINT: Record<"blue" | "green" | "red" | "amber" | "slate", Tint> = {
  blue: "sky",
  green: "emerald",
  red: "rose",
  amber: "amber",
  slate: "violet",
};

export function StatCard({
  label,
  sublabel,
  value,
  hint,
  icon,
  tone = "blue",
  className,
}: {
  label: string;
  sublabel?: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "blue" | "green" | "red" | "amber" | "slate";
  className?: string;
}) {
  return (
    <TintStat
      tint={TONE_TINT[tone]}
      label={label}
      sublabel={sublabel}
      value={value}
      hint={hint}
      icon={icon}
      className={className}
    />
  );
}
