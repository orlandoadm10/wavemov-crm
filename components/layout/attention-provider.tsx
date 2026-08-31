"use client";

// ============================================================
// Dono dos indicadores de atenção no cliente.
//
// UM provider, UM canal Realtime por aba, UMA contagem. O badge do menu e a
// pílula do Kanban leem daqui — duas assinaturas independentes divergiriam em
// minutos, e badge que discorda de si mesma destrói a credibilidade das três.
//
// POR QUE NÃO `router.refresh()` COMO EM `/atendimento`
// Aquela tela usa refresh porque precisa da LISTA de conversas remontada pelo
// servidor, já filtrada pelo RLS da 0011. Aqui só precisamos de três números.
// Um `router.refresh()` no layout re-executaria as consultas da página
// inteira a cada mensagem recebida — o Kanban faz cinco com `limit(500)` — e,
// pior, puxaria o tapete de quem está arrastando um card no `dnd-kit`.
// Rebuscamos só o agregado, que passa pelas mesmas policies.
//
// O REALTIME É OTIMIZAÇÃO DE LATÊNCIA, NÃO FONTE DA VERDADE
// Se o WebSocket cair, o contador continua correto — só demora mais: o foco da
// janela e o intervalo reconciliam. Isso é critério de aceite, não detalhe:
// desligar o Realtime não pode quebrar o contador.
// ============================================================
import { ToastViewport, type ToastItem } from "@/components/ui/toast";
import {
  arrivedSince,
  UNKNOWN_COUNTS,
  type AttentionCounts,
  type AttentionScope,
} from "@/lib/features/notifications/domain/attention";
import {
  getAttention,
  type Attention,
} from "@/lib/features/notifications/infrastructure/attention-queries";
import { createClient } from "@/lib/supabase/client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/** Reconciliação periódica enquanto a aba está visível. */
const POLL_MS = 60_000;
/** Mesma janela do canal de `/atendimento`: uma rajada de mensagens = uma leitura. */
const DEBOUNCE_MS = 700;

const AttentionContext = createContext<AttentionCounts>(UNKNOWN_COUNTS);

/** Os três números. `null` em qualquer um significa "não sei" — badge some. */
export function useAttention(): AttentionCounts {
  return useContext(AttentionContext);
}

export function AttentionProvider({
  initial,
  scope,
  enabled,
  children,
}: {
  initial: Attention;
  scope: AttentionScope;
  /** `false` para `viewer`: ver `seesAttention`. Nem assina, nem conta. */
  enabled: boolean;
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);

  // `scope` chega como objeto novo a cada render do servidor, ou seja, a cada
  // navegação. Sem estabilizá-lo por valor, `refetch` mudaria de identidade,
  // o efeito do Realtime cairia e reassinaria o canal em toda troca de tela —
  // e eventos chegados durante a reassinatura se perderiam.
  const stableScope = useMemo<AttentionScope>(
    () => ({ profileId: scope.profileId, organizationId: scope.organizationId }),
    [scope.profileId, scope.organizationId]
  );

  const [attention, setAttention] = useState<Attention>(initial);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // O que esta aba já conhece. Semeado com o que o SERVIDOR mandou: os leads
  // que já estavam na tela quando ela abriu não são chegada, são estado.
  const conhecidos = useRef<string[]>(initial.newLeads.map((l) => l.id));

  // Quando o servidor remanda props (navegação, ou o `router.refresh()` de
  // `/atendimento`), o estado local acompanha em vez de ficar preso no valor
  // da primeira montagem.
  const initialKey = `${JSON.stringify(initial.counts)}|${initial.newLeads.map((l) => l.id).join(",")}`;
  useEffect(() => {
    setAttention(initial);
    // Não gera toast: props novas do servidor podem ser só uma navegação.
    conhecidos.current = initial.newLeads.map((l) => l.id);
    // `initialKey` resume `initial`; usar o objeto laçaria a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    const fresco = await getAttention(supabase, stableScope);
    setAttention(fresco);

    const idsAgora = fresco.newLeads.map((l) => l.id);
    const chegaram = arrivedSince(conhecidos.current, idsAgora);
    conhecidos.current = idsAgora;

    if (chegaram.length === 0) return;
    const porId = new Map(fresco.newLeads.map((l) => [l.id, l]));
    setToasts((atuais) => [
      ...atuais,
      ...chegaram.map((id) => ({
        id,
        title: "Novo lead",
        description: porId.get(id)?.title,
        href: `/negociacoes/${id}`,
      })),
    ]);
  }, [enabled, stableScope, supabase]);

  // Realtime: a mesma tabela que a 0021 publicou. Só `whatsapp_conversations`
  // — `deals` NÃO está publicada e não vamos publicá-la: ela é escrita a cada
  // arraste de card no Kanban, e todo esse WAL entraria na replicação para
  // ganhar segundos num aviso que tolera minutos.
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`atencao-${stableScope.organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_conversations",
          filter: `organization_id=eq.${stableScope.organizationId}`,
        },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void refetch(), DEBOUNCE_MS);
        }
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, stableScope.organizationId, supabase, refetch]);

  // Foco e intervalo: é o que mantém o número certo sem Realtime, e o que faz
  // "lead novo" e "tarefa vencida" chegarem. Tarefa vencida NÃO tem evento de
  // banco: ela vence pela passagem do relógio, sem nenhuma linha mudar — quem
  // propuser Realtime para isso está resolvendo o problema errado.
  useEffect(() => {
    if (!enabled) return;
    let intervalo: ReturnType<typeof setInterval> | null = null;

    const iniciar = () => {
      if (intervalo) return;
      intervalo = setInterval(() => void refetch(), POLL_MS);
    };
    const parar = () => {
      if (!intervalo) return;
      clearInterval(intervalo);
      intervalo = null;
    };

    const aoVoltar = () => {
      if (document.visibilityState !== "visible") {
        // Aba escondida não precisa de tempo real. Parar o intervalo evita
        // consultas para uma tela que ninguém está olhando.
        parar();
        return;
      }
      void refetch();
      iniciar();
    };

    if (document.visibilityState === "visible") iniciar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [enabled, refetch]);

  const dismiss = useCallback((id: string) => {
    setToasts((atuais) => atuais.filter((t) => t.id !== id));
  }, []);

  return (
    <AttentionContext.Provider value={enabled ? attention.counts : UNKNOWN_COUNTS}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </AttentionContext.Provider>
  );
}
