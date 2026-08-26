import { sendTextMessage } from "@/lib/services/uazapi";
import { getInstanceById, getInstanceForOrg, resolveConfig } from "@/lib/services/whatsapp";
import { getSessionContext } from "@/lib/services/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendMessageSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

// Envia mensagem de texto via UAZAPI e registra no histórico.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }
  const { conversation_id, content } = parsed.data;

  const session = await getSessionContext();

  // Organização explícita + RLS por responsável. Mesmo conhecendo um UUID de
  // outra conversa, seller/agent recebe 404 e não consegue enviar por ela.
  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("id", conversation_id)
    .eq("organization_id", session.organization.id)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  // Responde pela MESMA instância que recebeu a conversa. Uma empresa pode
  // ter mais de um atendente conectado (mais de um número): cair direto no
  // `getInstanceForOrg()`, que devolve a instância mais antiga, faria a
  // resposta sair pelo número errado. O fallback continua para conversas
  // antigas, criadas antes de a conversa passar a guardar a instância.
  const instance = conversation.instance_id
    ? ((await getInstanceById(conversation.organization_id, conversation.instance_id)) ??
      (await getInstanceForOrg(conversation.organization_id)))
    : await getInstanceForOrg(conversation.organization_id);
  const config = resolveConfig(instance);
  if (!config) {
    return NextResponse.json(
      { error: "WhatsApp não configurado. Acesse Atendimento → Configurações." },
      { status: 400 }
    );
  }

  const result = await sendTextMessage(config, conversation.phone, content);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Falha ao enviar pela UAZAPI. Verifique a conexão da instância." },
      { status: 502 }
    );
  }

  const admin = createAdminClient();
  const { data: message } = await admin
    .from("whatsapp_messages")
    .insert({
      organization_id: conversation.organization_id,
      conversation_id,
      provider_message_id: result.providerMessageId,
      direction: "outbound",
      message_type: "text",
      content,
      receiver_phone: conversation.phone,
      sent_by: session.profile.id,
      raw_payload: (result.raw as Record<string, unknown>) ?? {},
    })
    .select("*")
    .single();

  await admin
    .from("whatsapp_conversations")
    .update({
      last_message: content,
      last_message_at: new Date().toISOString(),
      status: conversation.status === "resolved" ? "open" : conversation.status,
    })
    .eq("id", conversation_id)
    .eq("organization_id", conversation.organization_id);

  if (conversation.deal_id) {
    await admin.from("activity_logs").insert({
      organization_id: conversation.organization_id,
      actor_id: session.profile.id,
      deal_id: conversation.deal_id,
      type: "whatsapp_outbound",
      title: "Mensagem WhatsApp enviada",
      description: content.slice(0, 200),
    });
  }

  return NextResponse.json({ ok: true, message });
}
