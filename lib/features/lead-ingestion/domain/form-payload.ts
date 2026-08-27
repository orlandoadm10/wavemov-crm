/**
 * Regras de leitura do payload de um formulário — sem Supabase, sem Next,
 * sem rede. São as mesmas para os dois caminhos de entrada de lead:
 *
 *   - a página pública `/f/[slug]`, preenchida pelo próprio lead;
 *   - `POST /api/ingest/leads`, chamado pelo n8n (migration 0014).
 *
 * Ambos recebem um objeto de chaves livres vindo de fora e precisam
 * responder às mesmas três perguntas: o que desse objeto pode ser gravado,
 * está faltando algo obrigatório, e quem é o lead.
 */
import { normalizePhone } from "@/lib/utils";

/** O que o domínio precisa saber de um campo do formulário. */
export interface SubmissionField {
  label: string;
  field_key: string;
  is_required: boolean;
}

/** Um valor não pode crescer sem limite: o payload vem de fora. */
const MAX_VALUE_LENGTH = 2000;

/**
 * Mantém apenas as chaves declaradas em `form_fields`.
 *
 * É a sanitização que impede que a origem grave o que quiser em
 * `form_submissions.raw_data` — e, com ele, no `metadata` da atividade que
 * aparece no histórico do lead. Chave desconhecida é descartada em silêncio
 * de propósito: um fluxo de n8n manda o payload inteiro da origem (dezenas
 * de campos de controle da Meta, por exemplo) e recusar a requisição por
 * causa disso transformaria toda integração nova numa sequência de 400.
 */
export function sanitizeSubmission(
  fields: SubmissionField[],
  data: Record<string, string>
): Record<string, string> {
  const allowedKeys = new Set(fields.map((f) => f.field_key));
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (allowedKeys.has(key)) clean[key] = String(value).slice(0, MAX_VALUE_LENGTH);
  }
  return clean;
}

/**
 * Primeiro campo obrigatório que ficou vazio, ou `null` se está tudo lá.
 * Devolve o campo inteiro (não só o rótulo) para o chamador decidir o que
 * mostrar: a página pública nomeia o campo ao usuário, a rota de ingestão
 * responde ao n8n.
 */
export function findMissingRequiredField(
  fields: SubmissionField[],
  clean: Record<string, string>
): SubmissionField | null {
  return fields.find((f) => f.is_required && !clean[f.field_key]?.trim()) ?? null;
}

export interface LeadIdentity {
  name: string;
  email: string | null;
  /** Como veio, para exibição. */
  rawPhone: string | null;
  /** Só dígitos com DDI, para casar com contato existente e com o WhatsApp. */
  phone: string | null;
}

/**
 * Extrai nome, e-mail e telefone de um payload de chaves livres.
 *
 * Os apelidos aceitos (`nome`, `telefone`, `whatsapp`) existem porque quem
 * monta o formulário escolhe o `field_key`, e as duas grafias aparecem na
 * base. O fallback para o primeiro valor evita lead anônimo quando o
 * formulário não tem campo de nome nenhum.
 */
export function extractLeadIdentity(clean: Record<string, string>): LeadIdentity {
  const name = clean.name ?? clean.nome ?? Object.values(clean)[0] ?? "Lead sem nome";
  const email = clean.email ?? null;
  const rawPhone = clean.phone ?? clean.telefone ?? clean.whatsapp ?? null;
  return {
    name,
    email,
    rawPhone,
    phone: rawPhone ? normalizePhone(rawPhone) : null,
  };
}
