/**
 * Ligação entre os campos que a origem manda e os campos do formulário de
 * destino — sem Supabase, sem Next, sem rede.
 *
 * Quem configura a fonte não é técnico. Por isso a regra é: tudo funciona sem
 * mapear nada. A sugestão automática reconhece nome, e-mail e telefone pelas
 * grafias comuns em português e inglês (e pelo formato do valor); o
 * mapeamento salvo na tela só existe para corrigir a sugestão quando ela
 * errar. E nada se perde: o que não vai para um campo do formulário entra nas
 * informações do lead, que o atendente lê.
 */
import type { InboundField } from "./inbound-payload";

/**
 * Chave em que o card do lead lê o bloco de respostas: é o
 * `DEFAULT_ANSWERS_KEY` de `lead-ingestion/domain/lead-answers.ts`. Repetida
 * aqui só porque este módulo roda no `node --test` sem resolver o alias `@/`;
 * `field-mapping.test.mts` prende os dois valores juntos.
 */
export const ANSWERS_KEY = "respostas";

/** O mínimo que a ligação precisa saber de um campo do formulário. */
export interface TargetField {
  field_key: string;
  label: string;
  field_type: string;
}

/**
 * Mapeamento salvo: chave recebida → `field_key` do formulário. String vazia
 * é decisão explícita de "não ligar" (vai só para as informações do lead).
 * Chave ausente = sugestão automática.
 */
export type FieldMapping = Record<string, string>;

export interface MappedSubmission {
  /** Vai para `sanitizeSubmission`: só chaves do formulário. */
  data: Record<string, string>;
  /** Vai para `form_submissions.metadata`: o resto, para leitura humana. */
  metadata: Record<string, string>;
}

type Identity = "name" | "email" | "phone";

/** minúsculas, sem acento, só letras e números separados por espaço. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter(Boolean));
}

const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_VALUE = /^\+?[\d\s().-]{10,20}$/;

const PHONE_WORDS = ["telefone", "phone", "whatsapp", "whats", "celular", "fone", "tel", "zap", "mobile"];
const NAME_WORDS = ["nome", "name"];
/**
 * "Nome da empresa", `campaign_name`, `form_name`, `ad_name`: têm "nome" e
 * não são o nome do lead. É o engano mais caro da sugestão — o card do lead
 * nasceria com o nome da campanha.
 */
const NOT_PERSON_WORDS = [
  "empresa", "company", "campanha", "campaign", "form", "formulario", "ad", "adset",
  "anuncio", "conjunto", "page", "pagina", "utm", "produto", "product", "plano", "negocio",
  "fantasia", "social", "razao", "last", "sobrenome", "usuario", "user",
];

/** Qual dado do lead este campo recebido parece ser, se algum. */
export function guessIdentity(field: InboundField): Identity | null {
  const tokens = new Set([...words(field.key), ...words(field.label)]);
  const has = (list: string[]) => list.some((w) => tokens.has(w));
  const value = field.value.trim();

  if (tokens.has("email") || tokens.has("mail") || (EMAIL_VALUE.test(value) && !has(NAME_WORDS))) {
    return EMAIL_VALUE.test(value) ? "email" : null;
  }
  if (has(PHONE_WORDS) && PHONE_VALUE.test(value)) return "phone";
  if (has(NAME_WORDS) && !has(NOT_PERSON_WORDS) && !EMAIL_VALUE.test(value)) return "name";
  return null;
}

/** `field_key` do formulário que recebe cada dado do lead, se existir. */
function identityTargets(targets: TargetField[]): Record<Identity, string | null> {
  const byKey = (keys: string[]) => targets.find((t) => keys.includes(t.field_key))?.field_key ?? null;
  return {
    name: byKey(["name", "nome"]),
    email: byKey(["email"]) ?? targets.find((t) => t.field_type === "email")?.field_key ?? null,
    phone: byKey(["phone", "telefone", "whatsapp"]) ?? targets.find((t) => t.field_type === "phone")?.field_key ?? null,
  };
}

/**
 * Sugestão para UM campo recebido, sem olhar os outros.
 *
 * Primeiro o casamento exato (chave ou rótulo iguais aos de um campo do
 * formulário — é o caso do n8n e de quem nomeou os campos pensando no CRM);
 * depois o palpite de identidade.
 */
export function suggestTarget(field: InboundField, targets: TargetField[]): string | null {
  const key = normalize(field.key);
  const label = normalize(field.label);
  const exact = targets.find(
    (t) => normalize(t.field_key) === key || (label && normalize(t.label) === label)
  );
  if (exact) return exact.field_key;

  const identity = guessIdentity(field);
  return identity ? identityTargets(targets)[identity] : null;
}

/**
 * Destino de cada campo recebido, na ordem em que chegaram.
 *
 * Mapeamento explícito vence e pode ligar vários campos ao mesmo destino
 * (nome + sobrenome → Nome). A sugestão automática, não: o primeiro campo que
 * parecer e-mail fica com o e-mail, e um segundo candidato vai para as
 * informações do lead em vez de sobrescrever o primeiro.
 */
export function resolveTargets(
  fields: InboundField[],
  mapping: FieldMapping,
  targets: TargetField[]
): (string | null)[] {
  const valid = new Set(targets.map((t) => t.field_key));
  const takenByExplicit = new Set(
    fields.map((f) => mapping[f.key]).filter((t): t is string => !!t && valid.has(t))
  );
  const takenBySuggestion = new Set<string>();

  return fields.map((field) => {
    if (field.key in mapping) {
      const explicit = mapping[field.key];
      return explicit && valid.has(explicit) ? explicit : null;
    }
    const suggestion = suggestTarget(field, targets);
    if (!suggestion || takenByExplicit.has(suggestion) || takenBySuggestion.has(suggestion)) return null;
    takenBySuggestion.add(suggestion);
    return suggestion;
  });
}

/**
 * Os campos recebidos como submissão do formulário de destino.
 *
 * O que não tem destino entra em `metadata`: UTMs como chaves próprias (o
 * card do lead as mostra como dado técnico) e o resto como um bloco
 * `pergunta: resposta` por linha na chave que o card lê como respostas.
 */
export function buildSubmission(
  fields: InboundField[],
  mapping: FieldMapping,
  targets: TargetField[]
): MappedSubmission {
  const resolved = resolveTargets(fields, mapping, targets);
  const data: Record<string, string> = {};
  const metadata: Record<string, string> = {};
  const answerLines: string[] = [];

  fields.forEach((field, index) => {
    const target = resolved[index];
    if (target) {
      data[target] = data[target] ? `${data[target]} ${field.value}` : field.value;
      return;
    }
    if (/^utm_/i.test(field.key)) {
      metadata[field.key.toLowerCase()] = field.value;
      return;
    }
    // Uma resposta com quebra de linha viraria várias "perguntas" no card.
    const value = field.value.replace(/\s*[\r\n]+\s*/g, " ");
    answerLines.push(`${field.label.replace(/:/g, "")}: ${value}`);
  });

  if (answerLines.length) metadata[ANSWERS_KEY] = answerLines.join("\n");
  return { data, metadata };
}

/** Um campo que a fonte já entregou, com um exemplo de valor. */
export interface ReceivedField extends InboundField {
  /** Destino que a próxima entrega usaria para este campo. */
  target: string | null;
  /** O destino veio do mapeamento salvo (e não da sugestão automática). */
  explicit: boolean;
}

/**
 * Os campos que a fonte já mandou, a partir das entregas mais recentes
 * primeiro, sem repetir chave, com o destino que cada um teria hoje.
 *
 * É a lista que a tela de mapeamento mostra: o cliente não digita nome de
 * campo nenhum, escolhe a partir do que de fato chegou.
 */
export function collectReceivedFields(
  deliveriesNewestFirst: InboundField[][],
  mapping: FieldMapping,
  targets: TargetField[]
): ReceivedField[] {
  const seen = new Map<string, InboundField>();
  for (const fields of deliveriesNewestFirst) {
    for (const field of fields) {
      if (!seen.has(field.key)) seen.set(field.key, field);
    }
  }
  const unique = [...seen.values()];
  const resolved = resolveTargets(unique, mapping, targets);
  return unique.map((field, index) => ({
    ...field,
    target: resolved[index],
    explicit: field.key in mapping,
  }));
}
