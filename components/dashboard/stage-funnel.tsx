import type { FunnelRow } from "@/lib/features/dashboard/domain/dashboard-metrics";
import { formatCurrency } from "@/lib/utils";
import { textOnColor } from "@/lib/utils/color";

/**
 * Funil por etapa (print 7): uma faixa em trapézio por etapa, na cor dela,
 * com largura proporcional à etapa com mais negociações abertas.
 */
export function StageFunnel({ rows }: { rows: FunnelRow[] }) {
  if (rows.length === 0 || rows.every((r) => r.count === 0)) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sem negociações abertas no período.</p>;
  }
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <ol className="space-y-1.5">
      {rows.map((row) => {
        // Nunca some: uma etapa vazia ainda precisa de espaço para o nome.
        const width = Math.max(row.share, 36);
        return (
          <li key={row.id} className="flex flex-col items-center">
            <div
              className="flex h-9 min-w-60 items-center justify-between gap-3 px-6 text-xs font-semibold sm:text-sm"
              style={{
                width: `${width}%`,
                background: row.color || "var(--primary)",
                color: textOnColor(row.color),
                clipPath: "polygon(0 0, 100% 0, calc(100% - 14px) 100%, 14px 100%)",
              }}
            >
              <span className="truncate">{row.name}</span>
              <span className="shrink-0 tabular-nums">
                {row.count} leads / {total > 0 ? Math.round((row.count / total) * 100) : 0}%
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
              {formatCurrency(row.value)} nesta etapa
            </p>
          </li>
        );
      })}
    </ol>
  );
}
