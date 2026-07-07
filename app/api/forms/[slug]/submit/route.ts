import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/utils";
import { publicSubmissionSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

// Submissão pública de formulário.
// Usa service role (RLS não se aplica) — por isso valida e sanitiza tudo.
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
  const data = parsed.data;

  const admin = createAdminClient();

  const { data: form } = await admin
    .from("forms")
    .select("*, fields:form_fields(*)")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!form) {
    return NextResponse.json({ error: "Formulário não encontrado." }, { status: 404 });
  }

  // Mantém apenas chaves que existem no formulário (sanitização)
  const allowedKeys = new Set((form.fields ?? []).map((f: { field_key: string }) => f.field_key));
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (allowedKeys.has(key)) clean[key] = String(value).slice(0, 2000);
  }

  // Campos obrigatórios
  for (const field of form.fields ?? []) {
    if (field.is_required && !clean[field.field_key]?.trim()) {
      return NextResponse.json(
        { error: `Campo obrigatório: ${field.label}` },
        { status: 400 }
      );
    }
  }

  const name = clean.name ?? clean.nome ?? Object.values(clean)[0] ?? "Lead sem nome";
  const email = clean.email ?? null;
  const rawPhone = clean.phone ?? clean.telefone ?? clean.whatsapp ?? null;
  const phone = rawPhone ? normalizePhone(rawPhone) : null;

  // Reutiliza contato existente pelo telefone/e-mail
  let contactId: string | null = null;
  if (phone) {
    const { data: existing } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", form.organization_id)
      .eq("whatsapp_phone", phone)
      .maybeSingle();
    contactId = existing?.id ?? null;
  }
  if (!contactId && email) {
    const { data: existing } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", form.organization_id)
      .eq("email", email)
      .maybeSingle();
    contactId = existing?.id ?? null;
  }

  if (!contactId) {
    const { data: contact, error: contactError } = await admin
      .from("contacts")
      .insert({
        organization_id: form.organization_id,
        name,
        email,
        phone: rawPhone,
        whatsapp_phone: phone,
      })
      .select("id")
      .single();
    if (contactError) {
      return NextResponse.json({ error: "Erro ao registrar contato." }, { status: 500 });
    }
    contactId = contact.id;
  }

  // Etapa destino: a configurada ou a primeira do funil
  let stageId = form.stage_id as string | null;
  if (!stageId && form.pipeline_id) {
    const { data: firstStage } = await admin
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", form.pipeline_id)
      .eq("is_won_stage", false)
      .eq("is_lost_stage", false)
      .order("order_index")
      .limit(1)
      .maybeSingle();
    stageId = firstStage?.id ?? null;
  }

  let dealId: string | null = null;
  if (form.pipeline_id && stageId) {
    const { data: deal } = await admin
      .from("deals")
      .insert({
        organization_id: form.organization_id,
        pipeline_id: form.pipeline_id,
        stage_id: stageId,
        contact_id: contactId,
        responsible_id: form.default_responsible_id,
        title: name,
        source: `Formulário: ${form.name}`,
        utm_source: clean.utm_source ?? null,
        utm_medium: clean.utm_medium ?? null,
        utm_campaign: clean.utm_campaign ?? null,
      })
      .select("id")
      .single();
    dealId = deal?.id ?? null;
  }

  await admin.from("form_submissions").insert({
    form_id: form.id,
    contact_id: contactId,
    deal_id: dealId,
    raw_data: clean,
  });

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

  return NextResponse.json({ ok: true });
}
