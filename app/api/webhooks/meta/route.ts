import { parseMetaWebhook, verifyMetaSignature } from "@/lib/features/channels/infrastructure/meta-cloud";
import { scheduleInboundFollowUp } from "@/lib/features/whatsapp-inbound/application/after-inbound";
import { ingestInboundMessage } from "@/lib/features/whatsapp-inbound/application/ingest-inbound-message";
import { secretsMatch } from "@/lib/services/webhook-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// O turno da IA roda em `after()` na mesma invocação.
export const maxDuration = 60;

// ============================================================
// /api/webhooks/meta — WhatsApp Cloud API (oficial)
//
// GET  — verificação do webhook no painel da Meta: `hub.verify_token` precisa
//        ser o `webhook_secret` de uma instância `meta_cloud` (0010). O mesmo
//        segredo que a tela de configurações mostra para o administrador.
// POST — mensagens e status. Autenticado pela assinatura
//        `X-Hub-Signature-256` (HMAC do corpo com META_APP_SECRET). A
//        organização sai do `phone_number_id` do payload, que é único por
//        instância (0027) — nunca de parâmetro controlado por quem chama.
//
// Sempre 200 depois de autenticado: a Meta reenvia em erro, e um lote com
// um número desconhecido não pode travar os outros.
// ============================================================

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";

  if (mode !== "subscribe" || !token) {
    return NextResponse.json({ error: "Requisição de verificação inválida." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: instance } = await admin
    .from("whatsapp_instances")
    .select("id, webhook_secret")
    .eq("provider", "meta_cloud")
    .eq("webhook_secret", token)
    .maybeSingle();

  if (!instance || !secretsMatch(token, instance.webhook_secret)) {
    return NextResponse.json({ error: "Token de verificação inválido." }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    // Sem META_APP_SECRET a rota recusa tudo — nunca aceita sem assinatura.
    console.warn("[meta-webhook] assinatura inválida ou META_APP_SECRET ausente");
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const admin = createAdminClient();
  const batches = parseMetaWebhook(payload);

  for (const batch of batches) {
    const { data: instance } = await admin
      .from("whatsapp_instances")
      .select("id, organization_id")
      .eq("provider", "meta_cloud")
      .eq("phone_number_id", batch.phoneNumberId)
      .maybeSingle();
    if (!instance) {
      console.warn("[meta-webhook] phone_number_id sem instância cadastrada");
      continue;
    }
    const organizationId = instance.organization_id as string;

    for (const message of batch.messages) {
      const result = await ingestInboundMessage(admin, {
        organizationId,
        instanceId: instance.id as string,
        message,
        rawPayload: batch.raw,
      });
      if (result.status === "error") {
        console.error("[meta-webhook] falha ao registrar mensagem", result.error);
        continue;
      }
      scheduleInboundFollowUp(organizationId, result);
    }

    for (const status of batch.statuses) {
      await admin
        .from("whatsapp_messages")
        .update({ delivery_status: status.status })
        .eq("organization_id", organizationId)
        .eq("provider_message_id", status.providerMessageId);
    }

    await admin
      .from("whatsapp_instances")
      .update({ status: "connected", last_connected_at: new Date().toISOString() })
      .eq("id", instance.id)
      .eq("organization_id", organizationId);
  }

  return NextResponse.json({ ok: true });
}
