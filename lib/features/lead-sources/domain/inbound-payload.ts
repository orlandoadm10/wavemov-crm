/**
 * O que uma fonte de lead entrega, depois de traduzido — sem Supabase, sem
 * Next, sem rede.
 *
 * Toda origem (Typeform, webhook genérico, Meta) chega aqui como uma lista
 * plana de campos. A partir desse ponto o resto do fluxo — mapeamento,
 * formulário de destino, criação do lead — não sabe de onde o dado veio.
 */

/** Um campo recebido: a chave estável, o rótulo que a tela mostra e o valor. */
export interface InboundField {
  key: string;
  label: string;
  value: string;
}

export interface InboundPayload {
  /**
   * Identificador do envio NA ORIGEM, quando ela manda um. É o que torna a
   * reentrega idempotente; sem ele o chamador deriva um do conteúdo.
   */
  eventKey: string | null;
  fields: InboundField[];
}

/** Tetos do que vem de fora: a origem pode mandar qualquer coisa. */
export const MAX_FIELDS = 100;
export const MAX_FIELD_VALUE = 2000;
const MAX_DEPTH = 5;

/** Chaves que carregam o id do envio nas origens mais comuns. */
const EVENT_KEY_CANDIDATES = ["event_id", "eventId", "submission_id", "response_id", "lead_id", "leadgen_id", "id"];

/**
 * Corpo da requisição como objeto, a partir do texto e do content-type.
 *
 * JSON e `application/x-www-form-urlencoded` cobrem quase tudo: Typeform,
 * n8n, Make e Zapier mandam JSON; Elementor, Contact Form 7 e formulários
 * HTML puros mandam urlencoded. Sem content-type confiável, tenta os dois —
 * ferramenta simples costuma errar o cabeçalho, e recusar por isso perderia o
 * lead. `null` quando não há objeto nenhum a extrair.
 */
export function parseRequestBody(text: string, contentType: string | null): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const type = (contentType ?? "").toLowerCase();
  if (type.includes("application/x-www-form-urlencoded")) return parseUrlEncoded(trimmed);

  const json = parseJsonObject(trimmed);
  if (json) return json;
  if (type.includes("json")) return null;
  return trimmed.includes("=") ? parseUrlEncoded(trimmed) : null;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    if (isPlainObject(value)) return value;
    // Algumas ferramentas mandam uma lista com um único envio.
    if (Array.isArray(value) && value.length === 1 && isPlainObject(value[0])) return value[0];
    return null;
  } catch {
    return null;
  }
}

function parseUrlEncoded(text: string): Record<string, unknown> | null {
  const params = new URLSearchParams(text);
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    // Campo repetido (checkbox múltiplo) vira uma lista legível.
    result[key] = key in result ? `${result[key]}, ${value}` : value;
  }
  return Object.keys(result).length ? result : null;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `utm_source` → `Utm source`; `dados.telefone` → `Telefone`. */
export function humanizeKey(key: string): string {
  const last = key.split(".").filter((part) => !/^\d+$/.test(part)).pop() ?? key;
  const words = last.replace(/[_\-[\]]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Valor primitivo como texto; objeto e `null` não são valor de campo. */
export function toFieldValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim().slice(0, MAX_FIELD_VALUE) || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/**
 * Qualquer JSON como lista plana de campos, com o caminho como chave.
 *
 * `{ "lead": { "nome": "Ana" } }` vira `lead.nome`. Lista de valores simples
 * vira um texto separado por vírgula (respostas de múltipla escolha); lista de
 * objetos ganha o índice no caminho. A profundidade e a quantidade têm teto
 * porque o corpo vem de fora.
 */
export function flattenPayload(body: Record<string, unknown>): InboundField[] {
  const fields: InboundField[] = [];

  const visit = (value: unknown, path: string, depth: number) => {
    if (fields.length >= MAX_FIELDS || depth > MAX_DEPTH) return;

    if (Array.isArray(value)) {
      const primitives = value.map(toFieldValue);
      if (primitives.every((v) => v !== null)) {
        const joined = primitives.join(", ").slice(0, MAX_FIELD_VALUE);
        if (joined) fields.push({ key: path, label: humanizeKey(path), value: joined });
        return;
      }
      value.forEach((item, index) => visit(item, `${path}.${index}`, depth + 1));
      return;
    }

    if (isPlainObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        visit(child, path ? `${path}.${key}` : key, depth + 1);
      }
      return;
    }

    const text = toFieldValue(value);
    if (text !== null && path) fields.push({ key: path, label: humanizeKey(path), value: text });
  };

  visit(body, "", 0);
  return fields;
}

/**
 * Payload de uma origem qualquer (webhook genérico).
 *
 * O id do envio é procurado nas chaves de topo de uso comum. Não achar não é
 * erro: o chamador deriva uma chave do conteúdo.
 */
export function parseGenericPayload(body: Record<string, unknown>): InboundPayload {
  let eventKey: string | null = null;
  for (const candidate of EVENT_KEY_CANDIDATES) {
    const value = toFieldValue(body[candidate]);
    if (value) {
      eventKey = value.slice(0, 200);
      break;
    }
  }
  return { eventKey, fields: flattenPayload(body) };
}

// ============================================================
// Typeform
//
// O Typeform manda as respostas numa lista (`form_response.answers`) em que
// cada item diz o TIPO e guarda o valor numa chave com o nome desse tipo
// (`text`, `email`, `phone_number`, `choice.label`…). A pergunta não vem na
// resposta: vem em `form_response.definition.fields`, ligada pelo `id`.
//
// A chave de cada campo é o `ref` quando existe — o identificador que o dono
// do formulário controla e que sobrevive a editar o texto da pergunta — e o
// `id` do Typeform quando não existe. Assim o mapeamento salvo na tela não se
// perde quando alguém corrige a redação de uma pergunta.
// ============================================================
interface TypeformDefinitionField {
  id?: string;
  ref?: string;
  title?: string;
}

/** É o corpo de um webhook do Typeform? */
export function isTypeformPayload(body: Record<string, unknown>): boolean {
  return isPlainObject(body.form_response) && Array.isArray(body.form_response.answers);
}

/** O valor de uma resposta, conforme o tipo que ela declara. */
function answerValue(answer: Record<string, unknown>): string | null {
  const type = typeof answer.type === "string" ? answer.type : "";
  const raw = answer[type];

  if (type === "choice" && isPlainObject(raw)) {
    return toFieldValue(raw.label) ?? toFieldValue(raw.other);
  }
  if (type === "choices" && isPlainObject(raw)) {
    const labels = Array.isArray(raw.labels) ? raw.labels.map(toFieldValue).filter(Boolean) : [];
    const other = toFieldValue(raw.other);
    const all = other ? [...labels, other] : labels;
    return all.length ? all.join(", ").slice(0, MAX_FIELD_VALUE) : null;
  }
  if (type === "payment" && isPlainObject(raw)) {
    return toFieldValue(raw.amount);
  }
  if (type === "boolean") {
    return raw === true ? "Sim" : raw === false ? "Não" : null;
  }
  return toFieldValue(raw);
}

/**
 * Remove a marcação que o Typeform deixa no título da pergunta: negrito em
 * `*asteriscos*` e referência a resposta anterior (`{{field:abc}}`).
 */
function cleanTitle(title: string): string {
  return title
    .replace(/\{\{[^}]*\}\}/g, "…")
    .replace(/[*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseTypeformPayload(body: Record<string, unknown>): InboundPayload | null {
  if (!isTypeformPayload(body)) return null;
  const response = body.form_response as Record<string, unknown>;

  const definitionFields: TypeformDefinitionField[] =
    isPlainObject(response.definition) && Array.isArray(response.definition.fields)
      ? (response.definition.fields.filter(isPlainObject) as TypeformDefinitionField[])
      : [];
  const titleById = new Map(
    definitionFields.filter((f) => f.id && f.title).map((f) => [f.id as string, cleanTitle(f.title as string)])
  );

  const fields: InboundField[] = [];
  const answers = (response.answers as unknown[]).filter(isPlainObject);

  for (const answer of answers) {
    if (fields.length >= MAX_FIELDS) break;
    const value = answerValue(answer);
    if (!value) continue;
    const field = isPlainObject(answer.field) ? answer.field : {};
    const id = typeof field.id === "string" ? field.id : null;
    const ref = typeof field.ref === "string" ? field.ref : null;
    const key = ref ?? id;
    if (!key) continue;
    fields.push({ key, label: (id && titleById.get(id)) || key, value });
  }

  // Campos ocultos: é por eles que UTM e origem da campanha chegam.
  if (isPlainObject(response.hidden)) {
    for (const [key, raw] of Object.entries(response.hidden)) {
      if (fields.length >= MAX_FIELDS) break;
      const value = toFieldValue(raw);
      if (value) fields.push({ key, label: key, value });
    }
  }

  if (isPlainObject(response.calculated)) {
    const score = toFieldValue(response.calculated.score);
    if (score && score !== "0") fields.push({ key: "typeform_score", label: "Pontuação", value: score });
  }

  // `token` identifica a resposta e é o mesmo em toda reentrega; `event_id`
  // fica de reserva para payloads montados à mão.
  const eventKey = toFieldValue(response.token) ?? toFieldValue(body.event_id);
  return { eventKey: eventKey ? eventKey.slice(0, 200) : null, fields };
}
