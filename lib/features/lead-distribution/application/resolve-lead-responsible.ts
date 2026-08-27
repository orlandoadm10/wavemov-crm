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
import { pickNext } from "@/lib/features/lead-distribution/domain/queue";
import { selectRule, type LeadContext } from "@/lib/features/lead-distribution/domain/rule-matching";
import {
  CURSOR_MAX_ATTEMPTS,
  commitQueueAdvance,
  loadActiveRules,
  loadEligibleQueue,
  readAssignmentsCount,
  readQueueCursor,
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
   * Quando existe, VENCE a fila: quem configurou o formulário decidiu de
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

  const comRegra = {
    ...base,
    ruleId: regra.id,
    ruleName: regra.name,
    method: regra.method,
  };

  // Compare-and-swap com nova escolha a cada tentativa.
  //
  // A fila é relida junto com o cursor de propósito: se outra requisição
  // avançou no meio, a vez passou a ser de OUTRA pessoa, e insistir na escolha
  // antiga entregaria dois leads seguidos para a mesma. Refazer a decisão é o
  // comportamento correto, não um custo.
  for (let tentativa = 0; tentativa < CURSOR_MAX_ATTEMPTS; tentativa++) {
    const fila = await loadEligibleQueue(admin, regra.id, organizationId);
    const candidatos = fila.map((p) => ({
      profile_id: p.profileId,
      name: p.name,
      weight: p.weight,
    }));

    if (fila.length === 0) {
      // Ninguém de plantão. O lead entra sem responsável e a auditoria diz por
      // quê — é o caso que o administrador precisa ver para religar alguém.
      return {
        responsibleId: null,
        audit: { ...comRegra, candidates: candidatos, reason: "no_candidates" },
      };
    }

    const cursor = await readQueueCursor(admin, regra.id);
    if (!cursor) {
      return {
        responsibleId: null,
        audit: { ...comRegra, candidates: candidatos, reason: "no_candidates" },
      };
    }

    const escolha = pickNext(fila, cursor);
    if (!escolha) {
      return {
        responsibleId: null,
        audit: { ...comRegra, candidates: candidatos, reason: "no_candidates" },
      };
    }

    const total = await readAssignmentsCount(admin, regra.id);
    const gravou = await commitQueueAdvance(admin, regra.id, cursor, escolha.next, total);
    if (!gravou) continue;

    return {
      responsibleId: escolha.participant.profileId,
      audit: {
        ...comRegra,
        candidates: candidatos,
        assignedTo: escolha.participant.profileId,
        assignedToName: escolha.participant.name,
        // `ticket` guarda a POSIÇÃO servida: é o que permite reconstruir a
        // escolha depois, junto com o snapshot dos candidatos.
        ticket: escolha.next.position,
        reason: "rule_matched",
      },
    };
  }

  console.error(
    "[distribuicao] contenção alta na fila: vez não obtida em",
    CURSOR_MAX_ATTEMPTS,
    "tentativas",
    { ruleId: regra.id }
  );
  return { responsibleId: null, audit: { ...comRegra, reason: "no_candidates" } };
}
