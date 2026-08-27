/**
 * Caso de uso: transformar uma submissão de formulário em contato +
 * negociação no funil.
 *
 * Existe porque agora há DOIS caminhos de entrada para a mesma regra — a
 * página pública `/f/[slug]` e a ingestão externa do n8n
 * (`POST /api/ingest/leads`, migration 0014). Reuso de contato, escolha da
 * etapa de destino e registro no histórico do lead são conhecimento de
 * negócio; duplicá-los nas duas rotas garantiria que um dia elas divergissem.
 *
 * As duas rotas rodam com `service_role`, então o RLS não protege nada aqui
 * dentro: `organization_id` sai SEMPRE do formulário já resolvido, nunca de
 * dado enviado pelo chamador.
 */
import type { LeadIdentity } from "@/lib/features/lead-ingestion/domain/form-payload";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** O formulário já resolvido e conferido pelo chamador. */
export interface TargetForm {
  id: string;
  organization_id: string;
  name: string;
  pipeline_id: string | null;
  stage_id: string | null;
  default_responsible_id: string | null;
}

interface RegisterFormLeadInput {
  admin: AdminClient;
  form: TargetForm;
  clean: Record<string, string>;
  identity: LeadIdentity;
  /**
   * Submissão já gravada. É ela que dá o vínculo do lead com o payload cru —
   * e, na ingestão externa, é também a trava de idempotência, criada antes
   * de qualquer escrita para que uma reentrega não gere um lead repetido.
   */
  submissionId: string;
  /** Vai para `deals.source`, visível no lead: distingue as duas origens. */
  dealSource: string;
}

export interface RegisterFormLeadResult {
  contactId: string | null;
  dealId: string | null;
  /** Mensagem pronta para o chamador quando algo essencial falhou. */
  error: string | null;
}

/**
 * Contato existente da MESMA organização, por telefone e depois por e-mail.
 * Sem match, cria um novo.
 */
async function resolveContact(
  admin: AdminClient,
  form: TargetForm,
  identity: LeadIdentity
): Promise<{ contactId: string | null; error: string | null }> {
  if (identity.phone) {
    const { data: existing } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", form.organization_id)
      .eq("whatsapp_phone", identity.phone)
      .maybeSingle();
    if (existing?.id) return { contactId: existing.id, error: null };
  }

  if (identity.email) {
    const { data: existing } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", form.organization_id)
      .eq("email", identity.email)
      .maybeSingle();
    if (existing?.id) return { contactId: existing.id, error: null };
  }

  const { data: contact, error } = await admin
    .from("contacts")
    .insert({
      organization_id: form.organization_id,
      name: identity.name,
      email: identity.email,
      phone: identity.rawPhone,
      whatsapp_phone: identity.phone,
    })
    .select("id")
    .single();

  if (error || !contact) {
    console.error("[lead-ingestion] falha ao criar contato", error);
    return { contactId: null, error: "Erro ao registrar contato." };
  }
  return { contactId: contact.id, error: null };
}

/**
 * Etapa de destino: a configurada no formulário, senão a primeira ABERTA do
 * funil. Etapas de ganho e perda ficam de fora — lead novo nunca nasce
 * fechado. A `0013` recusa no banco qualquer etapa que não pertença ao funil,
 * então esta consulta é filtrada por `pipeline_id` e não por mais nada.
 */
async function resolveStageId(admin: AdminClient, form: TargetForm): Promise<string | null> {
  if (form.stage_id) return form.stage_id;
  if (!form.pipeline_id) return null;

  const { data: firstStage } = await admin
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline_id", form.pipeline_id)
    .eq("is_won_stage", false)
    .eq("is_lost_stage", false)
    .order("order_index")
    .limit(1)
    .maybeSingle();

  return firstStage?.id ?? null;
}

export async function registerFormLead({
  admin,
  form,
  clean,
  identity,
  submissionId,
  dealSource,
}: RegisterFormLeadInput): Promise<RegisterFormLeadResult> {
  const { contactId, error: contactError } = await resolveContact(admin, form, identity);
  if (contactError) return { contactId: null, dealId: null, error: contactError };

  const stageId = await resolveStageId(admin, form);

  let dealId: string | null = null;
  if (form.pipeline_id && stageId) {
    const { data: deal, error: dealError } = await admin
      .from("deals")
      .insert({
        organization_id: form.organization_id,
        pipeline_id: form.pipeline_id,
        stage_id: stageId,
        contact_id: contactId,
        responsible_id: form.default_responsible_id,
        title: identity.name,
        source: dealSource,
        utm_source: clean.utm_source ?? null,
        utm_medium: clean.utm_medium ?? null,
        utm_campaign: clean.utm_campaign ?? null,
      })
      .select("id")
      .single();

    // O contato já existe neste ponto. Falhar aqui é perder a negociação, não
    // o lead — por isso avisa o chamador em vez de responder "ok".
    if (dealError || !deal) {
      console.error("[lead-ingestion] falha ao criar negociação", dealError);
      return { contactId, dealId: null, error: "Erro ao registrar a negociação." };
    }
    dealId = deal.id;
  }

  // Fecha o vínculo da submissão já gravada com o que ela produziu.
  const { error: linkError } = await admin
    .from("form_submissions")
    .update({ contact_id: contactId, deal_id: dealId })
    .eq("id", submissionId);
  if (linkError) {
    // Não é motivo para recusar: contato e negociação existem e são o que o
    // usuário vê. Fica no log porque deixa a submissão órfã no relatório.
    console.error("[lead-ingestion] falha ao vincular submissão", linkError);
  }

  if (dealId) {
    await admin.from("activity_logs").insert({
      organization_id: form.organization_id,
      deal_id: dealId,
      contact_id: contactId,
      type: "form_submission",
      title: `Formulário recebido: ${form.name}`,
      metadata: clean,
    });
  }

  return { contactId, dealId, error: null };
}
