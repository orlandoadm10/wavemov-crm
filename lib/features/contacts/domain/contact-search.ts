// ============================================================
// Busca de contatos — montagem do filtro, pura e testável.
//
// A busca da tela de contatos era feita no CLIENTE, sobre o array que o
// servidor já havia truncado em `limit(1000)`. O contato na posição 1200
// simplesmente não existia para ela, e a tela afirmava "Nenhum contato
// encontrado" com convicção. Com ~300 empresas chegando do Bubble, isso deixa
// de ser hipótese.
//
// Agora o filtro é montado aqui e vai para o PostgREST. Como ele é texto
// interpolado numa gramática (`or=(a.ilike.%x%,b.ilike.%x%)`), o termo digitado
// precisa ser saneado — daí este módulo existir separado e ter teste.
// ============================================================

/** Colunas que a busca varre. Ordem = prioridade de leitura, não de índice. */
export const CONTACT_SEARCH_COLUMNS = ["name", "email", "phone", "whatsapp_phone"] as const;

/**
 * Remove o que quebraria a gramática do filtro ou transformaria a busca em
 * "traga tudo".
 *
 * - `,` `(` `)` são separadores do `or=()` do PostgREST: um termo com vírgula
 *   viraria dois filtros, e um parêntese quebraria a expressão inteira;
 * - `%` e `_` são curingas do `ilike`: quem digita `%` esperando um literal
 *   receberia a base inteira, e não é isso que a pessoa pediu;
 * - `\` escaparia o caractere seguinte;
 * - `*` é o curinga do PostgREST em `like`/`ilike`, equivalente a `%`.
 *
 * Saneamento por remoção, e não por escape, de propósito: escapar exigiria
 * acertar duas gramáticas encadeadas (a do PostgREST e a do `ilike`), e errar
 * numa delas é o tipo de bug que só aparece com o dado de alguém.
 */
export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()%_\\*]/g, " ").trim().replace(/\s+/g, " ");
}

/**
 * O valor do parâmetro `or` do PostgREST, ou `null` quando não há o que filtrar.
 *
 * `null` significa "não aplique filtro nenhum" — diferente de um filtro que não
 * casa com nada. Busca só com caracteres removidos (`"%%%"`) cai aqui: devolver
 * a lista completa é mais honesto que devolver vazio, porque a pessoa não
 * chegou a expressar um termo.
 */
export function buildContactSearchFilter(raw: string | undefined | null): string | null {
  const termo = sanitizeSearchTerm(raw ?? "");
  if (!termo) return null;
  return CONTACT_SEARCH_COLUMNS.map((coluna) => `${coluna}.ilike.%${termo}%`).join(",");
}

/** Status de negociação aceitos no filtro da tela. */
export const CONTACT_DEAL_STATUSES = ["open", "won", "lost"] as const;
export type ContactDealStatus = (typeof CONTACT_DEAL_STATUSES)[number];

/**
 * `status` vem da URL, então pode ser qualquer coisa. Valor inválido vira
 * `null` (sem filtro) em vez de erro: a URL é editável à mão e compartilhada
 * por link, e derrubar a tela por causa de um parâmetro torto é pior que
 * ignorá-lo.
 */
export function parseDealStatus(value: string | undefined | null): ContactDealStatus | null {
  return CONTACT_DEAL_STATUSES.includes(value as ContactDealStatus)
    ? (value as ContactDealStatus)
    : null;
}

/** Quantos contatos por página. */
export const CONTACTS_PER_PAGE = 25;

export interface Pagination {
  /** Página atual, começando em 1. */
  page: number;
  /** Índice inicial para o `.range()` do PostgREST. */
  from: number;
  /** Índice final, inclusivo. */
  to: number;
}

/**
 * Página pedida → intervalo do `.range()`.
 *
 * Página inválida, zero ou negativa vira 1 pelo mesmo motivo do `status`: a URL
 * é editável. Não há teto superior aqui — pedir a página 900 de uma lista de 3
 * devolve vazio, e a tela mostra o estado vazio com o caminho de volta.
 */
export function resolvePagination(
  value: string | undefined | null,
  perPage: number = CONTACTS_PER_PAGE
): Pagination {
  const pedida = Number(value);
  const page = Number.isFinite(pedida) && pedida >= 1 ? Math.floor(pedida) : 1;
  const from = (page - 1) * perPage;
  return { page, from, to: from + perPage - 1 };
}

/** Total de páginas para um total de linhas. Zero linhas ainda é uma página. */
export function totalPages(total: number, perPage: number = CONTACTS_PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage));
}
