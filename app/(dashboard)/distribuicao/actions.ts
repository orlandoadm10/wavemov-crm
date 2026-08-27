"use server";

import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type DistributionResult = { error?: string; success?: string };

/**
 * Gestão das regras de distribuição.
 *
 * Ao contrário do motor, que roda em webhook e usa `service_role`, estas
 * escritas usam o cliente da SESSÃO: as policies da 0016 já exigem
 * `is_org_admin`, então o banco é quem decide. Usar service role aqui seria
 * trocar uma guarda que o Postgres aplica por uma que eu teria de lembrar de
 * escrever em cada action.
 *
 * Toda escrita filtra por `organization_id` além do id e confirma a linha com
 * `.select()`: sob RLS, um update que não atinge nada volta sem erro.
 */

const ruleSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome à regra."),
  priority: z.coerce.number().int().min(1).max(999),
  origin: z.enum(["public_form", "external_ingest", "whatsapp"]).nullable(),
  formId: z.string().uuid().nullable(),
  isActive: z.boolean(),
});

function assertOrgAdmin(session: Awaited<ReturnType<typeof getSessionContext>>) {
  return session.membership.role === "org_admin" || session.profile.is_global_admin;
}

export async function createRuleAction(input: unknown): Promise<DistributionResult> {
  const session = await getSessionContext();
  if (!assertOrgAdmin(session)) {
    return { error: "Apenas administradores da empresa configuram a distribuição." };
  }

  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_distribution_rules")
    .insert({
      organization_id: session.organization.id,
      name: parsed.data.name,
      priority: parsed.data.priority,
      origin: parsed.data.origin,
      form_id: parsed.data.formId,
      is_active: parsed.data.isActive,
      is_fallback: false,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: describeRuleError(error, "Não foi possível criar a regra.") };

  revalidatePath("/distribuicao");
  return { success: "Regra criada." };
}

export async function updateRuleAction(
  ruleId: string,
  input: unknown
): Promise<DistributionResult> {
  const session = await getSessionContext();
  if (!assertOrgAdmin(session)) {
    return { error: "Apenas administradores da empresa configuram a distribuição." };
  }

  const parsed = ruleSchema.partial({ origin: true, formId: true }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_distribution_rules")
    .update({
      name: parsed.data.name,
      priority: parsed.data.priority,
      origin: parsed.data.origin ?? null,
      form_id: parsed.data.formId ?? null,
      is_active: parsed.data.isActive,
    })
    .eq("id", ruleId)
    .eq("organization_id", session.organization.id)
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: describeRuleError(error, "Não foi possível salvar a regra.") };

  revalidatePath("/distribuicao");
  return { success: "Regra atualizada." };
}

export async function deleteRuleAction(ruleId: string): Promise<DistributionResult> {
  const session = await getSessionContext();
  if (!assertOrgAdmin(session)) {
    return { error: "Apenas administradores da empresa configuram a distribuição." };
  }

  const supabase = await createClient();
  // A regra padrão não é excluível pela tela: sem ela, todo lead que não casa
  // com uma regra específica passa a nascer órfão — o defeito que a Frente C
  // existe para fechar. Trocar de padrão é editar a que existe.
  const { data: regra } = await supabase
    .from("lead_distribution_rules")
    .select("is_fallback")
    .eq("id", ruleId)
    .eq("organization_id", session.organization.id)
    .maybeSingle();

  if (!regra) return { error: "Regra não encontrada." };
  if (regra.is_fallback) {
    return {
      error:
        "A regra padrão não pode ser excluída — ela é quem garante que todo lead tenha dono. Desative-a se quiser parar de distribuir.",
    };
  }

  const { data, error } = await supabase
    .from("lead_distribution_rules")
    .delete()
    .eq("id", ruleId)
    .eq("organization_id", session.organization.id)
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: "Não foi possível excluir a regra." };

  revalidatePath("/distribuicao");
  return { success: "Regra excluída. O histórico de distribuição dela foi preservado." };
}

const participantSchema = z.object({
  ruleId: z.string().uuid(),
  profileId: z.string().uuid(),
  weight: z.coerce.number().int().min(1, "O peso mínimo é 1.").max(100, "O peso máximo é 100."),
});

export async function upsertParticipantAction(input: unknown): Promise<DistributionResult> {
  const session = await getSessionContext();
  if (!assertOrgAdmin(session)) {
    return { error: "Apenas administradores da empresa configuram a distribuição." };
  }

  const parsed = participantSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();

  // A POSIÇÃO PRECISA SER CALCULADA AQUI.
  //
  // `position` é `not null default 0` (0017), e o `max(position)+1` só existe
  // no trigger que inscreve quem entra na organização — que não roda quando o
  // administrador adiciona alguém pela tela. Sem este cálculo, todos os
  // participantes de uma regra nova nasciam na posição 0, e `pickNext` virava
  // ponto fixo: `find(p => p.position > 0)` não acha ninguém, cai no
  // `?? fila[0]`, e a MESMA pessoa recebe todos os leads da regra para sempre.
  // A auditoria registrava `rule_matched` com todos os candidatos, então nada
  // denunciava o problema.
  //
  // No conflito a posição existente é preservada: reeditar o peso de alguém
  // não pode mandá-lo para o fim da fila.
  const { data: existente } = await supabase
    .from("lead_distribution_participants")
    .select("position")
    .eq("rule_id", parsed.data.ruleId)
    .eq("profile_id", parsed.data.profileId)
    .maybeSingle();

  let posicao = existente?.position as number | undefined;
  if (posicao === undefined) {
    const { data: ultimo } = await supabase
      .from("lead_distribution_participants")
      .select("position")
      .eq("rule_id", parsed.data.ruleId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    posicao = ultimo ? Number(ultimo.position) + 1 : 0;
  }

  const { data, error } = await supabase
    .from("lead_distribution_participants")
    .upsert(
      {
        rule_id: parsed.data.ruleId,
        profile_id: parsed.data.profileId,
        weight: parsed.data.weight,
        position: posicao,
        is_active: true,
      },
      { onConflict: "rule_id,profile_id" }
    )
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: describeParticipantError(error, "Não foi possível salvar o participante.") };
  }

  revalidatePath("/distribuicao");
  return { success: "Participante salvo." };
}

export async function removeParticipantAction(
  ruleId: string,
  profileId: string
): Promise<DistributionResult> {
  const session = await getSessionContext();
  if (!assertOrgAdmin(session)) {
    return { error: "Apenas administradores da empresa configuram a distribuição." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_distribution_participants")
    .delete()
    .eq("rule_id", ruleId)
    .eq("profile_id", profileId)
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: "Não foi possível remover o participante." };

  revalidatePath("/distribuicao");
  return { success: "Participante removido do rodízio." };
}

/**
 * As guardas da 0016 falam em português e são a melhor explicação disponível —
 * repeti-las aqui só criaria duas fontes da mesma verdade. O que esta função
 * faz é evitar que a mensagem crua do PostgREST (nome de índice, nome de
 * constraint) chegue à tela.
 */
function describeRuleError(err: unknown, fallback: string) {
  const message = (err as { message?: string } | null)?.message ?? "";
  if (message.includes("não pertence a esta organização")) {
    return "O formulário escolhido não é desta empresa.";
  }
  if (message.includes("regra padrão não pode ter condições")) {
    return "A regra padrão não aceita condições — ela existe para receber o que nenhuma outra pegou.";
  }
  if (message.includes("lead_distribution_rules_fallback_key")) {
    return "Já existe uma regra padrão nesta empresa.";
  }
  if (err) console.error(fallback, err);
  return fallback;
}

function describeParticipantError(err: unknown, fallback: string) {
  const message = (err as { message?: string } | null)?.message ?? "";
  if (message.includes("somente leitura não pode receber leads")) {
    return "Perfil somente leitura não pode receber leads.";
  }
  if (message.includes("está inativa nesta organização")) {
    return "Essa pessoa está inativa na empresa.";
  }
  if (message.includes("não é membro desta organização")) {
    return "Essa pessoa não é membro desta empresa.";
  }
  if (err) console.error(fallback, err);
  return fallback;
}

const reorderSchema = z.object({
  ruleId: z.string().uuid(),
  /** Ordem final, do primeiro ao último da fila. */
  profileIds: z.array(z.string().uuid()).min(1),
});

/**
 * Regrava a ordem da fila inteira.
 *
 * Renumera TODOS os participantes de 0 em diante, em vez de trocar duas
 * posições. É o que mantém as posições distintas e sem buracos — a `0017` não
 * põe índice único sobre `(rule_id, position)` de propósito, porque trocar
 * duas linhas por PostgREST não acontece numa transação, e um único
 * intermediário duplicado derrubaria a operação inteira.
 *
 * Como cada `update` é independente, uma falha no meio deixa a fila numa ordem
 * parcial — não corrompida, apenas diferente da pedida. Por isso o resultado
 * informa quantas linhas foram gravadas em vez de anunciar sucesso cego.
 */
export async function reorderParticipantsAction(input: unknown): Promise<DistributionResult> {
  const session = await getSessionContext();
  if (!assertOrgAdmin(session)) {
    return { error: "Apenas administradores da empresa configuram a distribuição." };
  }

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { error: "Ordem inválida." };

  const supabase = await createClient();

  // A regra precisa ser desta empresa: o RLS já recusaria a escrita, mas
  // conferir aqui evita disparar N updates que vão todos falhar.
  const { data: regra } = await supabase
    .from("lead_distribution_rules")
    .select("id")
    .eq("id", parsed.data.ruleId)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (!regra) return { error: "Regra não encontrada." };

  let gravadas = 0;
  for (const [indice, profileId] of parsed.data.profileIds.entries()) {
    const { data } = await supabase
      .from("lead_distribution_participants")
      .update({ position: indice })
      .eq("rule_id", parsed.data.ruleId)
      .eq("profile_id", profileId)
      .select("id")
      .maybeSingle();
    if (data) gravadas++;
  }

  if (gravadas !== parsed.data.profileIds.length) {
    console.error("[distribuicao] reordenação parcial", {
      esperadas: parsed.data.profileIds.length,
      gravadas,
    });
    revalidatePath("/distribuicao");
    return { error: "A ordem foi gravada só em parte. Confira a fila e tente novamente." };
  }

  // O CURSOR PRECISA VOLTAR AO INÍCIO.
  //
  // Ele guarda uma POSIÇÃO, e a renumeração acabou de dar outro significado a
  // cada número. Mantê-lo faria a fila retomar no lugar errado: com o cursor
  // em 2 (alguém acabou de receber) e essa pessoa movida para o topo, o
  // avanço não acha `position > 2`, dá a volta e entrega o lead seguinte para
  // ela de novo — dois seguidos, pulando os outros.
  //
  // Reiniciar é a escolha honesta: perde-se a continuidade de uma volta, uma
  // única vez, no momento em que o administrador deliberadamente mudou a
  // ordem. Traduzir a posição antiga para a nova pareceria mais esperto e
  // seria adivinhação sobre o que ele quis dizer.
  const { error: cursorError } = await supabase
    .from("lead_distribution_rules")
    .update({ queue_position: -1, queue_uses: 0 })
    .eq("id", parsed.data.ruleId)
    .eq("organization_id", session.organization.id);
  if (cursorError) {
    console.error("[distribuicao] ordem gravada, cursor não reiniciado", cursorError);
  }

  revalidatePath("/distribuicao");
  return { success: "Ordem da fila atualizada. O próximo lead vai para o primeiro da fila." };
}

const onDutySchema = z.object({
  profileId: z.string().uuid(),
  onDuty: z.boolean(),
});

/**
 * Liga e desliga o plantão de uma pessoa.
 *
 * O plantão é GLOBAL (`organization_members.on_duty`, 0017): vale para todas as
 * regras, porque quem não está trabalhando não deve receber lead de campanha
 * nenhuma. E é só o administrador que mexe — a policy de update de
 * `organization_members` já exige `is_org_admin` desde a 0003, então o banco é
 * quem recusa; a checagem daqui evita a viagem.
 *
 * Fora do plantão a pessoa é PULADA na fila, sem perder a posição dela.
 */
export async function setOnDutyAction(input: unknown): Promise<DistributionResult> {
  const session = await getSessionContext();
  if (!assertOrgAdmin(session)) {
    return { error: "Apenas administradores da empresa alteram o plantão." };
  }

  const parsed = onDutySchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .update({ on_duty: parsed.data.onDuty })
    .eq("organization_id", session.organization.id)
    .eq("profile_id", parsed.data.profileId)
    .select("profile_id")
    .maybeSingle();

  if (error || !data) {
    console.error("[distribuicao] falha ao alterar o plantão", error);
    return { error: "Não foi possível alterar o plantão." };
  }

  revalidatePath("/distribuicao");
  revalidatePath("/relatorios/vendedores");
  return {
    success: parsed.data.onDuty
      ? "Plantão ligado. A pessoa volta a receber leads na posição dela."
      : "Plantão desligado. A pessoa é pulada na fila, sem perder a posição.",
  };
}
