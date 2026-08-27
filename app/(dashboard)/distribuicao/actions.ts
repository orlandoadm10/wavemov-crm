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
  const { data, error } = await supabase
    .from("lead_distribution_participants")
    .upsert(
      {
        rule_id: parsed.data.ruleId,
        profile_id: parsed.data.profileId,
        weight: parsed.data.weight,
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
