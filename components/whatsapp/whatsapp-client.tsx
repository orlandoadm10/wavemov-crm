"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { PublicInstance } from "@/lib/services/whatsapp";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency, formatDateTime, fullName, normalizePhone } from "@/lib/utils";
import type {
  Contact,
  Deal,
  Profile,
  QuickReply,
  WhatsAppConversation,
  WhatsAppMessage,
} from "@/types";
import {
  ArrowLeft,
  ArrowRightLeft,
  CheckCheck,
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

interface Props {
  organizationId: string;
  profileId: string;
  instance: PublicInstance;
  conversations: WhatsAppConversation[];
  quickReplies: QuickReply[];
  members: Profile[];
  deals: Deal[];
  initialConversationId?: string;
  initialPhone?: string;
}

export function WhatsAppClient({
  organizationId,
  profileId,
  instance,
  conversations,
  quickReplies,
  members,
  deals,
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
  const [linkDealId, setLinkDealId] = useState("");
  const [transferTo, setTransferTo] = useState("");
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

  // Carrega mensagens da conversa selecionada
  const loadMessages = useCallback(
    async (conversationId: string) => {
      setLoadingMessages(true);
      const { data } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(500);
      setMessages((data ?? []) as WhatsAppMessage[]);
      setLoadingMessages(false);
      // Zera não lidas
      await supabase
        .from("whatsapp_conversations")
        .update({ unread_count: 0 })
        .eq("id", conversationId);
    },
    [supabase]
  );

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
  }, [selectedId, loadMessages]);

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
    await supabase
      .from("whatsapp_conversations")
      .update({ deal_id: linkDealId })
      .eq("id", selected.id);
    setLinkOpen(false);
    router.refresh();
  }

  async function createLeadFromConversation() {
    if (!selected) return;
    const { data: pipeline } = await supabase
      .from("pipelines")
      .select("id, stages:pipeline_stages(id, order_index, is_won_stage, is_lost_stage)")
      .eq("organization_id", organizationId)
      .order("created_at")
      .limit(1)
      .single();
    if (!pipeline) return;
    const firstStage = (pipeline.stages as { id: string; order_index: number; is_won_stage: boolean; is_lost_stage: boolean }[])
      .filter((s) => !s.is_won_stage && !s.is_lost_stage)
      .sort((a, b) => a.order_index - b.order_index)[0];
    if (!firstStage) return;

    const { data: deal } = await supabase
      .from("deals")
      .insert({
        organization_id: organizationId,
        pipeline_id: pipeline.id,
        stage_id: firstStage.id,
        contact_id: selected.contact_id,
        responsible_id: profileId,
        title: selected.name ?? `Lead WhatsApp +${selected.phone}`,
        source: "WhatsApp Direto",
        temperature: "warm",
      })
      .select("id")
      .single();

    if (deal) {
      await supabase
        .from("whatsapp_conversations")
        .update({ deal_id: deal.id })
        .eq("id", selected.id);
      router.push(`/negociacoes/${deal.id}`);
    }
  }

  async function transfer() {
    if (!selected || !transferTo) return;
    await supabase
      .from("whatsapp_conversations")
      .update({ assigned_to: transferTo })
      .eq("id", selected.id);
    setTransferOpen(false);
    router.refresh();
  }

  async function resolve() {
    if (!selected) return;
    await supabase
      .from("whatsapp_conversations")
      .update({ status: selected.status === "resolved" ? "open" : "resolved" })
      .eq("id", selected.id);
    router.refresh();
  }

  async function saveNote() {
    if (!selected || !note.trim()) return;
    await supabase.from("whatsapp_messages").insert({
      organization_id: organizationId,
      conversation_id: selected.id,
      direction: "outbound",
      message_type: "system",
      content: `📝 Nota interna: ${note.trim()}`,
      sent_by: profileId,
    });
    if (selected.deal_id) {
      await supabase.from("activity_logs").insert({
        organization_id: organizationId,
        actor_id: profileId,
        deal_id: selected.deal_id,
        type: "note",
        title: "Nota interna (atendimento)",
        description: note.trim(),
      });
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

  const linkedDeal = selected?.deal_id
    ? deals.find((d) => d.id === selected.deal_id)
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
                  ["all", "Todas"],
                  ["unread", "Não lidas"],
                  ["open", "Abertas"],
                  ["mine", "Minhas"],
                  ["unassigned", "Sem resp."],
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
                <Button
                  variant={selected.status === "resolved" ? "secondary" : "outline"}
                  size="sm"
                  onClick={resolve}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {selected.status === "resolved" ? "Reabrir" : "Resolver"}
                </Button>
              </div>

              {/* Mensagens */}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/60 p-4">
                {loadingMessages ? (
                  <p className="py-10 text-center text-xs text-ink-faint">Carregando mensagens…</p>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-xs text-ink-faint">
                    Nenhuma mensagem nesta conversa ainda.
                  </p>
                ) : (
                  messages.map((m) =>
                    m.message_type === "system" ? (
                      <div key={m.id} className="flex justify-center">
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] text-amber-700 ring-1 ring-amber-100">
                          {m.content}
                        </span>
                      </div>
                    ) : (
                      <div
                        key={m.id}
                        className={cn(
                          "flex",
                          m.direction === "outbound" ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                            m.direction === "outbound"
                              ? "rounded-br-md bg-primary-600 text-white"
                              : "rounded-bl-md border border-line bg-white text-ink"
                          )}
                        >
                          {m.media_url && (
                            <a
                              href={m.media_url}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                "mb-1 block text-xs underline",
                                m.direction === "outbound" ? "text-primary-100" : "text-primary-600"
                              )}
                            >
                              📎 Mídia ({m.message_type})
                            </a>
                          )}
                          <p className="whitespace-pre-wrap">{m.content}</p>
                          <p
                            className={cn(
                              "mt-1 flex items-center justify-end gap-1 text-[10px]",
                              m.direction === "outbound" ? "text-primary-200" : "text-ink-faint"
                            )}
                          >
                            {formatDateTime(m.created_at)}
                            {m.direction === "outbound" && <CheckCheck className="h-3 w-3" />}
                          </p>
                        </div>
                      </div>
                    )
                  )
                )}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-line p-3">
                {sendError && (
                  <p className="mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
                    {sendError}
                  </p>
                )}
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
                ) : (
                  <div className="space-y-2">
                    <Button size="sm" className="w-full" onClick={createLeadFromConversation}>
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
                )}
              </div>

              {/* Ações */}
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
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setLinkOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={linkToDeal} disabled={!linkDealId}>
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
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setTransferOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={transfer} disabled={!transferTo}>
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
