import { registerFormLead } from "@/lib/features/lead-ingestion/application/register-form-lead";
import {
  extractLeadIdentity,
  findMissingRequiredField,
  sanitizeSubmission,
} from "@/lib/features/lead-ingestion/domain/form-payload";
import {
  claimIngestSubmission,
  findFormByExternalId,
  findOrganizationByIngestSecret,
  releaseIngestSubmission,
} from "@/lib/features/lead-ingestion/infrastructure/ingest-queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { externalLeadIngestSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

// ============================================================
// POST /api/ingest/leads
//
// Ingestão externa de leads (migration 0014). Quem chama é um fluxo do n8n,
// um por formulário, que adapta o payload da origem (Meta Lead Ads, RD
// Station, planilha…) a este contrato:
//
//   headers: x-webhook-secret: wmv_…
//   body:    { "form_external_id": "meta-lead-ads", "event_id": "…",
//              "data": { "name": "…", "phone": "…" } }
//
// O segredo vai no HEADER, não na query: a URL é a mesma para toda a base e
// entra em log de acesso de proxy e servidor. Quem cola a URL não precisa
// personalizá-la — só o segredo e o `form_external_id` mudam por empresa e
// por fluxo.
//
// Ordem das checagens, e o porquê de cada uma:
// 1. Segredo  → resolve a ORGANIZAÇÃO. Sem ele, 401.
// 2. Contrato → payload malformado é 400, antes de qualquer consulta.
// 3. external_id → resolve o FORMULÁRIO, em qualquer empresa.
// 4. Confere que o formulário é DA organização do segredo. É esta linha que
//    impede uma empresa autenticada de escrever na base de outra.
// 5. Reserva o evento (idempotência), e só então cria contato e negociação.
//
// A rota usa `service_role`: o RLS não protege nada aqui dentro. Toda a
// separação entre empresas é a checagem do passo 4.
// ============================================================
export async function POST(request: Request) {
  const presentedSecret = request.headers.get("x-webhook-secret") ?? "";
  if (!presentedSecret) {
    return NextResponse.json({ error: "Credencial ausente." }, { status: 401 });
  }

  const admin = createAdminClient();

  const organizationId = await findOrganizationByIngestSecret(admin, presentedSecret);
  if (!organizationId) {
    // Nunca registre o valor apresentado: o log viraria o vazamento no dia em
    // que o segredo estiver certo e a falha for outra.
    console.warn("[ingest] credencial não reconhecida");
    return NextResponse.json({ error: "Credencial inválida." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = externalLeadIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Payload inválido.",
        // O n8n não tem tela: sem o detalhe, quem monta o fluxo fica adivinhando.
        // São só nomes de campo do contrato — nada da base sai daqui.
        details: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`),
      },
      { status: 400 }
    );
  }
  const { form_external_id: externalId, event_id: eventId, data } = parsed.data;

  const form = await findFormByExternalId(admin, externalId);

  // ------------------------------------------------------------
  // A checagem de isolamento.
  //
  // Formulário inexistente, inativo e de OUTRA empresa devolvem exatamente a
  // mesma resposta, de propósito: distinguir os casos transformaria esta rota
  // num verificador de quais `external_id` existem na base — e, pior, diria
  // que um id específico pertence a outra empresa. Quem configurou errado
  // enxerga o motivo no log do servidor, não na resposta.
  // ------------------------------------------------------------
  if (!form || form.organization_id !== organizationId) {
    if (form) {
      console.warn("[ingest] external_id pertence a outra organização", {
        organizationId,
        externalId,
      });
    }
    return NextResponse.json({ error: "Formulário não encontrado." }, { status: 404 });
  }

  if (!form.pipeline_id) {
    return NextResponse.json(
      { error: "O formulário não tem funil de destino configurado no CRM." },
      { status: 409 }
    );
  }

  const clean = sanitizeSubmission(form.fields, data);
  const missing = findMissingRequiredField(form.fields, clean);
  if (missing) {
    return NextResponse.json(
      { error: `Campo obrigatório ausente: ${missing.field_key}` },
      { status: 400 }
    );
  }

  // Reserva antes de escrever qualquer outra coisa (ver claimIngestSubmission).
  const claim = await claimIngestSubmission(admin, {
    formId: form.id,
    externalEventId: eventId,
    clean,
  });

  if (claim.status === "duplicate") {
    // 200, não erro: a entrega anterior já resolveu este evento. O n8n precisa
    // marcar a execução como bem-sucedida e parar de reentregar.
    return NextResponse.json({ ok: true, duplicate: true });
  }
  if (claim.status === "error") {
    return NextResponse.json({ error: "Não foi possível registrar o evento." }, { status: 500 });
  }

  const result = await registerFormLead({
    admin,
    form,
    clean,
    identity: extractLeadIdentity(clean),
    submissionId: claim.submissionId,
    dealSource: `Integração: ${form.name}`,
  });

  if (result.error) {
    // Libera a reserva para que a retentativa do n8n possa entrar.
    await releaseIngestSubmission(admin, claim.submissionId);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Sem `deal_url` na resposta: o n8n não tem sessão no CRM e o link só
  // serviria para vazar identificadores internos para o sistema de origem.
  return NextResponse.json({ ok: true, duplicate: false });
}
