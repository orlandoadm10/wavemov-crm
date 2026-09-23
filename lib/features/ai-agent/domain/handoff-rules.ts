// ============================================================
// Quando a IA passa a conversa para um humano — regras puras, sem banco.
//
// Três gatilhos independentes (qualquer um basta), configuráveis por agente:
//   pedido   — o lead pede explicitamente para falar com uma pessoa;
//   jurídico — o lead cita Procon, advogado, processo, Reclame Aqui…;
//   incerteza— a RESPOSTA do agente se declara insegura.
// E dois que não dependem de texto, avaliados por quem chama:
//   etapa    — o lead está numa etapa marcada `requires_human`;
//   ferramenta — o próprio agente chamou `handoff_to_human`.
//
// Mudar uma regex aqui muda a taxa de transferência da empresa inteira:
// toque com teste (handoff-rules.test.mts). O `\b` do JavaScript só conhece
// ASCII: depois de "robô" ele não casa, por isso o fim de palavra acentuada
// usa `(?![\p{L}\p{N}])` com a flag `u`.
// ============================================================

export const HUMAN_REQUEST_REGEX =
  /\b(quero|preciso|posso|gostaria\s+de)\s+(falar|conversar)\s+(com\s+)?(um|uma|o|a)?\s*(atendente|humano|pessoa|gente|algu[eé]m|operador|vendedor|consultor|gerente|respons[aá]vel)\b|\b(atendente|humano|pessoa\s+de\s+verdade|operador)\s*,?\s*por\s+favor\b|\bsai\s+do\s+bot\b|\bn[aã]o\s+(quero|gosto)\s+(de\s+)?(falar\s+com\s+)?(rob[oô]|bot|m[aá]quina|autom[aá]tic\w*)(?![\p{L}\p{N}])|\b(voc[eê]|vc)\s+[eé]\s+(um\s+)?(rob[oô]|bot)(?![\p{L}\p{N}])/iu;

export const LEGAL_REGEX =
  /\b(procon|advogad\w*|processar|processo\s+judicial|justi[cç]a|juiz\w*|reclame\s*aqui|den[uú]ncia\w*|denunciar|[oó]rg[aã]o\s+regulador|defensoria|minist[eé]rio\s+p[uú]blico|danos\s+morais)\b/i;

export const UNCERTAINTY_MARKERS: readonly string[] = [
  "não tenho certeza",
  "não sei responder",
  "não posso confirmar",
  "não tenho essa informação",
  "preciso verificar com a equipe",
  "vou verificar com a equipe",
];

export type HandoffReason = "pedido_humano" | "assunto_juridico" | "incerteza" | "etapa_humana" | "agente_decidiu";

export const HANDOFF_REASON_LABEL: Record<HandoffReason, string> = {
  pedido_humano: "Lead pediu atendimento humano",
  assunto_juridico: "Assunto jurídico ou reclamação formal",
  incerteza: "Agente sem segurança para responder",
  etapa_humana: "Etapa do funil exige atendimento humano",
  agente_decidiu: "Agente transferiu a conversa",
};

export interface HandoffPolicy {
  handoffOnRequest: boolean;
  handoffOnLegal: boolean;
  handoffOnUncertainty: boolean;
}

/** Avalia a mensagem do LEAD antes de o agente responder. */
export function inboundHandoffReason(text: string, policy: HandoffPolicy): HandoffReason | null {
  if (!text) return null;
  if (policy.handoffOnRequest && HUMAN_REQUEST_REGEX.test(text)) return "pedido_humano";
  if (policy.handoffOnLegal && LEGAL_REGEX.test(text)) return "assunto_juridico";
  return null;
}

/** Avalia a RESPOSTA do agente antes de ela sair. */
export function replyHandoffReason(reply: string, policy: HandoffPolicy): HandoffReason | null {
  if (!reply || !policy.handoffOnUncertainty) return null;
  const lower = reply.toLowerCase();
  return UNCERTAINTY_MARKERS.some((m) => lower.includes(m)) ? "incerteza" : null;
}

export const DEFAULT_HANDOFF_MESSAGE =
  "Vou te passar para alguém da nossa equipe, que continua o atendimento por aqui em instantes. 🙂";
