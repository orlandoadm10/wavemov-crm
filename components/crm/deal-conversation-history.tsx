"use client";

import { MessageThread } from "@/components/whatsapp/message-thread";
import { Button, buttonClasses } from "@/components/ui/button";
import { useDealConversationHistory } from "@/hooks/use-deal-conversation-history";
import { cn, formatDateTime } from "@/lib/utils";
import type { WhatsAppConversation } from "@/types";
import { ArrowLeft, ExternalLink, MessageCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Props {
  organizationId: string;
  conversations: WhatsAppConversation[];
  active: boolean;
}

export function DealConversationHistory({ organizationId, conversations, active }: Props) {
  const {
    selectedId,
    selected,
    thread,
    pageSize,
    selectConversation,
    loadOlder,
    retry,
  } = useDealConversationHistory({ organizationId, conversations });
  const [mobileThreadOpen, setMobileThreadOpen] = useState(conversations.length === 1);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const lastAutoScrolledConversation = useRef<string | null>(null);

  // Cada conversa abre na mensagem mais recente. Paginar para trás não volta
  // ao fim: `lastAutoScrolledConversation` preserva a posição de leitura.
  useEffect(() => {
    if (
      !active ||
      !selectedId ||
      thread.loading ||
      thread.error ||
      thread.messages.length === 0 ||
      lastAutoScrolledConversation.current === selectedId
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      // `offsetParent` nulo indica que a guia ou o painel móvel ainda está
      // oculto; não marque como posicionado até existir uma área visível.
      if (!scrollerRef.current || scrollerRef.current.offsetParent === null) return;
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      lastAutoScrolledConversation.current = selectedId;
    });
    return () => cancelAnimationFrame(frame);
  }, [active, mobileThreadOpen, selectedId, thread.loading, thread.error, thread.messages.length]);

  if (conversations.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <MessageCircle className="mx-auto h-6 w-6 text-ink-faint" />
        <p className="mt-2 text-sm font-medium text-ink">Nenhuma conversa vinculada</p>
        <p className="mt-1 text-xs text-ink-faint">
          As conversas do WhatsApp aparecerão aqui quando forem vinculadas a este lead.
        </p>
      </div>
    );
  }

  function openConversation(conversationId: string) {
    selectConversation(conversationId);
    setMobileThreadOpen(true);
  }

  async function prependOlderMessages() {
    const previousHeight = scrollerRef.current?.scrollHeight ?? 0;
    await loadOlder();
    requestAnimationFrame(() => {
      if (scrollerRef.current) {
        scrollerRef.current.scrollTop += scrollerRef.current.scrollHeight - previousHeight;
      }
    });
  }

  return (
    <div className="grid h-[min(620px,70dvh)] min-h-[420px] md:grid-cols-[230px_1fr]">
      <div
        className={cn(
          "overflow-y-auto border-line md:border-r",
          mobileThreadOpen ? "hidden md:block" : "block"
        )}
      >
        <p className="border-b border-line px-4 py-2.5 text-xs font-semibold tracking-wide text-ink-faint uppercase">
          Conversas vinculadas
        </p>
        <ul className="divide-y divide-line">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                onClick={() => openConversation(conversation.id)}
                aria-current={conversation.id === selectedId ? "true" : undefined}
                className={cn(
                  "w-full px-4 py-3 text-left transition-colors",
                  conversation.id === selectedId ? "bg-primary-50/70" : "hover:bg-muted/50"
                )}
              >
                <p className="truncate text-sm font-semibold text-ink">
                  {conversation.name ?? `+${conversation.phone}`}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-faint">
                  {conversation.last_message ?? "Sem mensagens"}
                </p>
                {conversation.last_message_at && (
                  <p className="mt-1 text-[10px] text-ink-faint">
                    {formatDateTime(conversation.last_message_at)}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={cn("min-w-0 flex-col", mobileThreadOpen ? "flex" : "hidden md:flex")}>
        {selected && (
          <>
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <button
                type="button"
                onClick={() => setMobileThreadOpen(false)}
                className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-ink-faint hover:bg-muted md:hidden"
                aria-label="Voltar às conversas"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {selected.name ?? `+${selected.phone}`}
                </p>
                <p className="text-xs text-ink-faint">
                  {thread.total > 0 ? `${thread.total} mensagens` : `+${selected.phone}`}
                </p>
              </div>
              <Link
                href={`/atendimento?conversa=${selected.id}`}
                className={buttonClasses({ variant: "outline", size: "md" })}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Abrir no Atendimento</span>
                <span className="sm:hidden">Abrir</span>
              </Link>
            </div>

            <div
              ref={scrollerRef}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/50 p-4"
            >
              {thread.hasMore && !thread.error && (
                <div className="flex justify-center pb-2">
                  <Button variant="outline" loading={thread.loading} onClick={prependOlderMessages}>
                    Carregar mensagens anteriores
                  </Button>
                </div>
              )}

              {thread.error ? (
                <div className="py-10 text-center">
                  <p role="alert" className="text-sm text-destructive-text">
                    {thread.error}
                  </p>
                  <Button className="mt-3" variant="outline" onClick={retry}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Tentar novamente
                  </Button>
                </div>
              ) : (
                <MessageThread
                  messages={thread.messages}
                  loading={thread.loading && thread.messages.length === 0}
                  emptyMessage="Nenhuma mensagem de WhatsApp nesta conversa."
                />
              )}
            </div>

            {thread.total > pageSize && (
              <p className="border-t border-line px-4 py-2 text-center text-[10px] text-ink-faint">
                Exibindo {thread.messages.length} de {thread.total} mensagens.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
