/**
 * Acesso ao banco da distribuição automática (migration 0016) — USO EXCLUSIVO
 * NO SERVIDOR, sempre com `service_role`.
 *
 * O motor roda nas rotas de ingestão e no webhook, que não têm sessão: o RLS
 * não protege nada aqui dentro. `organization_id` vem SEMPRE do formulário ou
 * da instância já resolvidos pelo chamador, nunca de payload externo.
 */
import type { QueueCursor, QueueParticipant } from "@/lib/features/lead-distribution/domain/queue";
import type { DistributionRule } from "@/lib/features/lead-distribution/domain/rule-matching";
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

/**
 * A fila ELEGÍVEL da regra, em ordem.
 *
 * "Elegível" é a interseção de três coisas, e nenhuma delas pode faltar:
 *   - o participante está ativo na regra;
 *   - a pessoa é membro ativo da organização;
 *   - a pessoa está **de plantão** (`organization_members.on_duty`, 0017).
 *
 * O filtro acontece aqui, e não no domínio, de propósito: `pickNext` recebe a
 * fila já filtrada e é justamente por isso que o ausente é pulado sem que a
 * posição de ninguém mude. Se o domínio precisasse conhecer plantão, ele
 * precisaria também conhecer papel, vínculo e organização.
 *
 * As duas consultas são separadas porque `lead_distribution_participants` se
 * liga a `profiles`, e o plantão vive em `organization_members` — o join
 * transversal não é expressável num único `select` do PostgREST sem uma view.
 */
export async function loadEligibleQueue(
  admin: AdminClient,
  ruleId: string,
  organizationId: string
): Promise<QueueParticipant[]> {
  const { data, error } = await admin
    .from("lead_distribution_participants")
    .select("weight, position, profile:profiles!inner(id, first_name, last_name)")
    .eq("rule_id", ruleId)
    .eq("is_active", true)
    .order("position");

  if (error) {
    console.error(
      "[distribuicao] falha ao ler a fila — a migration 0017 foi aplicada?",
      error
    );
    return [];
  }

  const participantes = (data ?? []).map((linha) => {
    const perfil = linha.profile as unknown as {
      id: string;
      first_name: string | null;
      last_name: string | null;
    };
    return {
      profileId: perfil.id,
      name: `${perfil.first_name ?? ""} ${perfil.last_name ?? ""}`.trim() || "Sem nome",
      weight: linha.weight as number,
      position: linha.position as number,
    };
  });

  if (participantes.length === 0) return [];

  const { data: membros, error: membrosError } = await admin
    .from("organization_members")
    .select("profile_id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .eq("on_duty", true)
    .neq("role", "viewer")
    .in(
      "profile_id",
      participantes.map((p) => p.profileId)
    );

  if (membrosError) {
    // Sem conseguir ler o plantão não dá para escolher: distribuir para quem
    // pode estar fora é pior que registrar `no_candidates` e deixar o
    // administrador ver o problema.
    console.error("[distribuicao] falha ao ler o plantão", membrosError);
    return [];
  }

  const dePlantao = new Set((membros ?? []).map((m) => m.profile_id as string));
  return participantes.filter((p) => dePlantao.has(p.profileId));
}

/** Tentativas do compare-and-swap antes de desistir da vez. */
export const CURSOR_MAX_ATTEMPTS = 5;

/** O cursor atual da regra, para o domínio decidir de quem é a vez. */
export async function readQueueCursor(
  admin: AdminClient,
  ruleId: string
): Promise<QueueCursor | null> {
  const { data, error } = await admin
    .from("lead_distribution_rules")
    .select("queue_position, queue_uses")
    .eq("id", ruleId)
    .maybeSingle();

  if (error || !data) {
    console.error("[distribuicao] falha ao ler o cursor da fila", error);
    return null;
  }
  return { position: Number(data.queue_position), uses: Number(data.queue_uses) };
}

/**
 * Avança o cursor, sem corrida.
 *
 * POR QUE COMPARE-AND-SWAP
 * "Ler, decidir, gravar" é exatamente a corrida que este cursor existe para
 * evitar: duas ingestões simultâneas leriam a mesma posição e os dois leads
 * cairiam na mesma pessoa — no cenário em que isso mais acontece, que é a
 * rajada de uma campanha.
 *
 * As condições `.eq("queue_position", de.position)` e `.eq("queue_uses",
 * de.uses)` fazem a escrita valer **apenas se o cursor não mudou** desde a
 * leitura. Quem chegar segundo não atinge linha nenhuma, relê e refaz a
 * escolha com o cursor novo — que é o comportamento certo, porque a vez
 * realmente é de outra pessoa agora.
 *
 * Uma RPC `security definer` resolveria em uma viagem só, mas o PostgREST não
 * expressa a operação e as migrations `0016`/`0017` já estão aplicadas. Se a
 * contenção justificar, a otimização é uma migration nova, não uma edição.
 *
 * `assignments_count` sobe junto: deixou de decidir qualquer coisa, mas é o
 * total que a tela mostra.
 */
export async function commitQueueAdvance(
  admin: AdminClient,
  ruleId: string,
  de: QueueCursor,
  para: QueueCursor,
  totalAtual: number
): Promise<boolean> {
  const { data, error } = await admin
    .from("lead_distribution_rules")
    .update({
      queue_position: para.position,
      queue_uses: para.uses,
      assignments_count: totalAtual + 1,
    })
    .eq("id", ruleId)
    .eq("queue_position", de.position)
    .eq("queue_uses", de.uses)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[distribuicao] falha ao avançar o cursor da fila", error);
    return false;
  }
  return Boolean(data);
}

/** Total distribuído pela regra — só para o `assignments_count` acompanhar. */
export async function readAssignmentsCount(
  admin: AdminClient,
  ruleId: string
): Promise<number> {
  const { data } = await admin
    .from("lead_distribution_rules")
    .select("assignments_count")
    .eq("id", ruleId)
    .maybeSingle();
  return Number(data?.assignments_count ?? 0);
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
