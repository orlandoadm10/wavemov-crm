"use server";

import { eventKeyFor, ingestSourceLead } from "@/lib/features/lead-sources/application/ingest-source-lead";
import type { InboundField } from "@/lib/features/lead-sources/domain/inbound-payload";
import { PROVIDERS } from "@/lib/features/lead-sources/domain/providers";
import {
  findSourceForOrganization,
  updateSourceEvent,
} from "@/lib/features/lead-sources/infrastructure/lead-source-queries";
import { getSessionContext } from "@/lib/services/session";
import { generateWebhookSecret } from "@/lib/services/webhook-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { describeWriteError, slugify } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type LeadSourceActionResult = { error?: string; success?: string; sourceId?: string };

const DENIED = { error: "Apenas administradores da empresa gerenciam fontes de lead." };

async function adminSession() {
  const session = await getSessionContext();
  const allowed = session.membership.role === "org_admin" || session.profile.is_global_admin;
  return allowed ? session : null;
}

function revalidate(sourceId?: string) {
  revalidatePath("/fontes");
  if (sourceId) revalidatePath(`/fontes/${sourceId}`);
}

/**
 * Campos do formulário criado junto com a fonte. Nenhum é obrigatório de
 * propósito: numa integração, obrigatório ausente é lead recusado, e o
 * cliente descobriria isso pela falta do lead. Sem nome, o lead ainda entra
 * (com o primeiro valor recebido como título) e o atendente completa.
 */
const SOURCE_FORM_FIELDS = [
  { label: "Nome", field_key: "name", field_type: "text" },
  { label: "E-mail", field_key: "email", field_type: "email" },
  { label: "WhatsApp", field_key: "phone", field_type: "phone" },
] as const;

const createSchema = z.object({
  name: z.string().trim().min(2, "Dê um nome à conexão (ex.: Typeform Plano Saúde).").max(80),
  provider: z.enum(["typeform", "webhook", "meta_lead_ads"]),
  destination: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), formId: z.string().uuid("Escolha o formulário de destino.") }),
    z.object({
      mode: z.literal("new"),
      pipelineId: z.string().uuid("Escolha o funil."),
      stageId: z.string().uuid().or(z.literal("")),
      responsibleId: z.string().uuid().or(z.literal("")),
    }),
  ]),
});

/**
 * Cria a fonte, e o formulário de destino quando pedido, e devolve o id para
 * a tela abrir o passo de teste.
 *
 * Três escritas sem transação (PostgREST não tem). Se uma falhar, as
 * anteriores são desfeitas: fonte sem token é uma conexão que a tela mostra e
 * que nunca recebe nada.
 */
export async function createLeadSourceAction(input: unknown): Promise<LeadSourceActionResult> {
  const session = await adminSession();
  if (!session) return DENIED;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { name, provider, destination } = parsed.data;
  if (!PROVIDERS[provider].available) return { error: `${PROVIDERS[provider].label} ainda não está disponível.` };

  const supabase = await createClient();
  const organizationId = session.organization.id;
  let formId: string;
  let createdFormId: string | null = null;

  if (destination.mode === "existing") {
    const { data: form } = await supabase
      .from("forms")
      .select("id")
      .eq("id", destination.formId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!form) return { error: "Formulário de destino não encontrado." };
    formId = form.id;
  } else {
    const { data: stages } = await supabase
      .from("pipeline_stages")
      .select("id, is_won_stage, is_lost_stage, pipeline:pipelines!inner(organization_id)")
      .eq("pipeline_id", destination.pipelineId)
      .eq("pipeline.organization_id", organizationId);
    const openStages = (stages ?? []).filter((s) => !s.is_won_stage && !s.is_lost_stage);
    if (!openStages.length) return { error: "O funil escolhido não tem etapa aberta para receber leads." };
    if (destination.stageId && !openStages.some((s) => s.id === destination.stageId)) {
      return { error: "A etapa escolhida não pertence ao funil." };
    }

    const { data: form, error } = await supabase
      .from("forms")
      .insert({
        organization_id: organizationId,
        name,
        slug: `${slugify(name) || "fonte"}-${Math.random().toString(36).slice(2, 8)}`,
        description: `Destino da conexão ${PROVIDERS[provider].label}.`,
        pipeline_id: destination.pipelineId,
        stage_id: destination.stageId || null,
        default_responsible_id: destination.responsibleId || null,
      })
      .select("id")
      .single();
    if (error || !form) return { error: describeWriteError(error, "Não foi possível criar o destino da conexão.") };
    formId = createdFormId = form.id;

    const { error: fieldsError } = await supabase
      .from("form_fields")
      .insert(SOURCE_FORM_FIELDS.map((f, i) => ({ ...f, form_id: form.id, is_required: false, order_index: i })));
    if (fieldsError) {
      await supabase.from("forms").delete().eq("id", form.id).eq("organization_id", organizationId);
      return { error: describeWriteError(fieldsError, "Não foi possível criar os campos do destino.") };
    }
  }

  const undoForm = async () => {
    if (createdFormId) await supabase.from("forms").delete().eq("id", createdFormId).eq("organization_id", organizationId);
  };

  const { data: source, error: sourceError } = await supabase
    .from("lead_sources")
    .insert({ organization_id: organizationId, form_id: formId, name, provider, created_by: session.profile.id })
    .select("id")
    .single();
  if (sourceError || !source) {
    await undoForm();
    return { error: describeWriteError(sourceError, "Não foi possível criar a conexão. A migration 0032 foi aplicada?") };
  }

  // O token só é gravável pelo service_role (0032).
  const { error: secretError } = await createAdminClient()
    .from("lead_source_secrets")
    .insert({ lead_source_id: source.id, organization_id: organizationId, token: generateWebhookSecret() });
  if (secretError) {
    console.error("[lead-sources] falha ao gerar o token", secretError);
    await supabase.from("lead_sources").delete().eq("id", source.id).eq("organization_id", organizationId);
    await undoForm();
    return { error: "Não foi possível gerar a URL da conexão. Tente novamente." };
  }

  revalidate();
  revalidatePath("/formularios");
  return { success: "Conexão criada.", sourceId: source.id };
}

const updateSchema = z.object({
  name: z.string().trim().min(2, "O nome precisa de ao menos 2 letras.").max(80).optional(),
  isActive: z.boolean().optional(),
});

export async function updateLeadSourceAction(sourceId: string, input: unknown): Promise<LeadSourceActionResult> {
  const session = await adminSession();
  if (!session) return DENIED;
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.isActive !== undefined) patch.is_active = parsed.data.isActive;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_sources")
    .update(patch)
    .eq("id", sourceId)
    .eq("organization_id", session.organization.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: describeWriteError(error, "Não foi possível salvar a conexão.") };

  revalidate(sourceId);
  if (parsed.data.isActive === false) return { success: "Conexão pausada. Novas entregas são recusadas até você reativar." };
  if (parsed.data.isActive === true) return { success: "Conexão reativada." };
  return { success: "Conexão salva." };
}

const mappingSchema = z.record(z.string().max(200), z.string().max(100)).refine((m) => Object.keys(m).length <= 200, {
  message: "Campos demais no mapeamento.",
});

/**
 * Grava a ligação campo recebido → campo do formulário.
 *
 * O destino é conferido contra os campos do formulário DESTA fonte: um
 * `field_key` inventado seria ignorado na entrega, mas a tela anunciaria que
 * o campo está ligado.
 */
export async function saveFieldMappingAction(sourceId: string, input: unknown): Promise<LeadSourceActionResult> {
  const session = await adminSession();
  if (!session) return DENIED;
  const parsed = mappingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Mapeamento inválido." };

  const supabase = await createClient();
  const { data: source } = await supabase
    .from("lead_sources")
    .select("id, form:forms!lead_sources_form_same_org_fkey(fields:form_fields(field_key))")
    .eq("id", sourceId)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (!source) return { error: "Conexão não encontrada." };

  const form = Array.isArray(source.form) ? source.form[0] : source.form;
  const validKeys = new Set(((form?.fields ?? []) as { field_key: string }[]).map((f) => f.field_key));
  const invalid = Object.values(parsed.data).find((target) => target && !validKeys.has(target));
  if (invalid) return { error: "Um dos campos escolhidos não existe mais no formulário. Recarregue a página." };

  const { data, error } = await supabase
    .from("lead_sources")
    .update({ field_mapping: parsed.data, updated_at: new Date().toISOString() })
    .eq("id", sourceId)
    .eq("organization_id", session.organization.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: describeWriteError(error, "Não foi possível salvar os campos.") };

  revalidate(sourceId);
  return { success: "Campos salvos. As próximas entregas já usam esta ligação." };
}

/**
 * Troca a URL da fonte. A antiga para na hora — mesma decisão da 0010 e da
 * 0014: compatibilidade paralela é caminho que ninguém remove depois.
 */
export async function rotateLeadSourceTokenAction(sourceId: string): Promise<LeadSourceActionResult> {
  const session = await adminSession();
  if (!session) return DENIED;

  const supabase = await createClient();
  const { data: source } = await supabase
    .from("lead_sources")
    .select("id")
    .eq("id", sourceId)
    .eq("organization_id", session.organization.id)
    .maybeSingle();
  if (!source) return { error: "Conexão não encontrada." };

  const { data, error } = await createAdminClient()
    .from("lead_source_secrets")
    .update({ token: generateWebhookSecret(), rotated_at: new Date().toISOString() })
    .eq("lead_source_id", sourceId)
    .eq("organization_id", session.organization.id)
    .select("lead_source_id")
    .maybeSingle();
  if (error || !data) {
    console.error("[lead-sources] falha ao trocar o token", error);
    return { error: "Não foi possível gerar a URL nova. Tente novamente." };
  }

  revalidate(sourceId);
  return { success: "URL nova gerada. Cole-a na ferramenta de origem: a antiga já não recebe." };
}

/** Apaga a conexão. O formulário de destino e os leads já criados ficam. */
export async function deleteLeadSourceAction(sourceId: string): Promise<LeadSourceActionResult> {
  const session = await adminSession();
  if (!session) return DENIED;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_sources")
    .delete()
    .eq("id", sourceId)
    .eq("organization_id", session.organization.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: describeWriteError(error, "Não foi possível excluir a conexão.") };

  revalidate();
  return { success: "Conexão excluída. Os leads que ela trouxe continuam no CRM." };
}

/**
 * Roda de novo uma entrega que falhou, com o mapeamento e o destino de agora.
 *
 * A chave do evento é a mesma da entrega original: se nesse meio-tempo a
 * origem reentregou e o lead entrou, o reprocessamento cai como duplicado em
 * vez de criar um segundo card.
 */
export async function reprocessLeadSourceEventAction(eventId: string): Promise<LeadSourceActionResult> {
  const session = await adminSession();
  if (!session) return DENIED;
  const organizationId = session.organization.id;

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("lead_source_events")
    .select("id, lead_source_id, status, event_key, fields")
    .eq("id", eventId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!event) return { error: "Entrega não encontrada." };
  if (event.status !== "failed") return { error: "Só entregas que falharam podem ser reprocessadas." };

  const admin = createAdminClient();
  const source = await findSourceForOrganization(admin, event.lead_source_id, organizationId);
  if (!source) return { error: "Conexão não encontrada." };

  const fields = (event.fields ?? []) as InboundField[];
  const eventKey = event.event_key ?? eventKeyFor(source, null, fields);
  const outcome = await ingestSourceLead(admin, source, fields, eventKey);

  const saved = await updateSourceEvent(admin, event.id, organizationId, {
    status: outcome.status,
    error: outcome.status === "duplicate" ? "Este lead já tinha entrado por outra entrega." : outcome.error,
    dealId: outcome.dealId,
    deduplicated: outcome.deduplicated,
  });

  revalidate(source.id);
  if (outcome.status === "failed") return { error: outcome.error ?? "A entrega falhou de novo." };
  if (!saved) return { success: "Lead registrado, mas o histórico da entrega não foi atualizado." };
  if (outcome.status === "duplicate") return { success: "Este lead já estava no CRM. Nada foi duplicado." };
  return { success: outcome.deduplicated ? "Entrega anexada ao lead que já existia." : "Lead criado no funil." };
}
