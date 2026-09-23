import { sendConversationMessage } from "@/lib/features/channels/application/send-conversation-message";
import { getSessionContext } from "@/lib/services/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendMessageSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

// Envia mensagem de texto pelo canal da conversa (UAZAPI ou Meta) e registra no histórico.
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

  // `viewer` é somente leitura em todo o produto. A rota usa `service_role`
  // para falar com a UAZAPI, então o RLS não a protege: sem esta guarda, um
  // viewer manda mensagem em nome da empresa pelo endpoint, mesmo sem o
  // formulário na tela.
  if (session.membership.role === "viewer") {
    return NextResponse.json(
      { error: "Seu perfil é somente leitura e não pode enviar mensagens." },
      { status: 403 }
    );
  }

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

  // Envio, registro e histórico ficam no caso de uso único — o mesmo que a
  // IA, as automações e a API v1 usam. A instância continua sendo a MESMA
  // que recebeu a conversa (ver `sendConversationMessage`).
  const admin = createAdminClient();
  const result = await sendConversationMessage(admin, {
    organizationId: conversation.organization_id,
    conversationId: conversation_id,
    text: content,
    senderType: "user",
    sentBy: session.profile.id,
  });
  if (!result.ok) {
    const status =
      result.code === "not_configured" || result.code === "window_closed" ? 400 : 502;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }
  const message = result.message;

  // Quem responde pela tela assume a conversa: a IA para de responder até
  // alguém devolver o atendimento a ela (retomada humana).
  if (conversation.handling_mode === "ai") {
    await admin
      .from("whatsapp_conversations")
      .update({
        handling_mode: "human",
        handoff_reason: "Atendente assumiu a conversa",
        handoff_at: new Date().toISOString(),
      })
      .eq("id", conversation_id)
      .eq("organization_id", conversation.organization_id);
  }

  return NextResponse.json({ ok: true, message });
}
