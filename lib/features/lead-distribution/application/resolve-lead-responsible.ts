/**
 * Caso de uso: decidir quem recebe o lead que está entrando.
 *
 * Vale para os três caminhos de entrada — página pública `/f/[slug]`, ingestão
 * externa do n8n e webhook da UAZAPI. A decisão é sempre a mesma e a auditoria
 * também; o que muda é só a origem informada.
 *
 * A resolução acontece ANTES de criar a negociação, porque `responsible_id`
 * entra no insert. O registro de auditoria acontece DEPOIS, quando já existe
 * `deal_id` para amarrar — por isso o caso de uso devolve o que auditar em vez
 * de gravar sozinho.
 */
import { buildRotationSequence, pickByTicket } from "@/lib/features/lead-distribution/domain/rotation";
import { selectRule, type LeadContext } from "@/lib/features/lead-distribution/domain/rule-matching";
import {
  loadActiveRules,
  loadParticipants,
  takeRotationTicket,
  type DistributionAudit,
} from "@/lib/features/lead-distribution/infrastructure/distribution-queries";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ResolvedResponsible {
  /** Vai direto para `deals.responsible_id`. */
  responsibleId: string | null;
  /** Para `recordDistribution`, depois que a negociação existir. */
  audit: DistributionAudit;
}

interface ResolveInput {
  admin: AdminClient;
  organizationId: string;
  lead: LeadContext;
  /**
   * Escolha explícita do administrador (`forms.default_responsible_id`).
   * Quando existe, VENCE o rodízio: quem configurou o formulário decidiu de
   * propósito, e uma distribuição automática que ignora configuração explícita
   * é uma que ninguém confia.
   */
  explicitResponsibleId?: string | null;
}

export async function resolveLeadResponsible({
  admin,
  organizationId,
  lead,
  explicitResponsibleId = null,
}: ResolveInput): Promise<ResolvedResponsible> {
  const base = {
    origin: lead.origin,
    formId: lead.formId,
    ruleId: null,
    ruleName: null,
    method: null,
    assignedTo: null,
    assignedToName: null,
    candidates: [],
    ticket: null,
  } satisfies Omit<DistributionAudit, "reason">;

  if (explicitResponsibleId) {
    return {
      responsibleId: explicitResponsibleId,
      audit: { ...base, assignedTo: explicitResponsibleId, reason: "form_default" },
    };
  }

  const regras = await loadActiveRules(admin, organizationId);
  const regra = selectRule(regras, lead);

  if (!regra) {
    // Nenhuma regra ativa casou. O lead ENTRA assim mesmo, sem responsável:
    // recusá-lo perderia o lead, que é pior que um lead órfão visível ao
    // administrador. O `no_rule` é o que leva alguém a corrigir a configuração.
    return { responsibleId: null, audit: { ...base, reason: "no_rule" } };
  }

  const participantes = await loadParticipants(admin, regra.id);
  const candidatos = participantes.map((p) => ({
    profile_id: p.profileId,
    name: p.name,
    weight: p.weight,
  }));

  const comRegra = {
    ...base,
    ruleId: regra.id,
    ruleName: regra.name,
    method: regra.method,
    candidates: candidatos,
  };

  const sequencia = buildRotationSequence(participantes);
  if (sequencia.length === 0) {
    return { responsibleId: null, audit: { ...comRegra, reason: "no_candidates" } };
  }

  const bilhete = await takeRotationTicket(admin, regra.id);
  if (bilhete === null) {
    return { responsibleId: null, audit: { ...comRegra, reason: "no_candidates" } };
  }

  const escolhido = pickByTicket(sequencia, bilhete);
  const nome = participantes.find((p) => p.profileId === escolhido)?.name ?? null;

  return {
    responsibleId: escolhido,
    audit: {
      ...comRegra,
      assignedTo: escolhido,
      assignedToName: nome,
      ticket: bilhete,
      reason: "rule_matched",
    },
  };
}
