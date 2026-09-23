"use client";

import { DealModal } from "@/components/crm/deal-modal";
import { DealAiCard } from "@/components/crm/deal-ai-card";
import { DealContactCard } from "@/components/crm/deal-contact-card";
import { DealTagsSelector } from "@/components/crm/deal-tags-selector";
import { DealHistoryPanel } from "@/components/crm/deal-history-panel";
import { TaskModal } from "@/components/crm/task-modal";
import { Avatar } from "@/components/ui/avatar";
import { DealStatusBadge, PriorityBadge, TemperatureBadge } from "@/components/ui/badge";
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
  Check,
  CheckSquare,
  ChevronRight,
  MessageCircle,
  Plus,
  StickyNote,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

  const pipeline = pipelines.find((p) => p.id === deal.pipeline_id);
  const stages = [...(pipeline?.stages ?? [])].sort((a, b) => a.order_index - b.order_index);
  const journeyStages = stages.filter((s) => !s.is_won_stage && !s.is_lost_stage);
  const currentIndex = journeyStages.findIndex((s) => s.id === deal.stage_id);
  const progress =
    deal.status === "won"
      ? 100
      : journeyStages.length > 1 && currentIndex >= 0
        ? Math.round(((currentIndex + 1) / journeyStages.length) * 100)
        : 0;

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

  return (
    <div className="animate-fade-up space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/negociacoes"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:text-primary-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar
        </Link>
        <span className="text-ink-faint">
          Funil <span className="font-semibold text-ink">{pipeline?.name}</span>
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-ink-faint" />
        <span className="text-ink-faint">Negociação</span>
      </div>

      {/* Cabeçalho */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Avatar name={deal.contact?.name ?? deal.title} size="lg" />
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-ink">{deal.title}</h1>
                <DealStatusBadge status={deal.status} />
                <TemperatureBadge temperature={deal.temperature} />
              </div>
              <p className="mt-0.5 text-xs text-ink-faint">
                Criado em {formatDate(deal.created_at)} · Responsável:{" "}
                <span className="font-medium text-primary-600">
                  {deal.responsible ? fullName(deal.responsible) : "—"}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] font-semibold tracking-wide text-ink-faint uppercase">
                Valor do negócio
              </p>
              <p className="text-2xl font-bold text-emerald-600">
                {formatCurrency(deal.value)}
              </p>
            </div>
            {deal.status === "open" && (
              <div className="flex gap-2">
                <Button variant="success" size="sm" onClick={() => setWonOpen(true)}>
                  <ThumbsUp className="h-4 w-4" />
                  Ganho
                </Button>
                <Button variant="danger" size="sm" onClick={() => setLostOpen(true)}>
                  <ThumbsDown className="h-4 w-4" />
                  Perda
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Stepper de etapas */}
        <div className="mt-5">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {journeyStages.map((stage, i) => {
              const isCurrent = stage.id === deal.stage_id;
              const isPast = currentIndex >= 0 && i < currentIndex;
              return (
                <button
                  key={stage.id}
                  disabled={busy || deal.status !== "open"}
                  onClick={() => moveToStage(stage.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                    isCurrent
                      ? "border-primary-600 bg-primary-600 text-white shadow-sm"
                      : isPast
                        ? "border-primary-100 bg-primary-50 text-primary-700"
                        : "border-line bg-white text-ink-faint hover:border-primary-200 hover:text-ink-soft"
                  )}
                >
                  {isPast && <Check className="h-3 w-3" />}
                  {stage.name}
                </button>
              );
            })}
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Coluna esquerda: negócio + contato */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Negócio"
              action={
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  Editar
                </Button>
              }
            />
            <dl className="divide-y divide-line text-sm">
              {[
                ["Nome", deal.title],
                ["Valor", formatCurrency(deal.value)],
                ["Fechamento", formatDate(deal.expected_close_date)],
                ["Funil", pipeline?.name ?? "—"],
                ["Etapa", stages.find((s) => s.id === deal.stage_id)?.name ?? "—"],
                ["Origem", deal.source ?? "—"],
                ["UTM Source", deal.utm_source ?? "—"],
                ["UTM Medium", deal.utm_medium ?? "—"],
                ["UTM Campaign", deal.utm_campaign ?? "—"],
                ["Criada em", formatDateTime(deal.created_at)],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between gap-3 px-5 py-3">
                  <dt className="text-ink-faint">{label}</dt>
                  <dd className="truncate text-right font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

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

          {/* Ações rápidas */}
          <Card className="space-y-2 p-4">
            <Button variant="outline" className="w-full justify-start" onClick={() => setTaskOpen(true)}>
              <Plus className="h-4 w-4 text-primary-600" />
              Criar tarefa
            </Button>
            <Link
              href={deal.contact?.whatsapp_phone ? `/atendimento?telefone=${deal.contact.whatsapp_phone}` : "/atendimento"}
              className="block"
            >
              <Button variant="outline" className="w-full justify-start">
                <MessageCircle className="h-4 w-4 text-emerald-600" />
                Enviar mensagem WhatsApp
              </Button>
            </Link>
            <Button variant="outline" className="w-full justify-start" onClick={() => setTransferOpen(true)}>
              <ArrowRightLeft className="h-4 w-4 text-violet-600" />
              Transferir responsável
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => setArchiveOpen(true)}>
              <Archive className="h-4 w-4 text-ink-faint" />
              Arquivar negociação
            </Button>
          </Card>
        </div>

        {/* Coluna central/direita: informações do lead + tarefas + notas +
            histórico segmentado */}
        <div className="space-y-4 lg:col-span-2">
          {/* Primeiro card da coluna, ao lado de Negócio: é o contexto que o
              vendedor lê ANTES de qualquer decisão sobre o lead. Não renderiza
              nada quando não há respostas nem permissão para escrevê-las. */}
          <LeadInfoCard
            dealId={deal.id}
            metadata={leadInfo}
            formExternalId={leadFormExternalId}
            hasSubmission={hasSubmission}
            canEdit={canEditLeadInfo}
          />

          <DealAiCard aiStatus={deal.ai_status} qualification={deal.ai_qualification} />

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
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
                  <CheckSquare className="h-5 w-5" />
                </span>
                <p className="text-sm text-ink-faint">
                  Nenhuma tarefa pendente.{" "}
                  <button
                    onClick={() => setTaskOpen(true)}
                    className="font-semibold text-primary-600 hover:underline"
                  >
                    Criar tarefa
                  </button>{" "}
                  para acompanhar este lead.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {pendingTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <button
                      onClick={() => toggleTask(t)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-line transition-colors hover:border-primary-500"
                      aria-label="Concluir tarefa"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{t.title}</p>
                      {t.due_at && (
                        <p className="text-xs text-ink-faint">{formatDateTime(t.due_at)}</p>
                      )}
                    </div>
                    <PriorityBadge priority={t.priority} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Nota interna */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-ink">Nota interna</h3>
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

          <DealHistoryPanel
            organizationId={organizationId}
            activities={activities}
            activitiesError={activitiesError}
            conversations={conversations}
            conversationsError={conversationsError}
          />
        </div>
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
