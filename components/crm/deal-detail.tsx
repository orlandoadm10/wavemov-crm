"use client";

import { DealModal } from "@/components/crm/deal-modal";
import { DealAiCard } from "@/components/crm/deal-ai-card";
import { DealContactCard } from "@/components/crm/deal-contact-card";
import { DealTagsSelector } from "@/components/crm/deal-tags-selector";
import { DealHistoryPanel } from "@/components/crm/deal-history-panel";
import { TaskModal } from "@/components/crm/task-modal";
import { Avatar } from "@/components/ui/avatar";
import { PriorityBadge, TemperatureBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LeadInfoCard } from "@/components/crm/lead-info-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency, formatDate, formatDateTime, fullName } from "@/lib/utils";
import type {
  ActivityLog,
  Contact,
  Deal,
  DealTag,
  LostReason,
  Pipeline,
  Profile,
  Task,
  WhatsAppConversation,
} from "@/types";
import {
  Archive,
  ArrowLeft,
  ArrowRightLeft,
  Building2,
  CalendarClock,
  CheckSquare,
  Mail,
  Megaphone,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Tag as TagIcon,
  ThumbsDown,
  ThumbsUp,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type DetailTab = "dados" | "lead" | "tarefas" | "notas" | "historico";

interface Props {
  organizationId: string;
  profileId: string;
  deal: Deal;
  pipelines: Pipeline[];
  members: Profile[];
  contacts: Contact[];
  tasks: Task[];
  activities: ActivityLog[];
  activitiesError: string | null;
  lostReasons: LostReason[];
  conversations: WhatsAppConversation[];
  conversationsError: string | null;
  /** `form_submissions.metadata` da submissão que originou o lead (0015). */
  leadInfo: unknown;
  /** `forms.external_id` — referência visual de qual formulário originou. */
  leadFormExternalId: string | null;
  /** Existe submissão? É o que decide se há onde gravar uma edição. */
  hasSubmission: boolean;
  canEditLeadInfo: boolean;
  /** `viewer` é somente leitura: mesmo critério de `canEditTags`. */
  canEditContact: boolean;
  tags: DealTag[];
  selectedTags: DealTag[];
  canEditTags: boolean;
  tagsError: string | null;
}

export function DealDetail({
  organizationId,
  profileId,
  deal,
  pipelines,
  members,
  contacts,
  tasks,
  activities,
  activitiesError,
  lostReasons,
  conversations,
  conversationsError,
  leadInfo,
  leadFormExternalId,
  hasSubmission,
  canEditLeadInfo,
  canEditContact,
  tags,
  selectedTags,
  canEditTags,
  tagsError,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [lostReasonId, setLostReasonId] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<DetailTab>("dados");

  const pipeline = pipelines.find((p) => p.id === deal.pipeline_id);
  const stages = [...(pipeline?.stages ?? [])].sort((a, b) => a.order_index - b.order_index);
  const journeyStages = stages.filter((s) => !s.is_won_stage && !s.is_lost_stage);

  async function log(type: string, title: string) {
    await supabase.from("activity_logs").insert({
      organization_id: organizationId,
      actor_id: profileId,
      deal_id: deal.id,
      type,
      title,
    });
  }

  async function moveToStage(stageId: string) {
    if (stageId === deal.stage_id) return;
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return;
    setBusy(true);
    await supabase.from("deals").update({ stage_id: stageId }).eq("id", deal.id);
    await supabase.from("deal_stage_history").insert({
      deal_id: deal.id,
      from_stage_id: deal.stage_id,
      to_stage_id: stageId,
      changed_by: profileId,
    });
    await log("stage_changed", `Etapa alterada para "${stage.name}"`);
    setBusy(false);
    router.refresh();
  }

  async function markWon() {
    setBusy(true);
    const wonStage = stages.find((s) => s.is_won_stage);
    await supabase
      .from("deals")
      .update({
        status: "won",
        won_at: new Date().toISOString(),
        ...(wonStage ? { stage_id: wonStage.id } : {}),
      })
      .eq("id", deal.id);
    await log("deal_won", "Negociação marcada como GANHA 🎉");
    setBusy(false);
    setWonOpen(false);
    router.refresh();
  }

  async function markLost() {
    setBusy(true);
    const lostStage = stages.find((s) => s.is_lost_stage);
    await supabase
      .from("deals")
      .update({
        status: "lost",
        lost_at: new Date().toISOString(),
        lost_reason_id: lostReasonId || null,
        ...(lostStage ? { stage_id: lostStage.id } : {}),
      })
      .eq("id", deal.id);
    const reason = lostReasons.find((r) => r.id === lostReasonId)?.name;
    await log("deal_lost", `Negociação perdida${reason ? ` — ${reason}` : ""}`);
    setBusy(false);
    setLostOpen(false);
    router.refresh();
  }

  async function archive() {
    setBusy(true);
    await supabase.from("deals").update({ status: "archived" }).eq("id", deal.id);
    await log("deal_archived", "Negociação arquivada");
    setBusy(false);
    setArchiveOpen(false);
    router.push("/negociacoes");
    router.refresh();
  }

  async function transfer() {
    if (!transferTo) return;
    setBusy(true);
    await supabase.from("deals").update({ responsible_id: transferTo }).eq("id", deal.id);
    const name = fullName(members.find((m) => m.id === transferTo));
    await log("responsible_changed", `Responsável transferido para ${name}`);
    setBusy(false);
    setTransferOpen(false);
    router.refresh();
  }

  async function saveNote() {
    if (!note.trim()) return;
    setSavingNote(true);
    await supabase.from("activity_logs").insert({
      organization_id: organizationId,
      actor_id: profileId,
      deal_id: deal.id,
      type: "note",
      title: "Nota interna",
      description: note.trim(),
    });
    setNote("");
    setSavingNote(false);
    router.refresh();
  }

  async function toggleTask(task: Task) {
    const done = task.status !== "done";
    await supabase
      .from("tasks")
      .update({
        status: done ? "done" : "pending",
        completed_at: done ? new Date().toISOString() : null,
      })
      .eq("id", task.id);
    if (done) await log("task_done", `Tarefa concluída: ${task.title}`);
    router.refresh();
  }

  const pendingTasks = tasks.filter((t) => t.status === "pending");
  const currentStage = stages.find((s) => s.id === deal.stage_id);
  const phone = deal.contact?.whatsapp_phone ?? null;
  const utm = [deal.utm_source, deal.utm_medium, deal.utm_campaign].filter(Boolean).join(" · ");

  const TABS: { id: DetailTab; label: string }[] = [
    { id: "dados", label: "Dados" },
    { id: "lead", label: "Formulário e IA" },
    { id: "tarefas", label: `Atividades (${pendingTasks.length})` },
    { id: "notas", label: "Notas" },
    { id: "historico", label: "Histórico e conversas" },
  ];

  return (
    <div className="animate-fade-up space-y-4">
      <Link
        href="/negociacoes"
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar ao funil {pipeline?.name}
      </Link>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
        {/* Cabeçalho (seção 15; print 2): degradê sutil de azul para o cartão. */}
        <header className="space-y-4 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_9%,var(--card))_0%,var(--card)_100%)] p-5 sm:p-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-foreground sm:text-[1.7rem]">{deal.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {currentStage && (
                  <span
                    className="rounded-full px-2.5 py-1 font-semibold text-white"
                    style={{ background: currentStage.color || "var(--primary)" }}
                  >
                    {currentStage.name}
                  </span>
                )}
                <DealStatusPill status={deal.status} />
                <TemperatureBadge temperature={deal.temperature} />
                <span className="text-muted-foreground">
                  Criado em {formatDate(deal.created_at)} · Responsável:{" "}
                  <span className="font-semibold text-foreground">
                    {deal.responsible ? fullName(deal.responsible) : "—"}
                  </span>
                </span>
              </div>
            </div>
            <div className="min-w-32 rounded-2xl border border-primary/20 bg-card/80 px-4 py-2.5 text-right">
              <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Valor da negociação
              </p>
              <p className="font-display text-xl font-bold text-primary">
                {Number(deal.value) > 0 ? formatCurrency(deal.value) : "—"}
              </p>
            </div>
          </div>

          {phone && (
            <div className="flex flex-wrap gap-2">
              <a
                href={`tel:+${phone}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-card px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
              >
                <Phone className="h-3.5 w-3.5" /> +{phone}
              </a>
              <Link
                href={`/atendimento?telefone=${phone}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success-text hover:bg-success/15"
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </Link>
            </div>
          )}

          {deal.status === "open" && (
            <div className="flex flex-wrap gap-2">
              <Button variant="success" onClick={() => setWonOpen(true)}>
                <ThumbsUp className="h-4 w-4" />
                Marcar venda
              </Button>
              <Button variant="danger" onClick={() => setLostOpen(true)}>
                <ThumbsDown className="h-4 w-4" />
                Marcar perda
              </Button>
            </div>
          )}

          {/* Etapas do funil, cada uma na própria cor. */}
          <nav aria-label="Etapas do funil" className="flex gap-2 overflow-x-auto pb-1">
            {journeyStages.map((stage) => {
              const isCurrent = stage.id === deal.stage_id;
              const color = stage.color || "var(--primary)";
              return (
                <button
                  key={stage.id}
                  disabled={busy || deal.status !== "open"}
                  aria-current={isCurrent ? "step" : undefined}
                  onClick={() => moveToStage(stage.id)}
                  style={{ "--stage": color } as React.CSSProperties}
                  className={cn(
                    "shrink-0 rounded-xl border px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed",
                    isCurrent
                      ? "border-transparent bg-(--stage) text-white shadow-sm"
                      : "border-[color-mix(in_oklab,var(--stage)_35%,transparent)] bg-[color-mix(in_oklab,var(--stage)_9%,var(--card))] text-[color-mix(in_oklab,var(--stage)_80%,var(--foreground))] enabled:hover:bg-[color-mix(in_oklab,var(--stage)_16%,var(--card))]"
                  )}
                >
                  {stage.name}
                </button>
              );
            })}
          </nav>
        </header>

        {/* Abas (print 2): barra azul-clara, aba ativa em pílula branca. */}
        <div className="border-t border-border px-4 pt-4 sm:px-6">
          <div role="tablist" aria-label="Seções do lead" className="flex gap-1 overflow-x-auto rounded-2xl bg-secondary/70 p-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`aba-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`painel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cn(
                  "shrink-0 rounded-xl px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                  tab === t.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-secondary-foreground/80 hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div role="tabpanel" id={`painel-${tab}`} aria-labelledby={`aba-${tab}`} className="p-4 sm:p-6">
          {tab === "dados" && (
            <div className="space-y-5">
              <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                <DataItem icon={<Mail />} label="E-mail" value={deal.contact?.email} />
                <DataItem icon={<Phone />} label="Telefone" value={phone ? `+${phone}` : deal.contact?.phone} />
                <DataItem icon={<Building2 />} label="Contato" value={deal.contact?.name} />
                <DataItem icon={<TagIcon />} label="Origem" value={deal.source} />
                <DataItem icon={<CalendarClock />} label="Entrou em" value={formatDateTime(deal.created_at)} />
                <DataItem icon={<CalendarClock />} label="Previsão de fechamento" value={formatDate(deal.expected_close_date)} />
                <DataItem icon={<Workflow />} label="Funil · etapa" value={`${pipeline?.name ?? "—"} · ${currentStage?.name ?? "—"}`} />
                <DataItem icon={<Megaphone />} label="Anúncio (UTM)" value={utm || null} />
              </dl>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Editar informações
              </Button>

              <div className="grid gap-4 lg:grid-cols-2">
                <DealTagsSelector
                  dealId={deal.id}
                  organizationId={organizationId}
                  tags={tags}
                  selectedTags={selectedTags}
                  canEdit={canEditTags}
                  loadError={tagsError}
                />
                <DealContactCard
                  organizationId={organizationId}
                  contact={deal.contact ?? null}
                  canEdit={canEditContact}
                />
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button variant="outline" onClick={() => setTaskOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Criar tarefa
                </Button>
                <Button variant="outline" onClick={() => setTransferOpen(true)}>
                  <ArrowRightLeft className="h-4 w-4" />
                  Transferir responsável
                </Button>
                <Button variant="outline" onClick={() => setArchiveOpen(true)}>
                  <Archive className="h-4 w-4" />
                  Arquivar negociação
                </Button>
              </div>
            </div>
          )}

          {tab === "lead" && (
            <div className="space-y-4">
              <LeadInfoCard
                dealId={deal.id}
                metadata={leadInfo}
                formExternalId={leadFormExternalId}
                hasSubmission={hasSubmission}
                canEdit={canEditLeadInfo}
              />
              <DealAiCard aiStatus={deal.ai_status} qualification={deal.ai_qualification} />
            </div>
          )}

          {tab === "tarefas" && (
            <Card>
              <CardHeader
                title="Próximas tarefas"
                action={
                  <Button variant="secondary" size="sm" onClick={() => setTaskOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Tarefa
                  </Button>
                }
              />
              {pendingTasks.length === 0 ? (
                <div className="flex items-center gap-3 px-5 py-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary">
                    <CheckSquare className="h-5 w-5" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    Nenhuma tarefa pendente.{" "}
                    <button onClick={() => setTaskOpen(true)} className="font-semibold text-primary hover:underline">
                      Criar tarefa
                    </button>{" "}
                    para acompanhar este lead.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {pendingTasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <button
                        onClick={() => toggleTask(t)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-input transition-colors hover:border-primary"
                        aria-label="Concluir tarefa"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
                        {t.due_at && <p className="text-xs text-muted-foreground">{formatDateTime(t.due_at)}</p>}
                      </div>
                      <PriorityBadge priority={t.priority} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === "notas" && (
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-warning" />
                <h3 className="text-sm font-semibold text-foreground">Nota interna</h3>
              </div>
              <Textarea
                placeholder="Registre uma observação sobre este lead…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="mt-2 flex justify-end">
                <Button size="sm" onClick={saveNote} loading={savingNote} disabled={!note.trim()}>
                  Salvar nota
                </Button>
              </div>
            </Card>
          )}

          {tab === "historico" && (
            <DealHistoryPanel
              organizationId={organizationId}
              activities={activities}
              activitiesError={activitiesError}
              conversations={conversations}
              conversationsError={conversationsError}
            />
          )}
        </div>

        <footer className="flex items-center gap-2.5 border-t border-border px-5 py-3 text-sm sm:px-6">
          {deal.responsible ? (
            <>
              <Avatar name={fullName(deal.responsible)} src={deal.responsible.avatar_url} size="sm" />
              <span className="text-muted-foreground">
                Responsável: <b className="text-foreground">{fullName(deal.responsible)}</b>
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Sem responsável</span>
          )}
        </footer>
      </div>

      {/* Modais */}
      <DealModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        organizationId={organizationId}
        pipelines={pipelines}
        members={members}
        contacts={contacts}
        deal={deal}
      />
      <TaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        organizationId={organizationId}
        profileId={profileId}
        members={members}
        defaultDealId={deal.id}
        defaultContactId={deal.contact_id ?? undefined}
      />
      <ConfirmDialog
        open={wonOpen}
        onClose={() => setWonOpen(false)}
        onConfirm={markWon}
        title="Marcar como ganho? 🎉"
        description={`A negociação "${deal.title}" será marcada como GANHA no valor de ${formatCurrency(deal.value)}.`}
        confirmLabel="Confirmar ganho"
        loading={busy}
      />
      <Modal open={lostOpen} onClose={() => setLostOpen(false)} title="Marcar como perdida" size="sm">
        <p className="text-sm text-ink-soft">Selecione o motivo da perda:</p>
        <Select
          className="mt-3"
          value={lostReasonId}
          onChange={(e) => setLostReasonId(e.target.value)}
        >
          <option value="">Sem motivo específico</option>
          {lostReasons.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setLostOpen(false)}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={markLost} loading={busy}>
            Confirmar perda
          </Button>
        </div>
      </Modal>
      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Transferir responsável" size="sm">
        <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
          <option value="">Selecione um membro…</option>
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
          <Button onClick={transfer} loading={busy} disabled={!transferTo}>
            Transferir
          </Button>
        </div>
      </Modal>
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={archive}
        title="Arquivar negociação?"
        description="Ela sairá do Kanban, mas poderá ser encontrada no filtro de arquivadas."
        confirmLabel="Arquivar"
        danger
        loading={busy}
      />
    </div>
  );
}

const STATUS_PILL: Record<Deal["status"], { label: string; className: string }> = {
  open: { label: "Em aberto", className: "border-primary/40 bg-primary/10 text-primary" },
  won: { label: "Venda realizada", className: "border-success/40 bg-success/12 text-success-text" },
  lost: { label: "Perdida", className: "border-destructive/40 bg-destructive/10 text-destructive-text" },
  archived: { label: "Arquivada", className: "border-border bg-muted text-muted-foreground" },
};

function DealStatusPill({ status }: { status: Deal["status"] }) {
  const pill = STATUS_PILL[status] ?? STATUS_PILL.open;
  return <span className={cn("rounded-full border px-2.5 py-1 font-semibold", pill.className)}>{pill.label}</span>;
}

/** Um dado do lead na aba "Dados": ícone + rótulo pequeno, valor abaixo. */
function DataItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{value || "—"}</dd>
    </div>
  );
}
