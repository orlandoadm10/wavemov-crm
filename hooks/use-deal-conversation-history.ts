"use client";

import {
  CONVERSATION_MESSAGE_PAGE_SIZE,
  loadConversationMessagePage,
  type ConversationMessageCursor,
} from "@/lib/features/deal-history/infrastructure/conversation-message-query";
import type { ConversationThreadMessage, WhatsAppConversation } from "@/types";
import { useEffect, useState } from "react";

export interface ConversationThreadState {
  messages: ConversationThreadMessage[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  nextCursor: ConversationMessageCursor | null;
}

const emptyThread: ConversationThreadState = {
  messages: [],
  total: 0,
  hasMore: false,
  loading: false,
  loaded: false,
  error: null,
  nextCursor: null,
};

interface Input {
  organizationId: string;
  conversations: WhatsAppConversation[];
}

export function useDealConversationHistory({ organizationId, conversations }: Input) {
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? "");
  const [threads, setThreads] = useState<Record<string, ConversationThreadState>>({});
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const thread = selected ? (threads[selected.id] ?? emptyThread) : emptyThread;

  async function fetchPage(conversationId: string, before: ConversationMessageCursor | null) {
    setThreads((previous) => {
      const current = previous[conversationId] ?? emptyThread;
      return {
        ...previous,
        [conversationId]: { ...current, loading: true, error: null },
      };
    });

    try {
      const page = await loadConversationMessagePage({ organizationId, conversationId, before });
      setThreads((previous) => {
        const current = previous[conversationId] ?? emptyThread;
        const existingIds = new Set(current.messages.map((message) => message.id));
        const olderMessages = page.messages.filter((message) => !existingIds.has(message.id));
        return {
          ...previous,
          [conversationId]: {
            messages: before ? [...olderMessages, ...current.messages] : page.messages,
            total: page.total ?? current.total,
            hasMore: page.hasMore,
            loading: false,
            loaded: true,
            error: null,
            nextCursor: page.nextCursor,
          },
        };
      });
    } catch (error) {
      console.error("Falha ao carregar histórico da conversa", {
        organizationId,
        conversationId,
        error,
      });
      setThreads((previous) => ({
        ...previous,
        [conversationId]: {
          ...(previous[conversationId] ?? emptyThread),
          loading: false,
          loaded: true,
          error: "Não foi possível carregar as mensagens desta conversa.",
        },
      }));
    }
  }

  useEffect(() => {
    if (!selectedId || !conversations.some((conversation) => conversation.id === selectedId)) return;
    const current = threads[selectedId];
    if (!current?.loaded && !current?.loading) void fetchPage(selectedId, null);
  }, [selectedId, threads, conversations]);

  useEffect(() => {
    if (conversations.some((conversation) => conversation.id === selectedId)) return;
    setSelectedId(conversations[0]?.id ?? "");
  }, [conversations, selectedId]);

  return {
    selectedId,
    selected,
    thread,
    pageSize: CONVERSATION_MESSAGE_PAGE_SIZE,
    selectConversation: setSelectedId,
    loadOlder: () => (selected ? fetchPage(selected.id, thread.nextCursor) : Promise.resolve()),
    retry: () => (selected ? fetchPage(selected.id, thread.nextCursor) : Promise.resolve()),
  };
}
