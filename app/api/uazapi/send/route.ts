import { sendTextMessage } from "@/lib/services/uazapi";
import { getInstanceForOrg, resolveConfig } from "@/lib/services/whatsapp";
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

  // Conversa acessível ao usuário? (RLS aplica o isolamento por org)
  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("id", conversation_id)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user!.id)
    .single();

  const instance = await getInstanceForOrg(conversation.organization_id);
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
      sent_by: profile?.id ?? null,
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
    .eq("id", conversation_id);

  if (conversation.deal_id) {
    await admin.from("activity_logs").insert({
      organization_id: conversation.organization_id,
      actor_id: profile?.id ?? null,
      deal_id: conversation.deal_id,
      type: "whatsapp_outbound",
      title: "Mensagem WhatsApp enviada",
      description: content.slice(0, 200),
    });
  }

  return NextResponse.json({ ok: true, message });
}
