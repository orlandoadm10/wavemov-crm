// ============================================================
// Indicadores de atenção — regra pura, sem banco e sem React.
//
// Três números que respondem "o que está esperando por mim?": tarefas minhas
// vencidas, conversas aguardando resposta e leads que entraram nas últimas 24h.
//
// O QUE ESTE MÓDULO NÃO É
// Não é um feed de notificações e não guarda evento. Os três números são
// DERIVADOS do dado que já existe (`tasks.due_at`, `whatsapp_conversations.
// unread_count`, `deals.created_at`). Nenhuma linha nova é escrita em lugar
// nenhum, e por isso não existe estado de "lida" para divergir do real: um
// badge derivado nunca aponta para tarefa que já foi concluída.
//
// A tabela `notifications` foi deliberadamente adiada. Ela passa a valer
// quando entrar o e-mail — aí a linha vira o outbox que sobrevive ao provedor
// cair —, e não antes: depois da migração do Bubble, um fan-out por
// destinatário custaria ~27 mil linhas por dia para reexibir o que estes três
// números já mostram.
//
// A DOUTRINA, HERDADA DA SAÚDE DA ENTRADA DE LEADS
// Nenhum indicador tem botão de dispensar. Cada um zera pelo TRABALHO
// correspondente — concluir a tarefa, abrir a conversa, o lead envelhecer 24h.
// Aviso que se deixa fechar some no primeiro clique e nunca mais volta.
// ============================================================
import type { Role } from "@/types";

/**
 * Janela do indicador de leads novos.
 *
 * Fixa em 24h e sem marca de leitura por usuário: não há estado a persistir, e
 * o número não pode ser "dispensado". O rótulo é **"Novos (24h)"**, nunca
 * "não atendidos" — o dado prova chegada, não ausência de atendimento, e o
 * CRM ainda não registra primeiro contato.
 */
export const NEW_LEAD_WINDOW_HOURS = 24;

/**
 * Teto de linhas que a consulta de leads novos traz.
 *
 * A mesma consulta serve ao contador e ao toast (ela precisa dos títulos), por
 * isso é uma lista e não um `count`. O teto existe para que uma importação
 * acidental não puxe milhares de linhas para o layout de toda página; acima
 * dele o badge mostra `99+`, que é o mesmo que mostraria de qualquer forma.
 * Para dimensionar: a base inteira recebeu 53 leads em 30 dias.
 */
export const NEW_LEAD_FETCH_LIMIT = 100;

/** Acima disso o número deixa de ser informação e vira decoração. */
export const COUNT_CEILING = 99;

/**
 * `null` = NÃO SEI, e é diferente de zero.
 *
 * Zero é uma afirmação ("não há nada esperando por você"); quando a consulta
 * falha, o sistema não a sustenta. Badge some, nunca mostra "0". É a mesma
 * disciplina do estado `unknown` da saúde da entrada de leads, pelo mesmo
 * motivo: um indicador que mente com falso conforto é pior que indicador
 * nenhum.
 */
export interface AttentionCounts {
  /** Tarefas atribuídas a mim, pendentes, com prazo já vencido. */
  overdueTasks: number | null;
  /** Conversas aguardando resposta (não mensagens — ver `unreadMessages`). */
  unreadConversations: number | null;
  /**
   * Soma das mensagens não lidas dessas conversas.
   *
   * Existe só para a frase da pílula do Kanban ("3 conversas · 11 mensagens").
   * O badge nunca mostra este número: um lead que manda sete linhas seguidas
   * viraria "7", e a equipe aprenderia que o contador não significa esforço.
   */
  unreadMessages: number | null;
  /** Leads que entraram nas últimas 24h e são meus ou estão sem responsável. */
  newLeads: number | null;
}

export const ZERO_COUNTS: AttentionCounts = {
  overdueTasks: 0,
  unreadConversations: 0,
  unreadMessages: 0,
  newLeads: 0,
};

/** Para quem não vê indicador nenhum, e para falha total de leitura. */
export const UNKNOWN_COUNTS: AttentionCounts = {
  overdueTasks: null,
  unreadConversations: null,
  unreadMessages: null,
  newLeads: null,
};

/** Badge só existe com número maior que zero. `null` e `0` não desenham. */
export function showsBadge(value: number | null): value is number {
  return value !== null && value > 0;
}

/**
 * Quem vê os indicadores.
 *
 * `viewer` NÃO vê, e a razão é mecânica, não hierárquica: ele não conclui
 * tarefa e não zera `unread_count` — a escrita é barrada de propósito em
 * `whatsapp-client.tsx`, porque a policy a recusaria. Os contadores dele
 * seriam monotônicos: subiriam para sempre e nunca desceriam. Badge
 * permanentemente aceso é ruído puro e ensina a ignorar todos os badges,
 * inclusive os que importam.
 *
 * `viewer` continua vendo o banner de saúde da entrada de leads, que é estado
 * da empresa e não convocação para agir.
 */
export function seesAttention(role: Role, isGlobalAdmin: boolean): boolean {
  if (isGlobalAdmin) return true;
  return role !== "viewer";
}

/**
 * O recorte é sempre "meu", para TODOS os papéis — inclusive `org_admin`.
 *
 * A tentação é dar ao administrador a soma da empresa. É armadilha: esse
 * número depende de doze pessoas lerem as conversas delas, nunca chega a zero,
 * e em duas semanas ele para de olhar o badge. O total da organização é
 * métrica de gestão e já vive em `/atendimento` com filtro e nos relatórios.
 *
 * A fila **sem responsável** entra para todo mundo porque ela não é de
 * ninguém — e, se ficar invisível, ninguém a puxa. Para o administrador ela é
 * o sintoma de distribuição mal configurada, que `/relatorios/vendedores` já
 * trata como KPI.
 */
export interface AttentionScope {
  profileId: string;
  organizationId: string;
}

/** `47` → `"47"`, `132` → `"99+"`. Zero nunca desenha badge. */
export function formatCount(value: number): string {
  if (value > COUNT_CEILING) return `${COUNT_CEILING}+`;
  return String(Math.max(0, Math.trunc(value)));
}

/**
 * Vencida = prazo no passado e ainda pendente.
 *
 * Comparação de INSTANTE, não de data local: por isso não esbarra na dívida de
 * fuso das telas que ainda usam UTC. Tarefa sem prazo nunca vence — cobrar
 * prazo de quem não definiu um é inventar dívida.
 */
export function isTaskOverdue(
  task: { status: string; due_at: string | null },
  now: Date = new Date()
): boolean {
  if (task.status !== "pending" || !task.due_at) return false;
  const due = new Date(task.due_at);
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
}

/** Instante a partir do qual um lead conta como "novo". */
export function newLeadCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - NEW_LEAD_WINDOW_HOURS * 60 * 60 * 1000);
}

/**
 * Quais leads são novidade desde a última verificação — a lista que vira toast.
 *
 * `previous === null` significa PRIMEIRA leitura da aba, e devolve vazio de
 * propósito: abrir o CRM com sete leads das últimas 24h não é "chegaram
 * agora", é estado. Toast na montagem inicial seria uma rajada de avisos sobre
 * coisas que a pessoa já sabia.
 */
export function arrivedSince(
  previous: readonly string[] | null,
  current: readonly string[]
): string[] {
  if (previous === null) return [];
  const conhecidos = new Set(previous);
  return current.filter((id) => !conhecidos.has(id));
}

/** Rótulos. Ficam aqui para que a redação seja revisável junto da regra. */
export const ATTENTION_LABELS = {
  overdueTasks: (n: number) =>
    n === 1 ? "1 tarefa vencida" : `${formatCount(n)} tarefas vencidas`,
  unread: (conversas: number, mensagens: number) =>
    conversas === 1
      ? `1 conversa aguardando · ${formatCount(mensagens)} ${mensagens === 1 ? "mensagem" : "mensagens"}`
      : `${formatCount(conversas)} conversas aguardando · ${formatCount(mensagens)} mensagens`,
  unreadEmpty: "Atendimento em dia",
  newLeads: (n: number) => (n === 1 ? "1 lead novo (24h)" : `${formatCount(n)} leads novos (24h)`),
} as const;
