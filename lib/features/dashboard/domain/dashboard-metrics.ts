/**
 * Números do Dashboard — sem Supabase, sem React.
 *
 * Tudo sai das negociações que a página já carrega; nada aqui consulta o
 * banco. Separado da página para ser testado e para que a tela só desenhe.
 */

/** O mínimo de uma negociação que os cálculos usam. */
export interface MetricDeal {
  status: "open" | "won" | "lost" | "archived";
  value: number | string;
  created_at: string;
  won_at: string | null;
  source: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  responsible_id: string | null;
  stage_id: string;
}

export interface SellerRow {
  id: string;
  wonCount: number;
  wonValue: number;
  ticket: number;
  leads: number;
  /** % das negociações do vendedor, criadas no período, que viraram venda. */
  conversion: number;
}

/**
 * Quem mais vendeu: só quem vendeu algo, pelo valor vendido.
 * A conversão é sobre as negociações do próprio vendedor no período.
 */
export function sellerRanking(deals: MetricDeal[]): SellerRow[] {
  const bySeller = new Map<string, SellerRow>();
  for (const d of deals) {
    if (!d.responsible_id) continue;
    const row = bySeller.get(d.responsible_id) ?? {
      id: d.responsible_id,
      wonCount: 0,
      wonValue: 0,
      ticket: 0,
      leads: 0,
      conversion: 0,
    };
    row.leads += 1;
    if (d.status === "won") {
      row.wonCount += 1;
      row.wonValue += Number(d.value) || 0;
    }
    bySeller.set(d.responsible_id, row);
  }
  return [...bySeller.values()]
    .filter((r) => r.wonCount > 0)
    .map((r) => ({
      ...r,
      ticket: r.wonValue / r.wonCount,
      conversion: r.leads > 0 ? (r.wonCount / r.leads) * 100 : 0,
    }))
    .sort((a, b) => b.wonValue - a.wonValue || b.wonCount - a.wonCount);
}

export const NO_CAMPAIGN = "Sem campanha (entrada manual)";

export interface CampaignRow {
  name: string;
  leads: number;
  won: number;
  lost: number;
  conversion: number;
  wonValue: number;
}

/** De qual anúncio vêm as vendas: campanha, senão origem UTM, senão origem. */
export function campaignStats(deals: MetricDeal[]): CampaignRow[] {
  const map = new Map<string, CampaignRow>();
  for (const d of deals) {
    const name = d.utm_campaign?.trim() || d.utm_source?.trim() || d.source?.trim() || NO_CAMPAIGN;
    const row = map.get(name) ?? { name, leads: 0, won: 0, lost: 0, conversion: 0, wonValue: 0 };
    row.leads += 1;
    if (d.status === "won") {
      row.won += 1;
      row.wonValue += Number(d.value) || 0;
    }
    if (d.status === "lost") row.lost += 1;
    map.set(name, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, conversion: r.leads > 0 ? (r.won / r.leads) * 100 : 0 }))
    .sort((a, b) => b.wonValue - a.wonValue || b.won - a.won || b.leads - a.leads);
}

export interface FunnelStage {
  id: string;
  name: string;
  color: string;
  order_index: number;
}

export interface FunnelRow {
  id: string;
  name: string;
  color: string;
  count: number;
  value: number;
  /** % em relação à etapa com mais negociações — é a largura da faixa. */
  share: number;
}

/** Negociações abertas por etapa, na ordem do funil (ganho e perda fora). */
export function stageFunnel(
  deals: MetricDeal[],
  stages: (FunnelStage & { is_won_stage?: boolean; is_lost_stage?: boolean })[]
): FunnelRow[] {
  const journey = stages
    .filter((s) => !s.is_won_stage && !s.is_lost_stage)
    .sort((a, b) => a.order_index - b.order_index);
  const rows = journey.map((s) => {
    const inStage = deals.filter((d) => d.status === "open" && d.stage_id === s.id);
    return {
      id: s.id,
      name: s.name,
      color: s.color,
      count: inStage.length,
      value: inStage.reduce((sum, d) => sum + (Number(d.value) || 0), 0),
      share: 0,
    };
  });
  const max = Math.max(0, ...rows.map((r) => r.count));
  return rows.map((r) => ({ ...r, share: max > 0 ? (r.count / max) * 100 : 0 }));
}

export interface MonthPoint {
  month: string;
  leads: number;
  sales: number;
  salesValue: number;
  /** % dos leads criados no mês que já viraram venda. */
  conversion: number;
}

/**
 * Séries mês a mês. `months` vem pronto (chave `yyyy-MM` e rótulo), porque
 * formatar data em pt-BR é assunto da página, não do cálculo.
 */
export function monthlySeries(deals: MetricDeal[], months: { key: string; label: string }[]): MonthPoint[] {
  const monthOf = (iso: string) => iso.slice(0, 7);
  return months.map(({ key, label }) => {
    const created = deals.filter((d) => monthOf(d.created_at) === key);
    const sold = deals.filter((d) => d.status === "won" && d.won_at && monthOf(d.won_at) === key);
    const createdWon = created.filter((d) => d.status === "won").length;
    return {
      month: label,
      leads: created.length,
      sales: sold.length,
      salesValue: sold.reduce((sum, d) => sum + (Number(d.value) || 0), 0),
      conversion: created.length > 0 ? Math.round((createdWon / created.length) * 1000) / 10 : 0,
    };
  });
}
