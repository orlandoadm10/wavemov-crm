import { normalizeWebhookMessage } from "@/lib/services/uazapi";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// ============================================================
// POST /api/webhooks/uazapi?org=<organization_id>&secret=<segredo>
//
// Recebe mensagens da UAZAPI:
// 1. Valida o segredo do webhook (UAZAPI_WEBHOOK_SECRET)
// 2. Normaliza o payload (formatos variam entre versões)
// 3. Cria/atualiza contato pelo telefone
// 4. Cria conversa se não existir
// 5. Salva a mensagem
// 6. Cria lead automático na primeira etapa do funil (inbound novo)
// 7. Registra atividade no histórico do lead
// ============================================================
export async function POST(request: Request) {
  const url = new URL(request.url);
  const secret =
    url.searchParams.get("secret") ??
    request.headers.get("x-webhook-secret") ??
    "";

  const expected = process.env.UAZAPI_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Segredo inválido." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!payload) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Organização alvo: query param `org` OU única instância cadastrada
  let organizationId = url.searchParams.get("org");
  if (!organizationId) {
    const { data: instance } = await admin
      .from("whatsapp_instances")
      .select("organization_id")
      .limit(1)
      .maybeSingle();
    organizationId = instance?.organization_id ?? null;
  }
  if (!organizationId) {
    return NextResponse.json(
      { error: "Organização não identificada. Use ?org=<id> na URL do webhook." },
      { status: 400 }
    );
  }

  const msg = normalizeWebhookMessage(payload as Record<string, never>);
  if (!msg) {
    // Evento não relacionado a mensagem (status, presença etc.) — ack silencioso
    return NextResponse.json({ ok: true, skipped: true });
  }

  const phone = msg.fromMe ? (msg.toPhone ?? msg.fromPhone) : msg.fromPhone;

  // ---------- Contato ----------
  let { data: contact } = await admin
    .from("contacts")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("whatsapp_phone", phone)
    .maybeSingle();

  if (!contact) {
    const { data: created } = await admin
      .from("contacts")
      .insert({
        organization_id: organizationId,
        name: msg.senderName ?? `WhatsApp +${phone}`,
        whatsapp_phone: phone,
        phone: `+${phone}`,
      })
      .select("id, name")
      .single();
    contact = created;
  }

  // ---------- Conversa ----------
  let { data: conversation } = await admin
    .from("whatsapp_conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .maybeSingle();

  if (!conversation) {
    const { data: instance } = await admin
      .from("whatsapp_instances")
      .select("id")
      .eq("organization_id", organizationId)
      .limit(1)
      .maybeSingle();

    const { data: created } = await admin
      .from("whatsapp_conversations")
      .insert({
        organization_id: organizationId,
        instance_id: instance?.id ?? null,
        contact_id: contact?.id ?? null,
        phone,
        name: msg.senderName ?? contact?.name ?? `+${phone}`,
        status: "open",
      })
      .select("*")
      .single();
    conversation = created;
  }

  if (!conversation) {
    return NextResponse.json({ error: "Falha ao criar conversa." }, { status: 500 });
  }

  // ---------- Lead automático (só para mensagens recebidas) ----------
  let dealId = conversation.deal_id as string | null;
  if (!dealId && !msg.fromMe) {
    const { data: openDeal } = await admin
      .from("deals")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("contact_id", contact?.id ?? "")
      .eq("status", "open")
      .limit(1)
      .maybeSingle();

    if (openDeal) {
      dealId = openDeal.id;
    } else {
      const { data: pipeline } = await admin
        .from("pipelines")
        .select("id")
        .eq("organization_id", organizationId)
        .order("created_at")
        .limit(1)
        .maybeSingle();

      if (pipeline) {
        const { data: firstStage } = await admin
          .from("pipeline_stages")
          .select("id")
          .eq("pipeline_id", pipeline.id)
          .eq("is_won_stage", false)
          .eq("is_lost_stage", false)
          .order("order_index")
          .limit(1)
          .maybeSingle();

        if (firstStage) {
          const { data: deal } = await admin
            .from("deals")
            .insert({
              organization_id: organizationId,
              pipeline_id: pipeline.id,
              stage_id: firstStage.id,
              contact_id: contact?.id ?? null,
              title: contact?.name ?? `Lead WhatsApp +${phone}`,
              source: "WhatsApp Direto",
              temperature: "warm",
              ai_status: "qualifying",
            })
            .select("id")
            .single();
          dealId = deal?.id ?? null;
        }
      }
    }

    if (dealId && !conversation.deal_id) {
      await admin
        .from("whatsapp_conversations")
        .update({ deal_id: dealId })
        .eq("id", conversation.id);
    }
  }

  // ---------- Mensagem (idempotente por provider_message_id) ----------
  const preview = msg.content ?? `[${msg.messageType}]`;

  // Idempotência: ignora mensagens já processadas
  if (msg.providerMessageId) {
    const { data: existing } = await admin
      .from("whatsapp_messages")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("provider_message_id", msg.providerMessageId)
      .maybeSingle();
    if (existing) return NextResponse.json({ ok: true, duplicate: true });
  }

  await admin.from("whatsapp_messages").insert({
    organization_id: organizationId,
    conversation_id: conversation.id,
    provider_message_id: msg.providerMessageId,
    direction: msg.fromMe ? "outbound" : "inbound",
    message_type: msg.messageType,
    content: msg.content,
    media_url: msg.mediaUrl,
    sender_phone: msg.fromMe ? null : phone,
    receiver_phone: msg.fromMe ? phone : null,
    raw_payload: payload,
  });

  await admin
    .from("whatsapp_conversations")
    .update({
      last_message: preview.slice(0, 300),
      last_message_at: new Date().toISOString(),
      status: conversation.status === "resolved" ? "open" : conversation.status,
      unread_count: msg.fromMe ? conversation.unread_count : (conversation.unread_count ?? 0) + 1,
      name: conversation.name ?? msg.senderName ?? null,
    })
    .eq("id", conversation.id);

  if (dealId && !msg.fromMe) {
    await admin.from("activity_logs").insert({
      organization_id: organizationId,
      deal_id: dealId,
      contact_id: contact?.id ?? null,
      type: "whatsapp_inbound",
      title: "Mensagem WhatsApp recebida",
      description: preview.slice(0, 200),
    });
  }

  return NextResponse.json({ ok: true });
}
