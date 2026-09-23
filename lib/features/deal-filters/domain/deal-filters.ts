// ============================================================
// Ordenação e filtros de data do Kanban de negociações — o vocabulário.
//
// Os intervalos ("Hoje", "Mês anterior", personalizado) são resolvidos por
// `lib/utils/period.ts`, o módulo único de fuso do projeto. Aqui ficam só as
// opções, as chaves de URL e a contagem do painel.
// ============================================================
import type { DateRangeValue } from "@/lib/utils/period";

export const DEAL_SORTS = [
  { value: "az", label: "Alfabética A-Z" },
  { value: "za", label: "Alfabética Z-A" },
  { value: "contato_recente", label: "Contato mais recente" },
  { value: "contato_antigo", label: "Contato mais antigo" },
  { value: "modificacao", label: "Data modificação" },
] as const;

export type DealSort = (typeof DEAL_SORTS)[number]["value"];
export const DEFAULT_DEAL_SORT: DealSort = "contato_recente";

export function parseDealSort(value: string | null | undefined): DealSort {
  return DEAL_SORTS.some((s) => s.value === value) ? (value as DealSort) : DEFAULT_DEAL_SORT;
}

/**
 * Os quatro filtros do painel. `param` é a chave na URL; o campo real de cada
 * um está documentado na RPC `negociacoes_do_kanban` (0031).
 */
export const DEAL_DATE_FILTERS = [
  { key: "createdAt", param: "criacao", label: "Data de criação" },
  { key: "lastContactAt", param: "contato", label: "Data último contato" },
  { key: "nextTaskAt", param: "tarefa", label: "Data próxima tarefa" },
  { key: "closeDate", param: "fechamento", label: "Data de fechamento" },
] as const;

export type DealDateFilterKey = (typeof DEAL_DATE_FILTERS)[number]["key"];
export type DealDateFilters = Partial<Record<DealDateFilterKey, DateRangeValue>>;

export function countDealDateFilters(filters: DealDateFilters): number {
  return DEAL_DATE_FILTERS.filter((f) => filters[f.key]).length;
}
