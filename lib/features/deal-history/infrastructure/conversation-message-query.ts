import { createClient } from "@/lib/supabase/client";
import type { ConversationThreadMessage } from "@/types";

export const CONVERSATION_MESSAGE_PAGE_SIZE = 50;

interface LoadConversationMessagePageInput {
  organizationId: string;
  conversationId: string;
  before?: ConversationMessageCursor | null;
}

export interface ConversationMessageCursor {
  createdAt: string;
  id: string;
}

export interface ConversationMessagePage {
  messages: ConversationThreadMessage[];
  total: number | null;
  hasMore: boolean;
  nextCursor: ConversationMessageCursor | null;
}

/**
 * Busca somente os campos necessários para a thread. `raw_payload` pode ser
 * grande e nunca deve atravessar a fronteira para o navegador sem necessidade.
 */
export async function loadConversationMessagePage({
  organizationId,
  conversationId,
  before = null,
}: LoadConversationMessagePageInput): Promise<ConversationMessagePage> {
  const supabase = createClient();
  let query = supabase
    .from("whatsapp_messages")
    .select(
      "id, organization_id, conversation_id, direction, message_type, content, media_url, sender_phone, receiver_phone, sent_by, created_at",
      { count: "exact" }
    )
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .neq("message_type", "system")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  // Cursor composto: mensagens novas não deslocam a próxima página, e o UUID
  // desempata registros criados no mesmo timestamp.
  if (before) {
    query = query.or(
      `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`
    );
  }

  const { data, error, count } = await query.limit(CONVERSATION_MESSAGE_PAGE_SIZE);

  if (error) throw error;

  const newestFirst = (data ?? []) as ConversationThreadMessage[];
  const oldest = newestFirst.at(-1) ?? null;
  const availableInThisWindow = count ?? newestFirst.length;
  return {
    messages: [...newestFirst].reverse(),
    total: before ? null : (count ?? newestFirst.length),
    hasMore: newestFirst.length < availableInThisWindow,
    nextCursor: oldest ? { createdAt: oldest.created_at, id: oldest.id } : null,
  };
}
