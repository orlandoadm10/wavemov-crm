/**
 * Qual regra de distribuição atende este lead — regra pura.
 *
 * Separada da consulta de propósito: a ordem de avaliação é a parte que o
 * administrador precisa conseguir prever, e é a única coisa aqui que merece
 * teste isolado.
 */

export interface DistributionRule {
  id: string;
  name: string;
  method: string;
  priority: number;
  is_fallback: boolean;
  /** `null` = qualquer origem. */
  origin: string | null;
  /** `null` = qualquer formulário. */
  form_id: string | null;
  created_at: string;
}

export interface LeadContext {
  origin: "public_form" | "external_ingest" | "whatsapp";
  formId: string | null;
}

/** Condições combinam com E; nulo é curinga. */
function matches(rule: DistributionRule, lead: LeadContext): boolean {
  if (rule.origin !== null && rule.origin !== lead.origin) return false;
  if (rule.form_id !== null && rule.form_id !== lead.formId) return false;
  return true;
}

/**
 * A primeira regra que casa, por prioridade crescente; a regra padrão é
 * sempre a última, independentemente da prioridade que tenha.
 *
 * A padrão fica fora da ordenação de propósito: se ela concorresse por
 * prioridade, bastaria alguém salvá-la com prioridade baixa para que ela
 * engolisse todas as regras específicas — e o administrador levaria um bom
 * tempo até desconfiar de "a regra da campanha parou de funcionar".
 *
 * `created_at` desempata prioridades iguais, para a ordem ser determinística
 * mesmo com duas regras no mesmo nível.
 */
export function selectRule(
  rules: DistributionRule[],
  lead: LeadContext
): DistributionRule | null {
  const especificas = rules
    .filter((r) => !r.is_fallback)
    .sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));

  const escolhida = especificas.find((r) => matches(r, lead));
  if (escolhida) return escolhida;

  // A padrão não tem condições (o banco recusa), então casa sempre.
  return rules.find((r) => r.is_fallback) ?? null;
}
