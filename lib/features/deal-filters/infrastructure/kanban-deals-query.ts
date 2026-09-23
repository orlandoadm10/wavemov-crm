import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEAL_DATE_FILTERS,
  type DealDateFilters,
  type DealSort,
} from "@/lib/features/deal-filters/domain/deal-filters";
import { parseDateRange, resolveDateRange } from "@/lib/utils/period";
import type { Deal } from "@/types";

/** Teto do board: acima disso a tela avisa que mostra só os primeiros. */
export const KANBAN_LIMIT = 500;

const DEAL_EMBEDS =
  "*, contact:contacts(*), responsible:profiles!deals_responsible_id_fkey(*), " +
  "tag_assignments:deal_tag_assignments(deal_id,tag_id,organization_id,assigned_by,assigned_at,tag:deal_tags(*))";

// Ids por requisição: 100 UUIDs cabem com folga na URL do PostgREST.
const ID_CHUNK = 100;

export interface KanbanDealsQuery {
  organizationId: string;
  pipelineId: string | null;
  /** "open" | "won" | "lost" | "archived" | "todas" */
  status: string;
  responsibleId: string | null;
  tagId: string | null;
  search: string | null;
  sort: DealSort;
  dateFilters: DealDateFilters;
  now?: Date;
}

export interface KanbanDealsResult {
  deals: Deal[];
  /** Quantas negociações atendem aos filtros, antes do teto. */
  total: number;
  error: string | null;
}

/** Lê os filtros de data da URL; o que não for válido é descartado. */
export function readDealDateFilters(read: (param: string) => string | undefined): DealDateFilters {
  const filters: DealDateFilters = {};
  for (const field of DEAL_DATE_FILTERS) {
    const value = parseDateRange(read(field.param));
    if (value) filters[field.key] = value;
  }
  return filters;
}

/**
 * Negociações do Kanban já filtradas e ordenadas NO BANCO.
 *
 * Ordem lógica: organização → visibilidade do papel → funil/status/
 * responsável/tag → busca → filtros de data → ordenação → teto. A seleção e a
 * ordem saem da RPC `negociacoes_do_kanban` (0031); as linhas completas vêm
 * por PostgREST, sob a RLS, e são recolocadas na ordem da RPC.
 */
export async function loadKanbanDeals(
  supabase: SupabaseClient,
  query: KanbanDealsQuery
): Promise<KanbanDealsResult> {
  const now = query.now ?? new Date();
  const range = (key: keyof DealDateFilters) => {
    const value = query.dateFilters[key];
    return value ? resolveDateRange(value, now) : null;
  };
  const created = range("createdAt");
  const contact = range("lastContactAt");
  const task = range("nextTaskAt");
  const close = range("closeDate");

  const { data: ranked, error: rankError } = await supabase.rpc("negociacoes_do_kanban", {
    org_id: query.organizationId,
    funil_id: query.pipelineId,
    situacao: query.status,
    responsavel: query.responsibleId,
    tag: query.tagId,
    busca: query.search,
    ordem: query.sort,
    criado_de: created?.from.toISOString() ?? null,
    criado_ate: created?.to.toISOString() ?? null,
    contato_de: contact?.from.toISOString() ?? null,
    contato_ate: contact?.to.toISOString() ?? null,
    tarefa_de: task?.from.toISOString() ?? null,
    tarefa_ate: task?.to.toISOString() ?? null,
    // Coluna `date`: compara por dia civil, não por instante.
    fechamento_de: close?.fromDay ?? null,
    fechamento_ate: close?.toDay ?? null,
    limite: KANBAN_LIMIT,
  });
  if (rankError) {
    return { deals: [], total: 0, error: "Não foi possível carregar as negociações com estes filtros." };
  }

  const rows = (ranked ?? []) as { deal_id: string; total: number | string }[];
  if (rows.length === 0) return { deals: [], total: 0, error: null };

  const ids = rows.map((r) => r.deal_id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));

  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("deals")
        .select(DEAL_EMBEDS)
        .eq("organization_id", query.organizationId)
        .in("id", chunk)
    )
  );
  if (results.some((r) => r.error)) {
    return { deals: [], total: 0, error: "Não foi possível carregar as negociações." };
  }

  const byId = new Map<string, Deal>();
  for (const r of results) for (const deal of (r.data ?? []) as unknown as Deal[]) byId.set(deal.id, deal);
  // A ordem é a da RPC; um id que a RLS não devolveu simplesmente some.
  const deals = ids.map((id) => byId.get(id)).filter((d): d is Deal => Boolean(d));

  return { deals, total: Number(rows[0].total), error: null };
}
