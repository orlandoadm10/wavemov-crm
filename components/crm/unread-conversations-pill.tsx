"use client";

// ============================================================
// Pílula de conversas aguardando — toolbar de `/negociacoes`.
//
// É o contador que o cliente pediu "na página do kanban". O badge do menu
// resolve o mesmo número em todas as telas; esta pílula existe porque no
// Kanban ela pode fazer o que um badge de 20px não faz: EXPLICAR o número
// ("3 conversas · 11 mensagens") e levar direto ao atendimento.
//
// POR QUE ELA NÃO SOME NO ZERO — ao contrário do badge do menu
// No menu, densidade manda e zero não desenha. Aqui não: um elemento que
// desaparece deixa quem olha sem saber se está tudo em dia ou se o recurso
// quebrou, e ainda faz o toolbar saltar de altura. "Zero" é informação;
// "ausente" é ambiguidade. Quando não há nada esperando, ela vira um estado
// neutro, sem link e sem seta.
//
// Ela NUNCA dispara `router.refresh()`. O Kanban usa `dnd-kit` com estado
// local de cards; revalidar a página no meio de um arraste puxa o tapete de
// quem está arrastando. O número vem do provider e só ele muda.
// ============================================================
import { useAttention } from "@/components/layout/attention-provider";
import { ATTENTION_LABELS } from "@/lib/features/notifications/domain/attention";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import Link from "next/link";

export function UnreadConversationsPill() {
  const { unreadConversations, unreadMessages } = useAttention();

  // `null` é "não sei" — a consulta falhou, ou o papel não vê indicador. Não
  // desenha nada: afirmar "em dia" sem ter lido seria falso conforto, o mesmo
  // defeito que o estado `unknown` da saúde da entrada existe para evitar.
  if (unreadConversations === null) return null;

  if (unreadConversations === 0) {
    return (
      <span className="flex h-8 items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 text-xs font-semibold whitespace-nowrap text-success-text">
        <Check className="h-4 w-4" aria-hidden="true" />
        {ATTENTION_LABELS.unreadEmpty}
      </span>
    );
  }

  return (
    <Link
      href="/atendimento"
      className="flex h-8 items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 text-xs font-semibold whitespace-nowrap text-primary transition-colors hover:bg-primary/15"
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      <span className="tabular-nums">
        {ATTENTION_LABELS.unread(unreadConversations, unreadMessages ?? 0)}
      </span>
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}
