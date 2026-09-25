import { Avatar } from "@/components/ui/avatar";
import type { SellerRow } from "@/lib/features/dashboard/domain/dashboard-metrics";
import { cn, formatCurrency } from "@/lib/utils";
import { Trophy } from "lucide-react";

const TROPHY = ["text-amber-500", "text-slate-400", "text-orange-700", "text-orange-700"];

/** "Quem mais vendeu" (print 8): cartão branco por vendedor, com as métricas em caixinhas. */
export function SellerRanking({
  rows,
  people,
}: {
  rows: SellerRow[];
  people: Map<string, { name: string; avatarUrl: string | null; role: string | null }>;
}) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma venda no período.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {rows.map((row, i) => {
        const person = people.get(row.id);
        const name = person?.name ?? "Responsável";
        return (
          <li
            key={row.id}
            className="grid grid-cols-[minmax(0,1fr)] items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-panel sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Trophy className={cn("h-4 w-4 shrink-0", TROPHY[Math.min(i, TROPHY.length - 1)])} aria-label={`${i + 1}º lugar`} />
              <Avatar name={name} src={person?.avatarUrl} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                {person?.role && <p className="truncate text-xs text-muted-foreground">{person.role}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <Metric>
                Vendas: <b className="text-success-text">{formatCurrency(row.wonValue)}</b>
                <br />
                Nº vendas: <b className="text-foreground">{row.wonCount}</b>
              </Metric>
              <Metric>
                Ticket: <b className="text-foreground">{formatCurrency(row.ticket)}</b>
                <br />
                Conversão: <b className="text-primary">{Math.round(row.conversion)}%</b>
              </Metric>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Metric({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-1.5 leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

/** "Motivos de perda" (print 8): lista numerada com barra proporcional. */
export function LossReasons({ rows }: { rows: { name: string; value: number }[] }) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma perda no período.</p>;
  }
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <ol className="space-y-2.5">
      {rows.map((row, i) => {
        const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;
        return (
          <li key={row.name} className="rounded-2xl bg-card px-4 py-3 shadow-panel">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-semibold text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{row.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                <b className="text-foreground">{row.value}</b> perdas · {pct}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-rose-500/80" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
