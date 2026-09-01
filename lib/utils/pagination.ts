// ============================================================
// Paginação — regra pura, compartilhada por todas as listas.
//
// Nasceu em `lib/features/contacts/domain/contact-search.ts` e foi promovida
// ao ganhar o segundo consumidor (a carteira de leads). Nada aqui é específico
// de contatos: é aritmética de intervalo.
//
// Quantos itens por página continua sendo decisão de CADA tela — por isso
// `perPage` é parâmetro e não constante deste módulo.
// ============================================================

/** Padrão do projeto. Uma tela só diverge disso com motivo escrito. */
export const DEFAULT_PER_PAGE = 25;

export interface Pagination {
  /** Página atual, começando em 1. */
  page: number;
  /** Índice inicial para o `.range()` do PostgREST. */
  from: number;
  /** Índice final, inclusivo. */
  to: number;
}

/**
 * Página pedida (texto da URL) → intervalo do `.range()`.
 *
 * Página inválida, zero ou negativa vira 1: a URL é editável à mão e
 * compartilhada por link, e derrubar a tela por causa de um parâmetro torto é
 * pior que ignorá-lo. Não há teto superior — pedir a página 900 de uma lista de
 * 3 devolve vazio, e a tela mostra o estado vazio com o caminho de volta.
 */
export function resolvePagination(
  value: string | undefined | null,
  perPage: number = DEFAULT_PER_PAGE
): Pagination {
  const pedida = Number(value);
  const page = Number.isFinite(pedida) && pedida >= 1 ? Math.floor(pedida) : 1;
  const from = (page - 1) * perPage;
  return { page, from, to: from + perPage - 1 };
}

/** Total de páginas. Zero linhas ainda é uma página — senão a tela diz "1 de 0". */
export function totalPages(total: number, perPage: number = DEFAULT_PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage));
}
