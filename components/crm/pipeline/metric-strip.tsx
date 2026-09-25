import type { PipelineMetrics } from "@/lib/features/deal-filters/domain/pipeline-metrics";
import { cn, formatCurrency } from "@/lib/utils";
import { Briefcase, CircleDollarSign, Percent, Receipt, Trophy, type LucideIcon } from "lucide-react";

/**
 * Faixa de indicadores do pipeline (print-melhorias-deals): cinco métricas
 * compactas, ícone num quadrado tingido e número em Space Grotesk. Só a de
 * ganhos recebe cor de destaque — o resto é neutro, para não competir.
 */
export function MetricStrip({ metrics }: { metrics: PipelineMetrics }) {
  const compact = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: metrics.pipelineValue >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 0,
  });
  const brl = (v: number) => (v >= 1_000_000 ? compact.format(v) : formatCurrency(v).replace(/,00$/, ""));

  const items: { icon: LucideIcon; value: string; label: string; tone: string }[] = [
    { icon: Briefcase, value: String(metrics.opportunities), label: "Oportunidades", tone: "bg-primary/10 text-primary" },
    { icon: CircleDollarSign, value: brl(metrics.pipelineValue), label: "Valor no pipeline", tone: "bg-primary/10 text-primary" },
    { icon: Receipt, value: brl(metrics.averageTicket), label: "Ticket médio", tone: "bg-primary/10 text-primary" },
    {
      icon: Percent,
      value: metrics.conversion === null ? "—" : `${metrics.conversion.toString().replace(".", ",")}%`,
      label: "Conversão do mês",
      tone: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    },
    {
      icon: Trophy,
      value: brl(metrics.wonValue),
      label: `Ganhas no mês · ${metrics.wonCount}`,
      tone: "bg-warning/15 text-warning-text",
    },
  ];

  return (
    <dl className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map(({ icon: Icon, value, label, tone }) => (
        <div key={label} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-panel">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)} aria-hidden>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <dd className="font-display truncate text-xl leading-tight font-bold text-foreground tabular-nums">{value}</dd>
            <dt className="truncate text-xs text-muted-foreground">{label}</dt>
          </div>
        </div>
      ))}
    </dl>
  );
}
