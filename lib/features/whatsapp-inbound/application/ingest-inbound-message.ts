// ============================================================
// Registrar uma mensagem de WhatsApp que chegou por qualquer canal
// (UAZAPI ou Meta Cloud API). Extraído de `app/api/webhooks/uazapi/route.ts`
// para os dois webhooks compartilharem UMA regra de contato, conversa, lead
// e histórico — duas cópias divergiriam na primeira correção.
//
// Quem chama já AUTENTICOU a origem e resolveu `organizationId` e
// `instanceId` de fonte confiável (segredo da instância / assinatura da
// Meta). Tudo aqui usa service_role, então todo filtro de organização é
// explícito.
//
// Passos:
// 1. contato pelo telefone (sem duplicar — ver a história da 0024 abaixo)
// 2. conversa por (organização, instância, telefone)
// 3. lead automático na primeira etapa do funil padrão (inbound novo)
// 4. mensagem (idempotente pelo id do provedor; reconhece o eco do próprio envio)
// 5. atividade no histórico do lead
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLeadResponsible } from "@/lib/features/lead-distribution/application/resolve-lead-responsible";
import { recordDistribution } from "@/lib/features/lead-distribution/infrastructure/distribution-queries";
import { isPlaceholderName, leadNameFromMessage } from "@/lib/features/whatsapp-inbound/domain/lead-name";
import type { NormalizedInboundMessage } from "@/lib/services/uazapi";
import type { HandlingMode } from "@/types";

export interface IngestInboundInput {
  organizationId: string;
  instanceId: string | null;
  message: NormalizedInboundMessage;
  rawPayload: Record<string, unknown>;
}

export type IngestInboundResult =
  | {
      status: "ok" | "duplicate";
      conversationId: string;
      dealId: string | null;
      contactId: string;
      fromMe: boolean;
      handlingMode: HandlingMode;
      aiAgentId: string | null;
    }
  | { status: "error"; httpStatus: number; error: string };

type ContactRow = { id: string; name: string | null };
type ConversationRow = {
  id: string;
  deal_id: string | null;
  status: string;
  unread_count: number | null;
  name: string | null;
  handling_mode: HandlingMode | null;
  ai_agent_id: string | null;
};

const CONVERSATION_COLUMNS =
  "id, deal_id, status, unread_count, name, handling_mode, ai_agent_id";

/** Janela em que um `fromMe` idêntico a um envio pendente é o eco dele. */
const ECHO_WINDOW_MS = 3 * 60 * 1000;

export async function ingestInboundMessage(
  admin: SupabaseClient,
  input: IngestInboundInput
): Promise<IngestInboundResult> {
  const { organizationId, instanceId, message: msg } = input;
  const phone = msg.fromMe ? (msg.toPhone ?? msg.fromPhone) : msg.fromPhone;

  // Nunca o `senderName` cru: numa mensagem `fromMe` ele é o nome do DONO do
  // número, e o lead nascia com ele (ver `domain/lead-name.ts`).
  const leadName = leadNameFromMessage(msg);

  const contact = await findOrCreateContact(admin, organizationId, phone, leadName);
  if (!contact) {
    // Seguir sem contato gravaria conversa e lead órfãos — o estado que o
    // reparo de dados NÃO consegue desfazer, porque não sobra telefone para
    // reconciliar depois.
    return { status: "error", httpStatus: 500, error: "Falha ao registrar o contato." };
  }

  const conversation = await findOrCreateConversation(admin, {
    organizationId,
    instanceId,
    phone,
    contact,
    senderName: leadName,
  });
  if (!conversation) {
    return { status: "error", httpStatus: 500, error: "Falha ao criar conversa." };
  }

  // Contato que nasceu sem nome (ou com placeholder) ganha o nome do lead na
  // primeira mensagem dele. Nome digitado pela equipe nunca é substituído.
  if (leadName && isPlaceholderName(contact.name)) {
    await adoptLeadName(admin, organizationId, contact, conversation, leadName);
  }

  const dealId = msg.fromMe
    ? conversation.deal_id
    : await ensureLeadForConversation(admin, organizationId, conversation, contact, phone);

  const base = {
    conversationId: conversation.id,
    dealId,
    contactId: contact.id,
    fromMe: msg.fromMe,
    handlingMode: (conversation.handling_mode ?? "human") as HandlingMode,
    aiAgentId: conversation.ai_agent_id,
  };

  // ---------- Idempotência pelo id do provedor ----------
  if (msg.providerMessageId) {
    const { data: existing } = await admin
      .from("whatsapp_messages")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("conversation_id", conversation.id)
      .eq("provider_message_id", msg.providerMessageId)
      .maybeSingle();
    if (existing) return { status: "duplicate", ...base };
  }

  // ---------- Eco do nosso próprio envio (UAZAPI devolve `fromMe`) ----------
  if (msg.fromMe && (await claimOwnEcho(admin, organizationId, conversation.id, msg))) {
    return { status: "duplicate", ...base };
  }

  const preview = msg.content ?? `[${msg.messageType}]`;

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
    raw_payload: input.rawPayload,
    // `fromMe` que não é eco nosso = alguém da equipe respondeu pelo celular.
    sender_type: msg.fromMe ? "user" : "contact",
    delivery_status: msg.fromMe ? "sent" : null,
  });

  let handlingMode = base.handlingMode;
  const conversationPatch: Record<string, unknown> = {
    last_message: preview.slice(0, 300),
    last_message_at: new Date().toISOString(),
    status: conversation.status === "resolved" ? "open" : conversation.status,
    unread_count: msg.fromMe ? conversation.unread_count : (conversation.unread_count ?? 0) + 1,
    name: conversation.name ?? leadName ?? null,
  };
  // Retomada humana: a equipe respondeu pelo celular numa conversa da IA.
  // A IA sai de cena; quem quiser devolve pela tela do atendimento.
  if (msg.fromMe && handlingMode === "ai") {
    handlingMode = "human";
    conversationPatch.handling_mode = "human";
    conversationPatch.handoff_reason = "Equipe respondeu pelo celular";
    conversationPatch.handoff_at = new Date().toISOString();
  }

  await admin
    .from("whatsapp_conversations")
    .update(conversationPatch)
    .eq("id", conversation.id)
    .eq("organization_id", organizationId);

  if (dealId && !msg.fromMe) {
    await admin.from("activity_logs").insert({
      organization_id: organizationId,
      deal_id: dealId,
      contact_id: contact.id,
      type: "whatsapp_inbound",
      title: "Mensagem WhatsApp recebida",
      description: preview.slice(0, 200),
    });
  }

  return { status: "ok", ...base, handlingMode };
}

// ------------------------------------------------------------
// Contato
//
// AQUI NASCEU O PIOR DEFEITO DE DADOS QUE ESTE PROJETO TEVE: 246 contatos
// para 59 telefones. `maybeSingle()` falha com mais de uma linha, o erro era
// descartado e cada mensagem criava mais um contato. A `0024` deu unicidade a
// (organization_id, whatsapp_phone); por isso:
// - `limit(1)` + `order(created_at)`: nunca erra por multiplicidade e escolhe
//   sempre o mesmo contato;
// - sem `upsert`: sobrescreveria o nome corrigido à mão pelo vendedor;
// - 23505 no insert = corrida perdida; reconsulta e usa a linha vencedora.
// ------------------------------------------------------------
async function findOrCreateContact(
  admin: SupabaseClient,
  organizationId: string,
  phone: string,
  senderName: string | null
): Promise<ContactRow | null> {
  const lookup = () =>
    admin
      .from("contacts")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("whatsapp_phone", phone)
      .order("created_at", { ascending: true })
      .limit(1);

  const { data: found, error: lookupError } = await lookup();
  if (lookupError) {
    console.error("[whatsapp-inbound] falha ao procurar o contato", lookupError);
    return null;
  }
  const existing = (found?.[0] as ContactRow | undefined) ?? null;
  if (existing) return existing;

  const { data: created, error: createError } = await admin
    .from("contacts")
    .insert({
      organization_id: organizationId,
      name: senderName ?? `WhatsApp +${phone}`,
      whatsapp_phone: phone,
      phone: `+${phone}`,
    })
    .select("id, name")
    .single();

  if (!createError) return created as ContactRow;
  if (createError.code === "23505") {
    const { data: winner } = await lookup();
    return (winner?.[0] as ContactRow | undefined) ?? null;
  }
  console.error("[whatsapp-inbound] falha ao criar o contato", createError);
  return null;
}

// ------------------------------------------------------------
// Conversa
// ------------------------------------------------------------
async function findOrCreateConversation(
  admin: SupabaseClient,
  args: {
    organizationId: string;
    instanceId: string | null;
    phone: string;
    contact: ContactRow;
    senderName: string | null;
  }
): Promise<ConversationRow | null> {
  const { organizationId, instanceId, phone, contact } = args;

  let query = admin
    .from("whatsapp_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("phone", phone);
  query = instanceId ? query.eq("instance_id", instanceId) : query.is("instance_id", null);
  const { data: current } = await query.maybeSingle<ConversationRow>();
  if (current) return current;

  // Conversas anteriores à 0010 não guardavam a instância: reaproveita a
  // única linha legada e a vincula à instância autenticada.
  if (instanceId) {
    const { data: legacy } = await admin
      .from("whatsapp_conversations")
      .select("id")
      .eq("organization_id", organizationId)
      .is("instance_id", null)
      .eq("phone", phone)
      .maybeSingle();
    if (legacy) {
      const { data: migrated } = await admin
        .from("whatsapp_conversations")
        .update({ instance_id: instanceId })
        .eq("id", legacy.id)
        .eq("organization_id", organizationId)
        .select(CONVERSATION_COLUMNS)
        .single<ConversationRow>();
      if (migrated) return migrated;
    }
  }

  // Conversa nova: começa com a IA quando a empresa tem um agente padrão
  // ativo configurado para assumir conversas novas.
  const { data: agent } = await admin
    .from("ai_agents")
    .select("id, auto_reply_new_conversations")
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();
  const startsWithAi = Boolean(agent?.auto_reply_new_conversations);

  const { data: created } = await admin
    .from("whatsapp_conversations")
    .insert({
      organization_id: organizationId,
      // A instância vem do segredo/assinatura que autenticou a requisição.
      instance_id: instanceId,
      contact_id: contact.id,
      phone,
      name: args.senderName ?? contact.name ?? `+${phone}`,
      status: "open",
      handling_mode: startsWithAi ? "ai" : "human",
      ai_agent_id: startsWithAi ? agent?.id ?? null : null,
    })
    .select(CONVERSATION_COLUMNS)
    .single<ConversationRow>();
  return created ?? null;
}

// ------------------------------------------------------------
// Nome do lead que chegou depois do contato
//
// Troca SÓ o que é placeholder: o contato (já filtrado por quem chama), o
// nome da conversa e o título das negociações abertas desse contato que
// ainda estejam vazios ou com o nome antigo. Muta `contact`/`conversation`
// para o resto do fluxo (criação do lead) já usar o nome certo.
// ------------------------------------------------------------
async function adoptLeadName(
  admin: SupabaseClient,
  organizationId: string,
  contact: ContactRow,
  conversation: ConversationRow,
  leadName: string
) {
  const previous = contact.name?.trim() ?? "";
  const { error } = await admin
    .from("contacts")
    .update({ name: leadName })
    .eq("id", contact.id)
    .eq("organization_id", organizationId);
  if (error) {
    console.error("[whatsapp-inbound] falha ao dar nome ao contato", error);
    return;
  }
  contact.name = leadName;

  if (isPlaceholderName(conversation.name)) {
    await admin
      .from("whatsapp_conversations")
      .update({ name: leadName })
      .eq("id", conversation.id)
      .eq("organization_id", organizationId);
    conversation.name = leadName;
  }

  const titles = previous ? ["", previous] : [""];
  await admin
    .from("deals")
    .update({ title: leadName })
    .eq("organization_id", organizationId)
    .eq("contact_id", contact.id)
    .eq("status", "open")
    .in("title", titles);
}

// ------------------------------------------------------------
// Lead automático (só para mensagens recebidas)
// ------------------------------------------------------------
async function ensureLeadForConversation(
  admin: SupabaseClient,
  organizationId: string,
  conversation: ConversationRow,
  contact: ContactRow,
  phone: string
): Promise<string | null> {
  if (conversation.deal_id) return conversation.deal_id;

  let dealId: string | null = null;
  const { data: openDeal } = await admin
    .from("deals")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contact.id)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  if (openDeal) {
    dealId = openDeal.id;
  } else {
    // Funil padrão explícito (migration 0012).
    const { data: pipeline } = await admin
      .from("pipelines")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_default", true)
      .maybeSingle();
    if (!pipeline) {
      console.error("[whatsapp-inbound] organização sem funil padrão", { organizationId });
      return null;
    }

    const { data: firstStage } = await admin
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", pipeline.id)
      .eq("is_won_stage", false)
      .eq("is_lost_stage", false)
      .order("order_index")
      .limit(1)
      .maybeSingle();
    if (!firstStage) return null;

    // Quem atende este lead (migration 0016). Sem responsável o lead ficaria
    // invisível para seller/agent pela policy da 0011.
    const distribuicao = await resolveLeadResponsible({
      admin,
      organizationId,
      lead: { origin: "whatsapp", formId: null },
    });

    const { data: deal, error: dealError } = await admin
      .from("deals")
      .insert({
        organization_id: organizationId,
        pipeline_id: pipeline.id,
        stage_id: firstStage.id,
        contact_id: contact.id,
        responsible_id: distribuicao.responsibleId,
        title: contact.name ?? `Lead WhatsApp +${phone}`,
        source: "WhatsApp Direto",
        temperature: "warm",
        ai_status: conversation.handling_mode === "ai" ? "qualifying" : "none",
      })
      .select("id")
      .single();
    if (dealError) console.error("[whatsapp-inbound] falha ao criar lead da conversa", dealError);
    dealId = deal?.id ?? null;

    if (dealId) {
      await recordDistribution(admin, organizationId, dealId, distribuicao.audit);
      if (distribuicao.responsibleId && distribuicao.audit.reason === "rule_matched") {
        await admin.from("activity_logs").insert({
          organization_id: organizationId,
          deal_id: dealId,
          type: "lead_assigned",
          title: `Lead distribuído para ${distribuicao.audit.assignedToName ?? "responsável"}`,
          description: distribuicao.audit.ruleName ? `Regra: ${distribuicao.audit.ruleName}` : null,
        });
      }
    }
  }

  if (dealId) {
    await admin
      .from("whatsapp_conversations")
      .update({ deal_id: dealId })
      .eq("id", conversation.id)
      .eq("organization_id", organizationId);
  }
  return dealId;
}

// ------------------------------------------------------------
// Eco do próprio envio
// ------------------------------------------------------------
async function claimOwnEcho(
  admin: SupabaseClient,
  organizationId: string,
  conversationId: string,
  msg: NormalizedInboundMessage
): Promise<boolean> {
  if (!msg.content) return false;
  const since = new Date(Date.now() - ECHO_WINDOW_MS).toISOString();
  const { data: pending } = await admin
    .from("whatsapp_messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .eq("content", msg.content)
    .is("provider_message_id", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = pending?.[0];
  if (!row) return false;

  if (msg.providerMessageId) {
    await admin
      .from("whatsapp_messages")
      .update({ provider_message_id: msg.providerMessageId, delivery_status: "sent" })
      .eq("id", row.id)
      .eq("organization_id", organizationId);
  }
  return true;
}
