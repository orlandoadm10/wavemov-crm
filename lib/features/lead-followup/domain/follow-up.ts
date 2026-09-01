// ============================================================
// Carteira de leads — a regra de "tratativa", pura e sem banco.
//
// A pergunta que esta tela responde é do administrador: **quem está esperando
// por nós?**. Tudo depende de uma definição, e ela é contraintuitiva.
//
// ------------------------------------------------------------
// O QUE NÃO É TRATATIVA — e por que isso quase inverteu o relatório
//
// 86% dos `activity_logs` da produção são `whatsapp_inbound`: o LEAD
// escrevendo, não a equipe trabalhando. Se "última interação" contasse isso, o
// lead que manda mensagem todo dia e nunca recebe resposta apareceria como o
// mais bem atendido da carteira — exatamente o que o administrador precisava
// ver, escondido pela própria métrica.
//
// ------------------------------------------------------------
// A ARMADILHA MAIOR: A EQUIPE RESPONDE PELO CELULAR
//
// Medido em 31/08/2026: `whatsapp_messages` tinha **466 mensagens enviadas** e
// `activity_logs` tinha **4** do tipo `whatsapp_outbound`. Apenas 5 envios
// saíram de dentro do CRM (`sent_by` preenchido).
//
// O webhook só grava `activity_logs` quando `!msg.fromMe`
// (`app/api/webhooks/uazapi/route.ts`), então **461 das 466 respostas são
// invisíveis para `activity_logs`**. Um relatório de tratativa construído só
// sobre aquela tabela acusaria a equipe de abandonar praticamente toda a
// carteira — enquanto ela respondia.
//
// Por isso a RPC `carteira_sem_tratativa` (migration `0025`) une DUAS fontes:
// os tipos de trabalho da equipe em `activity_logs` **e**
// `whatsapp_messages.direction = 'outbound'`. A lista de tipos vive no SQL, em
// um lugar só; este módulo não a duplica — duplicar a definição garantiria que
// as duas cópias divergissem.
//
// ------------------------------------------------------------
// O QUE ESTE MÓDULO DECIDE
// Dado "quando a equipe tratou" e "quando o lead falou", qual é a SITUAÇÃO do
// lead e há quanto tempo ele está parado. É o que a tela desenha, e é testável
// sem banco.
// ============================================================

/** Limiares em dias corridos. Fixos, e o rótulo da tela diz "corridos". */
export const ATRASO_ATENCAO_DIAS = 3;
export const ATRASO_CRITICO_DIAS = 7;

const DIA_MS = 24 * 60 * 60 * 1000;

export type Situacao =
  /** Nunca houve tratativa da equipe. O relógio corre desde a criação. */
  | "nunca_tratado"
  /** O lead falou DEPOIS da última tratativa — alguém está esperando agora. */
  | "aguardando_resposta"
  /** A equipe falou por último e o lead não voltou. */
  | "sem_retorno"
  /** Tratado dentro do limiar de atenção. */
  | "em_dia";

export interface LeadFollowUp {
  /** Última tratativa da equipe (activity_logs de equipe ∪ outbound). */
  equipeTratouEm: string | Date | null;
  /** Última mensagem recebida do lead. */
  leadFalouEm: string | Date | null;
  /** Quando a negociação entrou — o relógio de quem nunca foi tratado. */
  criadoEm: string | Date;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Desde quando o lead está sem tratativa.
 *
 * Nunca tratado conta desde a CRIAÇÃO, não desde "sempre". É a diferença entre
 * um lead que entrou há cinco minutos e ainda não foi tocado — o que é normal —
 * e um que entrou há trinta dias e nunca foi. Ordenar "nunca tratado" como
 * infinito jogaria o primeiro para o topo da carteira todo dia.
 */
export function paradoDesde(lead: LeadFollowUp): Date {
  return toDate(lead.equipeTratouEm) ?? toDate(lead.criadoEm) ?? new Date();
}

/** Dias corridos desde a última tratativa. Nunca negativo. */
export function diasParado(lead: LeadFollowUp, agora: Date = new Date()): number {
  const desde = paradoDesde(lead);
  return Math.max(0, Math.floor((agora.getTime() - desde.getTime()) / DIA_MS));
}

/**
 * A situação do lead.
 *
 * A ordem dos testes é a ordem da gravidade, e `aguardando_resposta` vem antes
 * de qualquer avaliação de prazo de propósito: o lead falou e ninguém
 * respondeu é pior que silêncio mútuo, mesmo que faça poucas horas. É o único
 * estado em que existe uma pessoa esperando do outro lado agora.
 */
export function situacao(lead: LeadFollowUp, agora: Date = new Date()): Situacao {
  const tratou = toDate(lead.equipeTratouEm);
  const falou = toDate(lead.leadFalouEm);

  if (!tratou) return "nunca_tratado";
  if (falou && falou.getTime() > tratou.getTime()) return "aguardando_resposta";
  return diasParado(lead, agora) >= ATRASO_ATENCAO_DIAS ? "sem_retorno" : "em_dia";
}

export type Tom = "green" | "amber" | "red" | "slate";

/** Tom do badge de situação. Cor nunca é o único sinal — o texto acompanha. */
export const SITUACAO_TOM: Record<Situacao, Tom> = {
  nunca_tratado: "red",
  aguardando_resposta: "red",
  sem_retorno: "amber",
  em_dia: "green",
};

export const SITUACAO_LABEL: Record<Situacao, string> = {
  nunca_tratado: "Nunca tratado",
  aguardando_resposta: "Aguardando resposta",
  sem_retorno: "Sem retorno",
  em_dia: "Em dia",
};

/** Tom do tempo parado. Abaixo do limiar de atenção não grita. */
export function tomDoAtraso(dias: number): Tom {
  if (dias >= ATRASO_CRITICO_DIAS) return "red";
  if (dias >= ATRASO_ATENCAO_DIAS) return "amber";
  return "slate";
}

/** "hoje", "1 dia", "12 dias". Arredonda para baixo — nunca exagera o atraso. */
export function formatarAtraso(dias: number): string {
  if (dias <= 0) return "hoje";
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/**
 * Rótulo do tipo da última tratativa.
 *
 * Existe porque `stage_changed` conta como tratativa — e arrastar vinte cards
 * numa arrumação de segunda-feira "trata" vinte leads sem ninguém ter falado
 * com ninguém. Excluir seria trocar uma mentira por outra; mostrar o tipo na
 * célula deixa o administrador tirar a própria conclusão. Métrica que se
 * explica na linha não precisa de nota de rodapé.
 */
export const TRATATIVA_LABEL: Record<string, string> = {
  whatsapp_outbound: "Mensagem enviada",
  note: "Nota",
  task_created: "Tarefa criada",
  task_done: "Tarefa concluída",
  stage_changed: "Etapa alterada",
  responsible_changed: "Responsável alterado",
  lead_info_updated: "Informações atualizadas",
  deal_won: "Marcada como ganha",
  deal_lost: "Marcada como perdida",
  deal_archived: "Arquivada",
};

export function rotularTratativa(tipo: string | null): string {
  if (!tipo) return "—";
  return TRATATIVA_LABEL[tipo] ?? tipo;
}

export const ORDENS = ["parados", "recentes"] as const;
export type Ordem = (typeof ORDENS)[number];

/**
 * `parados` (padrão) responde "quem está esperando"; `recentes` responde
 * "quem chegou agora" — é a mesma tabela servindo às duas perguntas, e foi o
 * que evitou uma terceira lista de leads no produto.
 *
 * Valor inválido cai no padrão em silêncio: a URL é editável à mão.
 */
export function parseOrdem(value: string | undefined | null): Ordem {
  return ORDENS.includes(value as Ordem) ? (value as Ordem) : "parados";
}

export const JANELAS = ["todos", "3d", "7d", "nunca"] as const;
export type Janela = (typeof JANELAS)[number];

export function parseJanela(value: string | undefined | null): Janela {
  return JANELAS.includes(value as Janela) ? (value as Janela) : "todos";
}

export const JANELA_LABEL: Record<Janela, string> = {
  todos: "Todos os leads abertos",
  "3d": "Parados há 3+ dias",
  "7d": "Parados há 7+ dias",
  nunca: "Nunca tratados",
};

/** Dias mínimos que a janela exige, ou `null` quando ela não filtra por tempo. */
export function janelaEmDias(janela: Janela): number | null {
  if (janela === "3d") return ATRASO_ATENCAO_DIAS;
  if (janela === "7d") return ATRASO_CRITICO_DIAS;
  return null;
}
