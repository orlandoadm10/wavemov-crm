"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { DealTagsSelector } from "@/components/crm/deal-tags-selector";
import type { PublicInstance } from "@/lib/services/whatsapp";
import { createClient } from "@/lib/supabase/client";
import {
  cn,
  describeWriteError,
  firstOpenStage,
  formatCurrency,
  formatDateTime,
  fullName,
  normalizePhone,
} from "@/lib/utils";
import type {
  Contact,
  Deal,
  DealTag,
  Pipeline,
  Profile,
  QuickReply,
  WhatsAppConversation,
  WhatsAppMessage,
} from "@/types";
import { DealStagePicker } from "@/components/whatsapp/deal-stage-picker";
import { LeadInfoPanel } from "@/components/whatsapp/lead-info-panel";
import { MessageThread } from "@/components/whatsapp/message-thread";
import {
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  ExternalLink,
  Handshake,
  Info,
  Link2,
  MessageCircle,
  Phone,
  Search,
  Send,
  Settings,
  StickyNote,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Filter = "all" | "unread" | "open" | "mine" | "unassigned";

/**
 * Quantas mensagens a conversa aberta carrega.
 *
 * São as ÚLTIMAS deste total, não as primeiras — ver o comentário em
 * `loadMessages`. O pedido do cliente era "pelo menos as 20 últimas"; a janela
 * é bem maior porque o custo por mensagem é baixo e o atendente costuma rolar
 * para trás para lembrar do combinado. O contêiner da thread já rola sozinho
 * (`overflow-y-auto`), então a janela maior não empurra nada para fora da tela.
 */
const CONVERSATION_WINDOW = 500;

interface Props {
  organizationId: string;
  profileId: string;
  canViewAllConversations: boolean;
  /** viewer é somente leitura: vê o funil/etapa do lead, mas não move. */
  canManageDeal: boolean;
  instance: PublicInstance;
  conversations: WhatsAppConversation[];
  quickReplies: QuickReply[];
  members: Profile[];
  /** Negociações abertas — alimentam "Vincular a lead existente". */
  deals: Deal[];
  /** Leads já vinculados a conversas que não estão em `deals` (fechados). */
  linkedDeals: Deal[];
  tags: DealTag[];
  tagsError: string | null;
  pipelines: Pipeline[];
  initialConversationId?: string;
  initialPhone?: string;
}

export function WhatsAppClient({
  organizationId,
  profileId,
  canViewAllConversations,
  canManageDeal,
  instance,
  conversations,
  quickReplies,
  members,
  deals,
  linkedDeals,
  tags,
  tagsError,
  pipelines,
  initialConversationId,
  initialPhone,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversationId ??
      (initialPhone
        ? conversations.find((c) => c.phone === normalizePhone(initialPhone))?.id ?? null
        : null)
  );
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [linkDealId, setLinkDealId] = useState("");
  const [creatingLead, setCreatingLead] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [dealError, setDealError] = useState<string | null>(null);
  // Falha de uma movimentação que terminou depois de o vendedor já ter trocado
  // de conversa. Não é limpa na troca — é justamente ela que o aviso relata.
  const [detachedError, setDetachedError] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "chat" | "info">(
    selectedId ? "chat" : "list"
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "unread" && c.unread_count === 0) return false;
      if (filter === "open" && c.status !== "open") return false;
      if (filter === "mine" && c.assigned_to !== profileId) return false;
      if (filter === "unassigned" && c.assigned_to) return false;
      if (q && !(c.name ?? "").toLowerCase().includes(q) && !c.phone.includes(q)) return false;
      return true;
    });
  }, [conversations, search, filter, profileId]);

  useEffect(() => {
    if (!canViewAllConversations && (filter === "mine" || filter === "unassigned")) {
      setFilter("all");
    }
  }, [canViewAllConversations, filter]);

  // Carrega mensagens da conversa selecionada
  const loadMessages = useCallback(
    async (conversationId: string) => {
      setLoadingMessages(true);
      // ORDEM DESCENDENTE + reverse, e não ascendente.
      //
      // `.order(asc).limit(500)` trazia as 500 mensagens MAIS ANTIGAS da
      // conversa: passando disso, o atendente abria a conversa e lia o começo
      // dela, sem nunca ver o que acabou de chegar. O `limit` do Postgres corta
      // depois de ordenar, então a única forma de pegar as últimas é ordenar da
      // mais nova para a mais velha e inverter aqui para exibir.
      const { data, error: messagesError } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(CONVERSATION_WINDOW);
      if (messagesError) {
        console.error("[atendimento] falha ao carregar mensagens", messagesError);
      }
      setMessages([...((data ?? []) as WhatsAppMessage[])].reverse());
      setLoadingMessages(false);
      // Zera não lidas. `viewer` não escreve: a policy recusaria e cada
      // conversa aberta por ele viraria um 403 no log.
      if (!canManageDeal) return;
      await supabase
        .from("whatsapp_conversations")
        .update({ unread_count: 0 })
        .eq("id", conversationId)
        .eq("organization_id", organizationId);
    },
    [organizationId, supabase, canManageDeal]
  );

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  // Mensagem de erro é da conversa em que aconteceu: sem isto, o aviso de uma
  // conversa reaparece ao abrir a próxima.
  useEffect(() => {
    setDealError(null);
    setLinkError(null);
  }, [selectedId]);

  // Realtime: novas mensagens da conversa aberta
  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase
      .channel(`wa-${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === (payload.new as WhatsAppMessage).id)
              ? prev
              : [...prev, payload.new as WhatsAppMessage]
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId, supabase]);

  // Realtime: a LISTA lateral. O canal acima cobre só a conversa aberta — sem
  // este, mensagem que chega em qualquer outra conversa não move nada na tela:
  // nem o não lido, nem a ordem, nem a conversa nova que acabou de existir.
  //
  // `router.refresh()` em vez de espelhar a linha em estado local. A lista vem
  // do Server Component já ordenada, já filtrada pelo RLS e com os campos que
  // a tela usa; remontá-la no cliente seria reimplementar a visibilidade por
  // responsável da 0011, e errar nela mostra a conversa de um vendedor para
  // outro. O refresh preserva o rascunho e a conversa aberta — é o mesmo
  // caminho que as ações desta tela já usam.
  //
  // O debounce existe porque cada mensagem gera INSERT em `whatsapp_messages`
  // e UPDATE em `whatsapp_conversations` quase juntos: numa rajada, seria um
  // refresh por evento.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`wa-conversas-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_conversations",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), 700);
        }
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [organizationId, supabase, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    if (!draft.trim() || !selected) return;
    setSending(true);
    setSendError(null);

    const res = await fetch("/api/uazapi/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: selected.id, content: draft.trim() }),
    });

    setSending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setSendError(body?.error ?? "Falha ao enviar mensagem.");
      return;
    }
    const body = await res.json();
    if (body.message) {
      setMessages((prev) =>
        prev.some((m) => m.id === body.message.id) ? prev : [...prev, body.message]
      );
    }
    setDraft("");
    router.refresh();
  }

  async function linkToDeal() {
    if (!selected || !linkDealId) return;
    setLinking(true);
    setLinkError(null);
    const { data: updated, error: err } = await supabase
      .from("whatsapp_conversations")
      .update({ deal_id: linkDealId })
      .eq("id", selected.id)
      .eq("organization_id", organizationId)
      .select("id");
    setLinking(false);
    if (err || (updated ?? []).length === 0) {
      // A mensagem mora dentro do modal: no painel de trás ela ficaria coberta
      // pelo overlay e o vendedor clicaria de novo achando que travou.
      setLinkError(describeWriteError(err, "Não foi possível vincular a conversa a esta negociação."));
      return;
    }
    setLinkOpen(false);
    router.refresh();
  }

  async function createLeadFromConversation() {
    if (!selected) return;
    setCreatingLead(true);
    setDealError(null);

    // Funil padrão explícito (migration 0012) em vez de "o mais antigo por
    // created_at", que mudava de significado ao surgir um segundo funil.
    const pipeline = pipelines.find((p) => p.is_default) ?? null;
    const stage = firstOpenStage(pipeline?.stages);
    if (!pipeline || !stage) {
      setCreatingLead(false);
      setDealError(
        pipeline
          ? `O funil padrão "${pipeline.name}" não tem etapa aberta. Configure em Etapas do funil.`
          : "Nenhum funil padrão configurado para esta empresa."
      );
      return;
    }

    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .insert({
        organization_id: organizationId,
        pipeline_id: pipeline.id,
        stage_id: stage.id,
        contact_id: selected.contact_id,
        responsible_id: profileId,
        title: selected.name ?? `Lead WhatsApp +${selected.phone}`,
        source: "WhatsApp Direto",
        temperature: "warm",
      })
      .select("id")
      .single();

    if (dealErr || !deal) {
      setCreatingLead(false);
      setDealError(describeWriteError(dealErr, "Não foi possível criar o lead desta conversa."));
      return;
    }

    const { data: linked, error: linkErr } = await supabase
      .from("whatsapp_conversations")
      .update({ deal_id: deal.id })
      .eq("id", selected.id)
      .eq("organization_id", organizationId)
      .select("id");

    setCreatingLead(false);

    if (linkErr || (linked ?? []).length === 0) {
      // O lead existe: diga o que de fato ficou no banco em vez de sugerir
      // que nada aconteceu — repetir o clique criaria um segundo lead.
      setDealError(
        describeWriteError(
          linkErr,
          "O lead foi criado, mas não ficou vinculado a esta conversa. Use “Vincular a lead existente”."
        )
      );
      router.refresh();
      return;
    }

    // A primeira etapa também abre o histórico: sem esta linha o lead entra no
    // relatório de retenção sem a entrada inicial, ao contrário de todo lead
    // movido pelo Kanban, pelo detalhe ou pelo seletor do atendimento.
    const [{ error: logErr }, { error: histErr }] = await Promise.all([
      supabase.from("activity_logs").insert({
        organization_id: organizationId,
        actor_id: profileId,
        deal_id: deal.id,
        type: "deal_created",
        title: "Lead criado a partir do atendimento",
        metadata: { origem: "atendimento", conversation_id: selected.id },
      }),
      supabase.from("deal_stage_history").insert({
        deal_id: deal.id,
        from_stage_id: null,
        to_stage_id: stage.id,
        changed_by: profileId,
      }),
    ]);
    if (logErr) console.error("Falha ao gravar activity_logs", logErr);
    if (histErr) console.error("Falha ao gravar deal_stage_history", histErr);

    // O vendedor continua na conversa: o pedido era mover o lead sem sair do
    // chat, e o link para a negociação fica logo acima.
    router.refresh();
  }

  async function transfer() {
    if (!selected || !transferTo) return;
    setTransferring(true);
    setTransferError(null);
    let error = null;
    let updated = false;
    if (selected.deal_id) {
      // A migration 0011 sincroniza todas as conversas do lead pelo trigger.
      // Transferir só uma conversa deixaria o antigo responsável enxergando o
      // lead e produziria donos divergentes no atendimento.
      const result = await supabase
        .from("deals")
        .update({ responsible_id: transferTo })
        .eq("id", selected.deal_id)
        .eq("organization_id", organizationId)
        .select("id");
      error = result.error;
      updated = (result.data ?? []).length > 0;
    } else {
      const result = await supabase
        .from("whatsapp_conversations")
        .update({ assigned_to: transferTo })
        .eq("id", selected.id)
        .eq("organization_id", organizationId)
        .select("id");
      error = result.error;
      updated = (result.data ?? []).length > 0;
    }
    setTransferring(false);
    if (error || !updated) {
      setTransferError(
        describeWriteError(error, "Não foi possível transferir o atendimento.")
      );
      return;
    }
    setTransferOpen(false);
    router.refresh();
  }

  async function resolve() {
    if (!selected) return;
    setDealError(null);
    const { data: updated, error: err } = await supabase
      .from("whatsapp_conversations")
      .update({ status: selected.status === "resolved" ? "open" : "resolved" })
      .eq("id", selected.id)
      .eq("organization_id", organizationId)
      .select("id");
    if (err || (updated ?? []).length === 0) {
      setDealError(describeWriteError(err, "Não foi possível alterar o status desta conversa."));
      return;
    }
    router.refresh();
  }

  async function saveNote() {
    if (!selected || !note.trim()) return;
    setNoteError(null);
    const { error: err } = await supabase.from("whatsapp_messages").insert({
      organization_id: organizationId,
      conversation_id: selected.id,
      direction: "outbound",
      message_type: "system",
      content: `📝 Nota interna: ${note.trim()}`,
      sent_by: profileId,
    });
    if (err) {
      setNoteError(describeWriteError(err, "Não foi possível salvar a nota interna."));
      return;
    }
    if (selected.deal_id) {
      const { error: logErr } = await supabase.from("activity_logs").insert({
        organization_id: organizationId,
        actor_id: profileId,
        deal_id: selected.deal_id,
        type: "note",
        title: "Nota interna (atendimento)",
        description: note.trim(),
      });
      if (logErr) console.error("Falha ao gravar activity_logs", logErr);
    }
    setNote("");
    setNoteOpen(false);
    loadMessages(selected.id);
  }

  const statusMeta: Record<string, { label: string; tone: "green" | "amber" | "red" | "slate" | "blue" }> = {
    connected: { label: "Conectado", tone: "green" },
    connecting: { label: "Conectando…", tone: "amber" },
    qr: { label: "Aguardando QR Code", tone: "amber" },
    disconnected: { label: "Desconectado", tone: "slate" },
    error: { label: "Erro na conexão", tone: "red" },
  };
  const st = statusMeta[instance?.status ?? "disconnected"] ?? statusMeta.disconnected;

  // `deals` só tem negociações abertas; o lead fechado da conversa vem em
  // `linkedDeals`. Sem os dois, uma conversa vinculada parecia não ter lead.
  const linkedDeal = selected?.deal_id
    ? deals.find((d) => d.id === selected.deal_id) ??
      linkedDeals.find((d) => d.id === selected.deal_id) ??
      null
    : null;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      {/* Topo: status da conexão */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-white px-4 py-2.5 shadow-(--shadow-card)">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <MessageCircle className="h-4.5 w-4.5" />
          </span>
          <span className="text-sm font-bold text-ink">Atendimento WhatsApp</span>
          <Badge tone={st.tone} dot>
            {st.label}
          </Badge>
        </div>
        <Link
          href="/atendimento/configuracoes"
          className={buttonClasses({ variant: "outline", size: "sm" })}
        >
          <Settings className="h-3.5 w-3.5" />
          Conexão e configurações
        </Link>
      </div>

      {/* Movimentação que falhou depois da troca de conversa: fica no topo,
          fora do painel da conversa atual, porque é de outro atendimento. */}
      {detachedError && (
        <div
          role="alert"
          className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700"
        >
          <span>{detachedError}</span>
          <button
            type="button"
            onClick={() => setDetachedError(null)}
            className="shrink-0 font-semibold hover:underline"
          >
            Dispensar
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[320px_1fr_300px]">
        {/* ---------------- Lista de conversas ---------------- */}
        <div
          className={cn(
            "flex min-h-0 flex-col rounded-2xl border border-line bg-white shadow-(--shadow-card)",
            mobilePane !== "list" && "hidden lg:flex"
          )}
        >
          <div className="border-b border-line p-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input
                className="h-9 pl-9 text-xs"
                placeholder="Buscar conversa…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="mt-2 flex gap-1 overflow-x-auto">
              {(
                [
                  ["all", canViewAllConversations ? "Todas" : "Minhas"],
                  ["unread", "Não lidas"],
                  ["open", "Abertas"],
                  ...(canViewAllConversations
                    ? [["mine", "Minhas"], ["unassigned", "Sem resp."]]
                    : []),
                ] as [Filter, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    filter === key
                      ? "bg-primary-600 text-white"
                      : "bg-slate-100 text-ink-soft hover:bg-slate-200"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-ink-faint">
                Nenhuma conversa. As mensagens recebidas pelo webhook aparecem aqui.
              </p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedId(c.id);
                    setMobilePane("chat");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-line px-3.5 py-3 text-left transition-colors last:border-0",
                    selectedId === c.id ? "bg-primary-50/70" : "hover:bg-slate-50"
                  )}
                >
                  <Avatar name={c.name ?? c.phone} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-ink">
                        {c.name ?? `+${c.phone}`}
                      </p>
                      <span className="shrink-0 text-[10px] text-ink-faint">
                        {c.last_message_at ? formatDateTime(c.last_message_at) : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-ink-faint">
                        {c.last_message ?? "Sem mensagens"}
                      </p>
                      {c.unread_count > 0 && (
                        <span className="flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ---------------- Chat ---------------- */}
        <div
          className={cn(
            "flex min-h-0 flex-col rounded-2xl border border-line bg-white shadow-(--shadow-card)",
            mobilePane !== "chat" && "hidden lg:flex"
          )}
        >
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                className="border-0 bg-transparent"
                icon={<MessageCircle className="h-6 w-6" />}
                title="Selecione uma conversa"
                description="Escolha uma conversa na lista ao lado para visualizar e responder mensagens."
              />
            </div>
          ) : (
            <>
              {/* Cabeçalho do chat */}
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <button
                  className="rounded-lg p-1.5 text-ink-faint hover:bg-slate-100 lg:hidden"
                  onClick={() => setMobilePane("list")}
                >
                  <ArrowLeft className="h-4.5 w-4.5" />
                </button>
                <Avatar name={selected.name ?? selected.phone} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {selected.name ?? `+${selected.phone}`}
                  </p>
                  <p className="text-xs text-ink-faint">+{selected.phone}</p>
                </div>
                <button
                  className="rounded-lg p-1.5 text-ink-faint hover:bg-slate-100 lg:hidden"
                  onClick={() => setMobilePane("info")}
                >
                  <Info className="h-4.5 w-4.5" />
                </button>
                {canManageDeal && (
                  <Button
                    variant={selected.status === "resolved" ? "secondary" : "outline"}
                    size="sm"
                    onClick={resolve}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {selected.status === "resolved" ? "Reabrir" : "Resolver"}
                  </Button>
                )}
              </div>

              {/* Mensagens */}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/60 p-4">
                <MessageThread messages={messages} loading={loadingMessages} />
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-line p-3">
                {sendError && (
                  <p className="mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
                    {sendError}
                  </p>
                )}
                {!canManageDeal ? (
                  <p className="rounded-xl border border-line bg-slate-50 px-3 py-2.5 text-xs text-ink-faint">
                    Seu perfil é somente leitura: você acompanha as conversas, mas não envia
                    mensagens.
                  </p>
                ) : (
                <div className="flex items-end gap-2">
                  <button
                    onClick={() => setQuickOpen(true)}
                    className="rounded-xl border border-line p-2.5 text-ink-faint transition-colors hover:border-primary-300 hover:text-primary-600"
                    title="Respostas rápidas"
                  >
                    <Zap className="h-4.5 w-4.5" />
                  </button>
                  <button
                    onClick={() => setNoteOpen(true)}
                    className="rounded-xl border border-line p-2.5 text-ink-faint transition-colors hover:border-amber-300 hover:text-amber-600"
                    title="Nota interna"
                  >
                    <StickyNote className="h-4.5 w-4.5" />
                  </button>
                  <Textarea
                    className="max-h-28 min-h-11 flex-1 resize-none py-2.5"
                    placeholder="Digite sua mensagem… (Enter envia, Shift+Enter quebra linha)"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <Button
                    onClick={send}
                    loading={sending}
                    disabled={!draft.trim()}
                    className="h-11 w-11 rounded-xl p-0"
                    aria-label="Enviar"
                  >
                    {!sending && <Send className="h-4.5 w-4.5" />}
                  </Button>
                </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ---------------- Painel do contato/lead ---------------- */}
        <div
          className={cn(
            "flex min-h-0 flex-col gap-3 overflow-y-auto",
            mobilePane !== "info" && "hidden lg:flex"
          )}
        >
          <button
            className="flex items-center gap-1.5 text-xs font-medium text-ink-soft lg:hidden"
            onClick={() => setMobilePane("chat")}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para a conversa
          </button>

          {selected ? (
            <>
              <div className="rounded-2xl border border-line bg-white p-4 shadow-(--shadow-card)">
                <div className="flex flex-col items-center text-center">
                  <Avatar name={selected.name ?? selected.phone} size="lg" />
                  <p className="mt-2 text-sm font-bold text-ink">
                    {selected.name ?? `+${selected.phone}`}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-ink-faint">
                    <Phone className="h-3 w-3" /> +{selected.phone}
                  </p>
                  <Badge
                    tone={selected.status === "resolved" ? "green" : "blue"}
                    className="mt-2"
                  >
                    {{ open: "Aberta", pending: "Pendente", resolved: "Resolvida", archived: "Arquivada" }[selected.status]}
                  </Badge>
                </div>

                <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Atendente</span>
                    <span className="font-medium text-ink">
                      {fullName(members.find((m) => m.id === selected.assigned_to)) ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-faint">Iniciada em</span>
                    <span className="font-medium text-ink">{formatDateTime(selected.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Lead vinculado */}
              <div className="rounded-2xl border border-line bg-white p-4 shadow-(--shadow-card)">
                <p className="mb-2.5 text-xs font-semibold tracking-wide text-ink-faint uppercase">
                  Negociação
                </p>
                {linkedDeal ? (
                  <>
                    <Link
                      href={`/negociacoes/${linkedDeal.id}`}
                      className="block rounded-xl border border-line p-3 transition-colors hover:border-primary-300 hover:bg-primary-50/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-ink">{linkedDeal.title}</p>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                      </div>
                      <p className="mt-1 text-xs font-bold text-emerald-600">
                        {formatCurrency(linkedDeal.value)}
                      </p>
                    </Link>
                    {/* key por conversa E lead: o estado e o temporizador do
                        seletor são por atendimento, e a 0011 permite que o
                        mesmo lead tenha várias conversas — só o id do lead na
                        key deixaria a confirmação de uma aparecer na outra. */}
                    <DealStagePicker
                      key={`${selected.id}:${linkedDeal.id}`}
                      deal={linkedDeal}
                      pipelines={pipelines}
                      organizationId={organizationId}
                      profileId={profileId}
                      conversationId={selected.id}
                      canManage={canManageDeal}
                      onDetachedError={(title, message) =>
                        setDetachedError(`${title}: ${message}`)
                      }
                    />
                    <DealTagsSelector
                      key={`tags:${selected.id}:${linkedDeal.id}`}
                      dealId={linkedDeal.id}
                      organizationId={organizationId}
                      tags={tags}
                      selectedTags={(linkedDeal.tag_assignments ?? [])
                        .map((assignment) => assignment.tag)
                        .filter((tag): tag is DealTag => Boolean(tag))}
                      canEdit={canManageDeal}
                      compact
                      loadError={tagsError}
                    />
                  </>
                ) : selected.deal_id ? (
                  <p className="text-xs text-ink-faint">
                    Esta conversa já tem uma negociação vinculada que não está carregada aqui.{" "}
                    <Link
                      href={`/negociacoes/${selected.deal_id}`}
                      className="font-medium text-primary-700 hover:underline"
                    >
                      Abrir negociação
                    </Link>
                  </p>
                ) : canManageDeal ? (
                  <div className="space-y-2">
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={createLeadFromConversation}
                      loading={creatingLead}
                    >
                      <Handshake className="h-3.5 w-3.5" />
                      Criar lead desta conversa
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setLinkOpen(true)}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Vincular a lead existente
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-ink-faint">Nenhuma negociação vinculada.</p>
                )}
                {dealError && (
                  <p role="alert" className="mt-2 text-xs text-rose-600">
                    {dealError}
                  </p>
                )}
              </div>

              {/* Respostas do formulário de origem, logo abaixo da negociação:
                  é o contexto que o atendente lê antes de responder. Carrega
                  sob demanda; `key` pelo lead para que trocar de conversa não
                  reaproveite as respostas do lead anterior. */}
              {selected.deal_id && (
                <LeadInfoPanel
                  key={selected.deal_id}
                  dealId={selected.deal_id}
                  canEdit={canManageDeal}
                />
              )}

              {/* Ações — todas escrevem, então ficam fora do alcance do
                  viewer, que é somente leitura desde a 0003. */}
              {canManageDeal && (
              <div className="space-y-2 rounded-2xl border border-line bg-white p-4 shadow-(--shadow-card)">
                <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">
                  Ações
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setTransferOpen(true)}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 text-violet-600" />
                  Transferir atendimento
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setNoteOpen(true)}
                >
                  <StickyNote className="h-3.5 w-3.5 text-amber-500" />
                  Adicionar nota interna
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={resolve}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {selected.status === "resolved" ? "Reabrir conversa" : "Marcar como resolvida"}
                </Button>
              </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-white/60 p-6 text-center text-xs text-ink-faint">
              Os dados do contato aparecem aqui ao selecionar uma conversa.
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Modais ---------------- */}
      <Modal open={quickOpen} onClose={() => setQuickOpen(false)} title="Respostas rápidas" size="sm">
        {quickReplies.length === 0 ? (
          <p className="text-sm text-ink-faint">Nenhuma resposta rápida cadastrada.</p>
        ) : (
          <ul className="space-y-2">
            {quickReplies.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => {
                    setDraft(r.content);
                    setQuickOpen(false);
                  }}
                  className="w-full rounded-xl border border-line p-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40"
                >
                  <p className="text-xs font-semibold text-ink">{r.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-faint">{r.content}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} title="Vincular a negociação" size="sm">
        <Select value={linkDealId} onChange={(e) => setLinkDealId(e.target.value)}>
          <option value="">Selecione a negociação…</option>
          {deals.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title} — {formatCurrency(d.value)}
            </option>
          ))}
        </Select>
        {linkError && (
          <p role="alert" className="mt-2 text-xs text-rose-600">
            {linkError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setLinkOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={linkToDeal} disabled={!linkDealId} loading={linking}>
            Vincular
          </Button>
        </div>
      </Modal>

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Transferir atendimento" size="sm">
        <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
          <option value="">Selecione o atendente…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {fullName(m)}
            </option>
          ))}
        </Select>
        {transferError && (
          <p role="alert" className="mt-2 text-xs text-rose-600">
            {transferError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setTransferOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={transfer} disabled={!transferTo} loading={transferring}>
            Transferir
          </Button>
        </div>
      </Modal>

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="Nota interna" size="sm">
        <p className="mb-3 text-xs text-ink-faint">
          Notas internas ficam visíveis apenas para a equipe — o cliente não recebe.
        </p>
        <Textarea
          placeholder="Escreva a nota…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {noteError && (
          <p role="alert" className="mt-2 text-xs text-rose-600">
            {noteError}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setNoteOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={saveNote} disabled={!note.trim()}>
            Salvar nota
          </Button>
        </div>
      </Modal>
    </div>
  );
}
