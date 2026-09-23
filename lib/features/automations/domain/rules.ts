// ============================================================
// Regras de automação — a parte pura: condições, variáveis de mensagem e o
// catálogo de gatilhos/ações que a tela oferece. Sem banco e sem framework.
// ============================================================

export type ConditionOp = "eq" | "neq" | "contains";

export interface RuleCondition {
  field: string;
  op: ConditionOp;
  value: string;
}

export const TRIGGER_LABELS = {
  "deal.created": "Lead criado",
  "deal.stage_changed": "Lead mudou de etapa",
  "deal.won": "Negociação ganha",
  "deal.lost": "Negociação perdida",
  "deal.assigned": "Responsável definido/alterado",
  "message.received": "Mensagem recebida no WhatsApp",
  "conversation.no_reply": "Follow-up: lead sem responder",
} as const;

export type TriggerEvent = keyof typeof TRIGGER_LABELS;

export const ACTION_LABELS = {
  send_whatsapp: "Enviar mensagem no WhatsApp",
  move_stage: "Mover para etapa",
  assign_owner: "Definir responsável",
  add_tag: "Aplicar tag",
  create_task: "Criar tarefa",
  add_note: "Registrar nota",
  set_temperature: "Definir temperatura",
  set_handling_mode: "Atendimento por IA ou humano",
  call_webhook: "Chamar webhook (n8n / sistema externo)",
} as const;

export type ActionType = keyof typeof ACTION_LABELS;

/** Campos que a tela oferece para condições; o motor aceita qualquer caminho. */
export const CONDITION_FIELDS: { field: string; label: string }[] = [
  { field: "deal.source", label: "Origem do lead" },
  { field: "deal.temperature", label: "Temperatura" },
  { field: "deal.title", label: "Título da negociação" },
  { field: "deal.tags", label: "Tags do lead" },
  { field: "stage.name", label: "Nome da etapa atual" },
  { field: "contact.city", label: "Cidade do contato" },
  { field: "contact.state", label: "UF do contato" },
  { field: "message.content", label: "Texto da mensagem recebida" },
  { field: "conversation.handling_mode", label: "Atendimento (ai / human)" },
];

export function resolveField(context: Record<string, unknown>, path: string): unknown {
  let current: unknown = context;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/**
 * Campo ausente torna a condição FALSA (só `neq` passa) — nunca erro, e nunca
 * um "verdadeiro por omissão" que dispararia WhatsApp para quem não devia.
 * Em lista (tags), `contains` é pertinência exata sem caixa/acento: "Google"
 * casa `google` e não casa `google ads`.
 */
export function conditionMatches(condition: RuleCondition, context: Record<string, unknown>): boolean {
  const raw = resolveField(context, condition.field);
  if (raw === undefined || raw === null || raw === "") return condition.op === "neq";
  const target = normalize(condition.value);
  if (condition.op === "contains") {
    if (Array.isArray(raw)) return raw.some((item) => normalize(String(item)) === target);
    return normalize(String(raw)).includes(target);
  }
  const equal = Array.isArray(raw)
    ? raw.some((item) => normalize(String(item)) === target)
    : normalize(String(raw)) === target;
  return condition.op === "eq" ? equal : !equal;
}

export function conditionsMatch(conditions: RuleCondition[], context: Record<string, unknown>): boolean {
  return conditions.every((c) => conditionMatches(c, context));
}

/**
 * Filtro próprio do gatilho: etapa e funil. `deal.stage_changed` com
 * `stage_id` só dispara quando o lead ENTRA naquela etapa.
 */
export function triggerConfigMatches(
  config: Record<string, unknown>,
  event: { payload: Record<string, unknown> }
): boolean {
  const stageId = typeof config.stage_id === "string" && config.stage_id ? config.stage_id : null;
  const pipelineId = typeof config.pipeline_id === "string" && config.pipeline_id ? config.pipeline_id : null;
  if (stageId && event.payload.stage_id !== stageId) return false;
  if (pipelineId && event.payload.pipeline_id !== pipelineId) return false;
  return true;
}

/**
 * Substitui {{contato.nome}}, {{contact.name}}, {{deal.title}}… pelo valor do
 * contexto. Variável desconhecida vira vazio — nunca o texto `{{...}}` cru
 * chegando no WhatsApp do cliente.
 */
const ALIASES: Record<string, string> = {
  "contato.nome": "contact.first_name",
  "contato.nome_completo": "contact.name",
  "contato.email": "contact.email",
  "contato.cidade": "contact.city",
  "lead.titulo": "deal.title",
  "lead.valor": "deal.value",
  "etapa.nome": "stage.name",
  "empresa.nome": "organization.name",
  "responsavel.nome": "responsible.first_name",
};

export function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
      const value = resolveField(context, ALIASES[key] ?? key);
      return value === undefined || value === null ? "" : String(value);
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
