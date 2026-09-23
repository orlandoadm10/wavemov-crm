"use server";

import { TRIGGER_LABELS } from "@/lib/features/automations/domain/rules";
import { isAllowedWebhookUrl, validateActionConfig } from "@/lib/features/automations/infrastructure/action-executors";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { describeWriteError } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type AutomationActionResult = { error?: string; success?: string };

/**
 * Regras de automação — escrita pela sessão (policies da 0028 exigem
 * org_admin). As ações são validadas aqui com o MESMO contrato que o motor
 * usa para executá-las: regra salva é regra executável.
 */

const DENIED = { error: "Apenas administradores da empresa configuram automações." };

const ruleSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome à automação.").max(80),
  description: z.string().trim().max(300).nullable(),
  is_active: z.boolean(),
  trigger_event: z.enum(Object.keys(TRIGGER_LABELS) as [string, ...string[]]),
  trigger_config: z.object({
    pipeline_id: z.string().uuid().optional().or(z.literal("")),
    stage_id: z.string().uuid().optional().or(z.literal("")),
    delay_minutes: z.coerce.number().int().min(0).max(60 * 24 * 30).optional(),
    hours: z.coerce.number().min(1).max(24 * 60).optional(),
    step: z.coerce.number().int().min(1).max(10).optional(),
    only_ai: z.boolean().optional(),
  }),
  conditions: z
    .array(
      z.object({
        field: z.string().trim().min(3).max(60),
        op: z.enum(["eq", "neq", "contains"]),
        value: z.string().trim().max(200),
      })
    )
    .max(10),
  actions: z
    .array(z.object({ type: z.string(), config: z.record(z.string(), z.unknown()) }))
    .min(1, "Adicione pelo menos uma ação.")
    .max(10),
});

function isOrgAdmin(session: Awaited<ReturnType<typeof getSessionContext>>) {
  return session.membership.role === "org_admin" || session.profile.is_global_admin;
}

export async function saveRuleAction(ruleId: string | null, input: unknown): Promise<AutomationActionResult> {
  const session = await getSessionContext();
  if (!isOrgAdmin(session)) return DENIED;
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const actions = [];
  for (const [index, action] of parsed.data.actions.entries()) {
    const validated = validateActionConfig(action.type, action.config);
    if (!validated.ok) return { error: `Ação ${index + 1}: ${validated.error}` };
    if (action.type === "call_webhook" && !isAllowedWebhookUrl(String(action.config.url))) {
      return { error: `Ação ${index + 1}: endereço de webhook não permitido (rede interna).` };
    }
    actions.push({ type: action.type, config: validated.config });
  }

  // Limpa filtros vazios para o motor não comparar com "".
  const triggerConfig = Object.fromEntries(
    Object.entries(parsed.data.trigger_config).filter(([, v]) => v !== "" && v !== undefined)
  );
  if (parsed.data.trigger_event === "conversation.no_reply" && !triggerConfig.hours) {
    return { error: "Informe depois de quantas horas sem resposta o follow-up é enviado." };
  }

  const supabase = await createClient();
  const orgId = session.organization.id;
  const payload = {
    name: parsed.data.name,
    description: parsed.data.description,
    is_active: parsed.data.is_active,
    trigger_event: parsed.data.trigger_event,
    trigger_config: triggerConfig,
    conditions: parsed.data.conditions,
    actions,
  };
  const query = ruleId
    ? supabase.from("automation_rules").update(payload).eq("id", ruleId).eq("organization_id", orgId)
    : supabase
        .from("automation_rules")
        .insert({ ...payload, organization_id: orgId, created_by: session.profile.id });
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) return { error: describeWriteError(error, "Não foi possível salvar a automação.") };

  revalidatePath("/automacoes");
  return { success: ruleId ? "Automação atualizada." : "Automação criada." };
}

export async function toggleRuleAction(ruleId: string, isActive: boolean): Promise<AutomationActionResult> {
  const session = await getSessionContext();
  if (!isOrgAdmin(session)) return DENIED;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automation_rules")
    .update({ is_active: isActive })
    .eq("id", ruleId)
    .eq("organization_id", session.organization.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: describeWriteError(error, "Não foi possível alterar a automação.") };
  revalidatePath("/automacoes");
  return { success: isActive ? "Automação ativada." : "Automação pausada." };
}

export async function deleteRuleAction(ruleId: string): Promise<AutomationActionResult> {
  const session = await getSessionContext();
  if (!isOrgAdmin(session)) return DENIED;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automation_rules")
    .delete()
    .eq("id", ruleId)
    .eq("organization_id", session.organization.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: describeWriteError(error, "Não foi possível excluir a automação.") };
  revalidatePath("/automacoes");
  return { success: "Automação excluída." };
}
