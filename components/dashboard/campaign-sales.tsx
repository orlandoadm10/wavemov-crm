import { VividHorizontalChart } from "@/components/crm/dashboard-charts";
import type { CampaignRow } from "@/lib/features/dashboard/domain/dashboard-metrics";
import { formatCurrency } from "@/lib/utils";

const MAX_ROWS = 10;

/** "De qual anúncio vêm as vendas" (print 9): tabela e, abaixo, o valor vendido por campanha. */
export function CampaignSales({ rows }: { rows: CampaignRow[] }) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sem negociações no período.</p>;
  }
  const top = rows.slice(0, MAX_ROWS);
  const chart = top.filter((r) => r.wonValue > 0).slice(0, 8).map((r) => ({ name: r.name, value: r.wonValue }));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              <th className="py-2 pr-4">Campanha</th>
              <th className="py-2 pr-4">Leads</th>
              <th className="py-2 pr-4">Vendas</th>
              <th className="py-2 pr-4">Perdas</th>
              <th className="py-2 pr-4">Conversão</th>
              <th className="py-2">Valor vendido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {top.map((row) => (
              <tr key={row.name}>
                <td className="max-w-80 truncate py-2 pr-4 text-foreground" title={row.name}>
                  {row.name}
                </td>
                <td className="py-2 pr-4 text-muted-foreground tabular-nums">{row.leads}</td>
                <td className="py-2 pr-4 font-semibold text-success-text tabular-nums">{row.won}</td>
                <td className="py-2 pr-4 text-muted-foreground tabular-nums">{row.lost}</td>
                <td className="py-2 pr-4 text-muted-foreground tabular-nums">{Math.round(row.conversion)}%</td>
                <td className="py-2 font-semibold text-foreground tabular-nums">{formatCurrency(row.wonValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > MAX_ROWS && (
        <p className="text-xs text-muted-foreground">
          Mostrando as {MAX_ROWS} origens que mais venderam de {rows.length}.
        </p>
      )}
      <VividHorizontalChart data={chart} currency />
    </div>
  );
}
