/**
 * Acesso ao banco da distribuição automática (migration 0016) — USO EXCLUSIVO
 * NO SERVIDOR, sempre com `service_role`.
 *
 * O motor roda nas rotas de ingestão e no webhook, que não têm sessão: o RLS
 * não protege nada aqui dentro. `organization_id` vem SEMPRE do formulário ou
 * da instância já resolvidos pelo chamador, nunca de payload externo.
 */
import type { DistributionRule } from "@/lib/features/lead-distribution/domain/rule-matching";
import type { RotationParticipant } from "@/lib/features/lead-distribution/domain/rotation";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Regras ATIVAS da organização, para o domínio escolher. */
export async function loadActiveRules(
  admin: AdminClient,
  organizationId: string
): Promise<DistributionRule[]> {
  const { data, error } = await admin
    .from("lead_distribution_rules")
    .select("id, name, method, priority, is_fallback, origin, form_id, created_at")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (error) {
    // Sem a 0016 aplicada as tabelas não existem. O lead ainda entra — só sem
    // responsável —, mas o motivo precisa aparecer no log, senão vira
    // "parou de distribuir" sem explicação.
    console.error(
      "[distribuicao] falha ao ler regras — a migration 0016 foi aplicada?",
      error
    );
    return [];
  }
  return (data ?? []) as DistributionRule[];
}

/** Participantes ativos de uma regra, já com o nome para o snapshot. */
export async function loadParticipants(
  admin: AdminClient,
  ruleId: string
): Promise<RotationParticipant[]> {
  const { data, error } = await admin
    .from("lead_distribution_participants")
    .select("weight, profile:profiles!inner(id, first_name, last_name)")
    .eq("rule_id", ruleId)
    .eq("is_active", true);

  if (error) {
    console.error("[distribuicao] falha ao ler participantes", error);
    return [];
  }

  return (data ?? []).map((linha) => {
    const perfil = linha.profile as unknown as {
      id: string;
      first_name: string | null;
      last_name: string | null;
    };
    return {
      profileId: perfil.id,
      name: `${perfil.first_name ?? ""} ${perfil.last_name ?? ""}`.trim() || "Sem nome",
      weight: linha.weight as number,
    };
  });
}

/** Tentativas do compare-and-swap antes de desistir do bilhete. */
const TICKET_MAX_ATTEMPTS = 5;

/**
 * Tira o próximo bilhete do rodízio, sem corrida.
 *
 * POR QUE COMPARE-AND-SWAP E NÃO `set x = x + 1`
 * O PostgREST não expressa `coluna = coluna + 1`: o cliente só manda valores
 * literais. Fazer "ler, somar, gravar" seria exatamente a corrida que este
 * contador existe para evitar — duas ingestões simultâneas leriam o mesmo
 * valor e os dois leads cairiam no mesmo vendedor, no cenário em que isso mais
 * acontece, que é a rajada de uma campanha.
 *
 * A condição `.eq("assignments_count", lido)` transforma o update num
 * compare-and-swap: quem chegar segundo não atinge linha nenhuma, relê e tenta
 * de novo. Uma RPC `security definer` faria isso em uma viagem só, mas exigiria
 * migration nova — e a 0016 já está aplicada, migration aplicada é imutável.
 * Se a contenção justificar, a otimização é uma `0017`, não uma edição.
 *
 * Devolve `null` quando a regra sumiu ou depois de esgotadas as tentativas; o
 * chamador trata como "sem distribuição" em vez de adivinhar uma posição.
 */
export async function takeRotationTicket(
  admin: AdminClient,
  ruleId: string
): Promise<number | null> {
  for (let tentativa = 0; tentativa < TICKET_MAX_ATTEMPTS; tentativa++) {
    const { data: atual, error: leituraError } = await admin
      .from("lead_distribution_rules")
      .select("assignments_count")
      .eq("id", ruleId)
      .maybeSingle();

    if (leituraError || !atual) {
      console.error("[distribuicao] falha ao ler o contador do rodízio", leituraError);
      return null;
    }

    const lido = Number(atual.assignments_count);
    const proximo = lido + 1;

    const { data: gravado, error: escritaError } = await admin
      .from("lead_distribution_rules")
      .update({ assignments_count: proximo })
      .eq("id", ruleId)
      .eq("assignments_count", lido)
      .select("assignments_count")
      .maybeSingle();

    if (escritaError) {
      console.error("[distribuicao] falha ao gravar o bilhete do rodízio", escritaError);
      return null;
    }
    // Linha afetada = o bilhete é meu. Zero linhas = outra requisição passou na
    // frente entre a leitura e a escrita; relê e tenta de novo.
    if (gravado) return Number(gravado.assignments_count);
  }

  console.error(
    "[distribuicao] contenção alta no contador do rodízio: bilhete não obtido em",
    TICKET_MAX_ATTEMPTS,
    "tentativas"
  );
  return null;
}

export interface DistributionAudit {
  ruleId: string | null;
  ruleName: string | null;
  method: string | null;
  origin: string;
  formId: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  candidates: { profile_id: string; name: string; weight: number }[];
  ticket: number | null;
  reason: "rule_matched" | "form_default" | "no_rule" | "no_candidates";
}

/**
 * Registra a decisão para auditoria.
 *
 * Grava também quando NÃO houve distribuição: `no_rule` e `no_candidates` são
 * o que o administrador precisa enxergar para corrigir a configuração — sem
 * eles, "os leads pararam de chegar" não tem onde ser investigado.
 *
 * Falhar aqui não desfaz o lead: ele já existe e é o que o usuário vê. Fica no
 * log do servidor porque é uma lacuna de auditoria.
 */
export async function recordDistribution(
  admin: AdminClient,
  organizationId: string,
  dealId: string | null,
  audit: DistributionAudit
): Promise<void> {
  const { error } = await admin.from("lead_distribution_log").insert({
    organization_id: organizationId,
    deal_id: dealId,
    rule_id: audit.ruleId,
    rule_name: audit.ruleName,
    method: audit.method,
    origin: audit.origin,
    form_id: audit.formId,
    assigned_to: audit.assignedTo,
    assigned_to_name: audit.assignedToName,
    candidates: audit.candidates,
    ticket: audit.ticket,
    reason: audit.reason,
  });

  if (error) {
    console.error("[distribuicao] lead distribuído SEM registro de auditoria", error);
  }
}
