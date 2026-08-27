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
import { resolveLeadResponsible } from "@/lib/features/lead-distribution/application/resolve-lead-responsible";
import { recordDistribution } from "@/lib/features/lead-distribution/infrastructure/distribution-queries";
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
  /** Alimenta as condições das regras de distribuição (migration 0016). */
  origin: "public_form" | "external_ingest";
}

export interface RegisterFormLeadResult {
  contactId: string | null;
  dealId: string | null;
  /** A submissão caiu numa negociação que já existia, em vez de abrir outra. */
  deduplicated: boolean;
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

/**
 * Negociação ABERTA que este contato já tem, vinda do MESMO formulário.
 *
 * A mesma pessoa preenchendo o Typeform e depois clicando no anúncio do Meta é
 * o caso normal de captação paga, e cada submissão abria um card novo. Com o
 * rodízio ligado isso vira dois vendedores ligando para o mesmo telefone.
 *
 * POR QUE POR FORMULÁRIO, E NÃO POR FUNIL
 * A primeira versão casava por funil, e engolia lead legítimo: dois
 * formulários diferentes ("Plano Individual" e "Plano Empresarial") apontando
 * para o mesmo funil faziam a segunda submissão virar uma linha de histórico
 * dentro de um card que já estava em Follow-up com outro responsável. O
 * vendedor não recebia nada, e a única pista ficava dentro do card. Interesse
 * em outro produto é lead novo — a duplicata que interessa é a MESMA campanha
 * chegando duas vezes.
 *
 * Ganha, perdida e arquivada NÃO bloqueiam card novo: recompra e nova cotação
 * são leads legítimos, e tratá-los como duplicata esconderia venda.
 */
async function findOpenDeal(
  admin: AdminClient,
  form: TargetForm,
  contactId: string
): Promise<string | null> {
  if (!form.pipeline_id) return null;

  // A ligação com o formulário é a submissão anterior: `deals` não guarda
  // `form_id`, e criar essa coluna agora seria migration para um dado que já
  // é derivável.
  const { data: anteriores, error: submissoesError } = await admin
    .from("form_submissions")
    .select("deal_id")
    .eq("form_id", form.id)
    .not("deal_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (submissoesError || !anteriores?.length) {
    if (submissoesError) {
      console.error("[lead-ingestion] falha ao procurar submissões anteriores", submissoesError);
    }
    return null;
  }

  const { data, error } = await admin
    .from("deals")
    .select("id")
    .eq("organization_id", form.organization_id)
    .eq("pipeline_id", form.pipeline_id)
    .eq("contact_id", contactId)
    .eq("status", "open")
    .in(
      "id",
      anteriores.map((a) => a.deal_id as string)
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Sem duplicata detectada o fluxo segue e cria a negociação: um card a
    // mais é recuperável, um lead a menos não.
    console.error("[lead-ingestion] falha ao procurar negociação aberta", error);
    return null;
  }
  return data?.id ?? null;
}

export async function registerFormLead({
  admin,
  form,
  clean,
  identity,
  submissionId,
  dealSource,
  origin,
}: RegisterFormLeadInput): Promise<RegisterFormLeadResult> {
  const { contactId, error: contactError } = await resolveContact(admin, form, identity);
  if (contactError) {
    return { contactId: null, dealId: null, deduplicated: false, error: contactError };
  }

  const stageId = await resolveStageId(admin, form);

  // Duplicata: a submissão entra na negociação que já existe. Nada de
  // distribuir de novo — o lead já tem dono, e trocá-lo tiraria o atendimento
  // de quem já pode ter falado com a pessoa.
  const existente = contactId ? await findOpenDeal(admin, form, contactId) : null;
  if (existente) {
    await linkSubmission(admin, submissionId, contactId, existente);
    await admin.from("activity_logs").insert({
      organization_id: form.organization_id,
      deal_id: existente,
      contact_id: contactId,
      type: "form_submission",
      title: `Nova submissão do mesmo lead: ${form.name}`,
      metadata: clean,
    });
    return { contactId, dealId: existente, deduplicated: true, error: null };
  }

  let dealId: string | null = null;
  let distribuicao: Awaited<ReturnType<typeof resolveLeadResponsible>> | null = null;

  if (form.pipeline_id && stageId) {
    // Quem recebe o lead. `default_responsible_id` do formulário vence o
    // rodízio: é escolha explícita de quem configurou.
    distribuicao = await resolveLeadResponsible({
      admin,
      organizationId: form.organization_id,
      lead: { origin, formId: form.id },
      explicitResponsibleId: form.default_responsible_id,
    });

    const { data: deal, error: dealError } = await admin
      .from("deals")
      .insert({
        organization_id: form.organization_id,
        pipeline_id: form.pipeline_id,
        stage_id: stageId,
        contact_id: contactId,
        responsible_id: distribuicao.responsibleId,
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
      return { contactId, dealId: null, deduplicated: false, error: "Erro ao registrar a negociação." };
    }
    dealId = deal.id;

    // Auditoria depois da negociação existir, para amarrar o `deal_id`.
    await recordDistribution(admin, form.organization_id, dealId, distribuicao.audit);
  }

  await linkSubmission(admin, submissionId, contactId, dealId);

  if (dealId) {
    await admin.from("activity_logs").insert({
      organization_id: form.organization_id,
      deal_id: dealId,
      contact_id: contactId,
      type: "form_submission",
      title: `Formulário recebido: ${form.name}`,
      metadata: clean,
    });

    // O responsável no histórico do lead: sem isto, o vendedor vê um lead
    // aparecer na fila dele sem nenhuma explicação de por quê.
    if (distribuicao?.responsibleId && distribuicao.audit.reason === "rule_matched") {
      await admin.from("activity_logs").insert({
        organization_id: form.organization_id,
        deal_id: dealId,
        type: "lead_assigned",
        title: `Lead distribuído para ${distribuicao.audit.assignedToName ?? "responsável"}`,
        description: distribuicao.audit.ruleName
          ? `Regra: ${distribuicao.audit.ruleName}`
          : null,
      });
    }
  }

  return { contactId, dealId, deduplicated: false, error: null };
}

/** Fecha o vínculo da submissão já gravada com o que ela produziu. */
async function linkSubmission(
  admin: AdminClient,
  submissionId: string,
  contactId: string | null,
  dealId: string | null
) {
  const { error } = await admin
    .from("form_submissions")
    .update({ contact_id: contactId, deal_id: dealId })
    .eq("id", submissionId);
  if (error) {
    // Não é motivo para recusar: contato e negociação existem e são o que o
    // usuário vê. Fica no log porque deixa a submissão órfã no relatório.
    console.error("[lead-ingestion] falha ao vincular submissão", error);
  }
}
