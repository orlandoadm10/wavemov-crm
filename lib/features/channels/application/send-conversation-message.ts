// ============================================================
// Enviar uma mensagem numa conversa — o caso de uso único usado pela equipe
// (/api/uazapi/send), pelo agente de IA, pelas automações e pela API v1.
//
// Ordem deliberada:
//   1. grava a mensagem como `pending` ANTES de chamar o provedor;
//   2. envia;
//   3. confirma com o id do provedor, ou apaga a linha se o envio falhou.
//
// Por quê: a UAZAPI devolve o próprio envio como webhook `fromMe`, às vezes
// antes de a chamada de envio responder. Com a linha já gravada, o webhook
// reconhece o eco (mesmo conteúdo, pendente, recente) em vez de registrá-lo
// como "a equipe respondeu pelo celular" — o que tiraria a conversa da IA.
//
// `admin` é service_role: quem chama já autorizou o remetente; aqui a
// organização é filtrada explicitamente em toda consulta.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { getInstanceById, getInstanceForOrg } from "@/lib/services/whatsapp";
import type { MessageSenderType, WhatsAppConversation, WhatsAppMessage } from "@/types";
import {
  sendChannelTemplate,
  sendChannelText,
  type ChannelSendErrorCode,
  type TemplateMessage,
} from "../infrastructure/channel-gateway";

export interface SendConversationMessageInput {
  organizationId: string;
  conversationId: string;
  text: string;
  senderType: Exclude<MessageSenderType, "contact">;
  /** Perfil de quem enviou (equipe). Nulo para IA/automação. */
  sentBy?: string | null;
  /** Template da Meta (fora da janela de 24h). `text` vira o registro legível. */
  template?: TemplateMessage;
}

export type SendConversationMessageResult =
  | { ok: true; message: WhatsAppMessage; conversation: WhatsAppConversation }
  | { ok: false; code: ChannelSendErrorCode | "not_found" | "empty" | "db_error"; error: string };

export async function sendConversationMessage(
  admin: SupabaseClient,
  input: SendConversationMessageInput
): Promise<SendConversationMessageResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, code: "empty", error: "Mensagem vazia." };

  const { data: conversation, error: convError } = await admin
    .from("whatsapp_conversations")
    .select("*")
    .eq("id", input.conversationId)
    .eq("organization_id", input.organizationId)
    .maybeSingle<WhatsAppConversation>();
  if (convError) return { ok: false, code: "db_error", error: "Falha ao carregar a conversa." };
  if (!conversation) return { ok: false, code: "not_found", error: "Conversa não encontrada." };

  // Responde pela MESMA instância que recebeu a conversa (ver 0010/0011).
  const instance = conversation.instance_id
    ? ((await getInstanceById(input.organizationId, conversation.instance_id)) ??
      (await getInstanceForOrg(input.organizationId)))
    : await getInstanceForOrg(input.organizationId);

  const { data: pending, error: insertError } = await admin
    .from("whatsapp_messages")
    .insert({
      organization_id: input.organizationId,
      conversation_id: conversation.id,
      direction: "outbound",
      message_type: "text",
      content: text,
      receiver_phone: conversation.phone,
      sent_by: input.sentBy ?? null,
      sender_type: input.senderType,
      delivery_status: "pending",
    })
    .select("id")
    .single();
  if (insertError || !pending) {
    return { ok: false, code: "db_error", error: "Falha ao registrar a mensagem." };
  }

  const sent = input.template
    ? await sendChannelTemplate(instance, conversation.phone, input.template)
    : await sendChannelText(instance, conversation.phone, text);

  if (!sent.ok) {
    await admin
      .from("whatsapp_messages")
      .delete()
      .eq("id", pending.id)
      .eq("organization_id", input.organizationId);
    return { ok: false, code: sent.code, error: sent.error };
  }

  // Confirma a linha. Se o eco do webhook já gravou outra linha com o mesmo id
  // do provedor (corrida rara), o índice único recusa: a linha do eco é a
  // mensagem, e a pendente sai para não duplicar.
  const { data: confirmed, error: confirmError } = await admin
    .from("whatsapp_messages")
    .update({
      provider_message_id: sent.providerMessageId,
      delivery_status: "sent",
      raw_payload: (sent.raw as Record<string, unknown>) ?? {},
    })
    .eq("id", pending.id)
    .eq("organization_id", input.organizationId)
    .select("*")
    .maybeSingle<WhatsAppMessage>();

  let message = confirmed;
  if (confirmError?.code === "23505" && sent.providerMessageId) {
    await admin.from("whatsapp_messages").delete().eq("id", pending.id).eq("organization_id", input.organizationId);
    const { data: echo } = await admin
      .from("whatsapp_messages")
      .update({ sender_type: input.senderType, sent_by: input.sentBy ?? null, delivery_status: "sent" })
      .eq("organization_id", input.organizationId)
      .eq("conversation_id", conversation.id)
      .eq("provider_message_id", sent.providerMessageId)
      .select("*")
      .maybeSingle<WhatsAppMessage>();
    message = echo;
  }
  if (!message) {
    return { ok: false, code: "db_error", error: "Mensagem enviada, mas o registro não foi confirmado." };
  }

  const { data: updatedConversation } = await admin
    .from("whatsapp_conversations")
    .update({
      last_message: text.slice(0, 300),
      last_message_at: new Date().toISOString(),
      status: conversation.status === "resolved" ? "open" : conversation.status,
    })
    .eq("id", conversation.id)
    .eq("organization_id", input.organizationId)
    .select("*")
    .maybeSingle<WhatsAppConversation>();

  if (conversation.deal_id && input.senderType === "user") {
    await admin.from("activity_logs").insert({
      organization_id: input.organizationId,
      actor_id: input.sentBy ?? null,
      deal_id: conversation.deal_id,
      type: "whatsapp_outbound",
      title: "Mensagem WhatsApp enviada",
      description: text.slice(0, 200),
    });
  }

  return { ok: true, message, conversation: updatedConversation ?? conversation };
}
