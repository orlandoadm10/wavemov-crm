import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricDealRow } from "@/lib/features/deal-filters/domain/pipeline-metrics";
import { zonedInstant, zonedParts } from "@/lib/utils/period";

/** Primeiro instante do mês corrente no fuso do negócio. */
export function currentMonthStart(now: Date = new Date()): Date {
  const [year, month] = zonedParts(now);
  return zonedInstant(year, month, 1);
}

/**
 * Negociações do funil que entraram OU foram vendidas no mês — o bastante
 * para "ganhas no mês" e "conversão do mês". Sob a RLS do chamador: o vendedor
 * vê os próprios números, como no resto da tela. Falha vira lista vazia (a
 * faixa mostra "—"), nunca erro de página.
 */
export async function loadPipelineMonthDeals(
  supabase: SupabaseClient,
  organizationId: string,
  pipelineId: string | null,
  monthStart: Date
): Promise<MetricDealRow[]> {
  if (!pipelineId) return [];
  const since = monthStart.toISOString();
  const { data, error } = await supabase
    .from("deals")
    .select("status, value, created_at, won_at")
    .eq("organization_id", organizationId)
    .eq("pipeline_id", pipelineId)
    .or(`created_at.gte.${since},won_at.gte.${since}`)
    .limit(5000);
  if (error) {
    console.error("[pipeline-metrics] falha ao ler as negociações do mês", error);
    return [];
  }
  return (data ?? []) as MetricDealRow[];
}
