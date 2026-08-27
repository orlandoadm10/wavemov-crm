import { registerFormLead } from "@/lib/features/lead-ingestion/application/register-form-lead";
import {
  extractLeadIdentity,
  findMissingRequiredField,
  sanitizeSubmission,
} from "@/lib/features/lead-ingestion/domain/form-payload";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicSubmissionSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

// Submissão pública de formulário.
// Usa service role (RLS não se aplica) — por isso valida e sanitiza tudo.
//
// A partir da 0014 esta rota compartilha com `POST /api/ingest/leads` a
// leitura do payload e a criação de contato + negociação. O que ela mantém de
// próprio é só o que é dela: o slug público como forma de encontrar o
// formulário e as mensagens de erro dirigidas a quem está preenchendo a
// página — o `label` do campo, não a chave técnica.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await request.json().catch(() => null);

  const parsed = publicSubmissionSchema.safeParse(body?.data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: form } = await admin
    .from("forms")
    .select(
      "id, organization_id, name, pipeline_id, stage_id, default_responsible_id, fields:form_fields(label, field_key, is_required)"
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!form) {
    return NextResponse.json({ error: "Formulário não encontrado." }, { status: 404 });
  }

  const fields = form.fields ?? [];
  const clean = sanitizeSubmission(fields, parsed.data);

  const missing = findMissingRequiredField(fields, clean);
  if (missing) {
    return NextResponse.json({ error: `Campo obrigatório: ${missing.label}` }, { status: 400 });
  }

  // A submissão é gravada antes de contato e negociação: se a criação do lead
  // falhar, o que a pessoa digitou continua na base em vez de se perder.
  // `source` cai no default `public_form` da 0014 e `external_event_id` fica
  // nulo — o índice de idempotência é parcial e não alcança esta rota.
  const { data: submission, error: submissionError } = await admin
    .from("form_submissions")
    .insert({ form_id: form.id, raw_data: clean })
    .select("id")
    .single();

  if (submissionError || !submission) {
    console.error("[form-submit] falha ao gravar submissão", submissionError);
    return NextResponse.json({ error: "Não foi possível enviar agora." }, { status: 500 });
  }

  const result = await registerFormLead({
    admin,
    form,
    clean,
    identity: extractLeadIdentity(clean),
    submissionId: submission.id,
    dealSource: `Formulário: ${form.name}`,
    origin: "public_form",
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
