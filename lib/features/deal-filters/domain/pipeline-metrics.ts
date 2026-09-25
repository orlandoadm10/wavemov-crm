/**
 * Números da faixa de indicadores do pipeline — sem Supabase, sem React.
 *
 * Dois recortes, de propósito:
 * - "no quadro" (oportunidades, valor, ticket) sai das negociações que a tela
 *   está mostrando, então acompanha os filtros;
 * - "do mês" (ganhas, conversão) sai do funil ativo no mês corrente, porque
 *   venda e conversão só fazem sentido num período.
 */
export interface MetricDealRow {
  status: "open" | "won" | "lost" | "archived";
  value: number | string;
  created_at: string;
  won_at: string | null;
}

export interface PipelineMetrics {
  opportunities: number;
  pipelineValue: number;
  averageTicket: number;
  wonCount: number;
  wonValue: number;
  /** % das negociações criadas no mês que já viraram venda; null sem base. */
  conversion: number | null;
}

const money = (v: number | string) => Number(v) || 0;

export function pipelineMetrics(
  boardDeals: Pick<MetricDealRow, "value">[],
  monthDeals: MetricDealRow[],
  monthStart: Date
): PipelineMetrics {
  const pipelineValue = boardDeals.reduce((sum, d) => sum + money(d.value), 0);
  const since = monthStart.getTime();
  const wonInMonth = monthDeals.filter(
    (d) => d.status === "won" && d.won_at && new Date(d.won_at).getTime() >= since
  );
  const createdInMonth = monthDeals.filter((d) => new Date(d.created_at).getTime() >= since);
  const createdAndWon = createdInMonth.filter((d) => d.status === "won").length;

  return {
    opportunities: boardDeals.length,
    pipelineValue,
    averageTicket: boardDeals.length > 0 ? pipelineValue / boardDeals.length : 0,
    wonCount: wonInMonth.length,
    wonValue: wonInMonth.reduce((sum, d) => sum + money(d.value), 0),
    conversion: createdInMonth.length > 0 ? Math.round((createdAndWon / createdInMonth.length) * 1000) / 10 : null,
  };
}
