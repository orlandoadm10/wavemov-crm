"use client";

import { ACTIVE_FILTER, SearchField } from "@/components/ui/search-field";

import { TaskModal } from "@/components/crm/task-modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge, PriorityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateTime, fullName } from "@/lib/utils";
import type { Contact, Deal, Profile, Task } from "@/types";
import { isPast, isToday } from "date-fns";
import { CheckCircle2, CheckSquare, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface Props {
  organizationId: string;
  profileId: string;
  tasks: Task[];
  members: Profile[];
  deals: Deal[];
  contacts: Contact[];
}

export function TasksClient({ organizationId, profileId, tasks, members, deals, contacts }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter === "pending" && t.status !== "pending") return false;
      if (statusFilter === "done" && t.status !== "done") return false;
      if (statusFilter === "overdue") {
        if (t.status !== "pending" || !t.due_at || !isPast(new Date(t.due_at)) || isToday(new Date(t.due_at)))
          return false;
      }
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (assigneeFilter && t.assigned_to !== assigneeFilter) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, search, statusFilter, priorityFilter, assigneeFilter]);

  const nextTask = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "pending" && t.due_at)
        .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())[0],
    [tasks]
  );

  async function toggle(task: Task) {
    const done = task.status !== "done";
    await supabase
      .from("tasks")
      .update({
        status: done ? "done" : "pending",
        completed_at: done ? new Date().toISOString() : null,
      })
      .eq("id", task.id);
    if (done && task.deal_id) {
      await supabase.from("activity_logs").insert({
        organization_id: organizationId,
        actor_id: profileId,
        deal_id: task.deal_id,
        type: "task_done",
        title: `Tarefa concluída: ${task.title}`,
      });
    }
    router.refresh();
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    await supabase.from("tasks").delete().eq("id", deleting.id);
    setBusy(false);
    setDeleting(null);
    router.refresh();
  }

  function dueBadge(task: Task) {
    if (!task.due_at) return null;
    const due = new Date(task.due_at);
    if (task.status === "done") return <Badge tone="green">Concluída</Badge>;
    if (isToday(due)) return <Badge tone="amber">Hoje</Badge>;
    if (isPast(due)) return <Badge tone="red">Em atraso!</Badge>;
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Busca e filtros. Celular: busca + botão numa linha, os três filtros
          em grade logo abaixo — antes eles disputavam a mesma linha e a busca
          ficava com 40px. */}
      <div className="space-y-2 rounded-2xl border border-line bg-card p-3 shadow-panel lg:flex lg:items-center lg:gap-2 lg:space-y-0">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SearchField value={search} onChange={setSearch} placeholder="Pesquisar tarefa…" label="Pesquisar tarefa" />
          <Button className="h-10 shrink-0 rounded-xl lg:hidden" onClick={() => setModalOpen(true)} aria-label="Criar tarefa">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Criar Tarefa</span>
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:flex lg:w-auto">
          <Select
            aria-label="Situação"
            className={cn("h-10 rounded-xl bg-card min-w-0 lg:w-auto lg:min-w-32", statusFilter !== "pending" && ACTIVE_FILTER)}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="pending">Pendentes</option>
            <option value="overdue">Em atraso</option>
            <option value="done">Concluídas</option>
            <option value="">Todas</option>
          </Select>
          <Select
            aria-label="Prioridade"
            className={cn("h-10 rounded-xl bg-card min-w-0 lg:w-auto lg:min-w-32", priorityFilter && ACTIVE_FILTER)}
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="">Prioridade</option>
            <option value="high">Alta</option>
            <option value="medium">Média</option>
            <option value="low">Baixa</option>
          </Select>
          <Select
            aria-label="Responsável"
            className={cn("h-10 rounded-xl bg-card min-w-0 lg:w-auto lg:min-w-36", assigneeFilter && ACTIVE_FILTER)}
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="">Responsável</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {fullName(m)}
              </option>
            ))}
          </Select>
        </div>
        <Button className="hidden h-10 shrink-0 rounded-xl lg:inline-flex" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Criar Tarefa
        </Button>
      </div>

      {/* Banner próxima tarefa */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-brand px-4 py-3 text-white shadow-panel sm:px-5 sm:py-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-white/80" />
          <span className="shrink-0 text-sm font-semibold">Próxima tarefa:</span>
          {nextTask ? (
            <span className="max-w-full truncate rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
              {nextTask.title} · {formatDateTime(nextTask.due_at)}
            </span>
          ) : (
            <span className="text-sm text-white/80">Nenhuma tarefa agendada 🎉</span>
          )}
        </div>
        <span className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-[#1d3fb8]">
          Tarefas: {filtered.length}
        </span>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-6 w-6" />}
          title="Nenhuma tarefa encontrada"
          description="Crie tarefas para não perder nenhum follow-up com seus leads."
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Criar tarefa
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((task) => {
            const assignee = members.find((m) => m.id === task.assigned_to);
            return (
              <li
                key={task.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3 shadow-panel transition-shadow hover:shadow-lift",
                  task.status === "done" && "opacity-60"
                )}
              >
                <button
                  onClick={() => toggle(task)}
                  className={cn(
                    "flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                    task.status === "done"
                      ? "border-success bg-success text-white"
                      : "border-border hover:border-primary-500"
                  )}
                  aria-label="Alternar conclusão"
                >
                  {task.status === "done" && <CheckCircle2 className="h-4 w-4" />}
                </button>

                {assignee && (
                  <Avatar name={fullName(assignee)} src={assignee.avatar_url} size="sm" />
                )}

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-semibold text-ink",
                      task.status === "done" && "line-through"
                    )}
                  >
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="truncate text-xs text-ink-faint">{task.description}</p>
                  )}
                </div>

                <div className="order-last flex w-full flex-wrap items-center gap-1.5 pl-8 sm:order-none sm:w-auto sm:gap-2 sm:pl-0">
                  {task.deal_id && (
                    <Link href={`/negociacoes/${task.deal_id}`}>
                      <Badge tone="green" className="hover:bg-success/15">🔗 Lead</Badge>
                    </Link>
                  )}
                  {task.due_at && (
                    <Badge tone="slate">{formatDateTime(task.due_at)}</Badge>
                  )}
                  <PriorityBadge priority={task.priority} />
                  <Badge tone={task.status === "done" ? "green" : "amber"}>
                    {task.status === "done" ? "Concluída" : "Pendente"}
                  </Badge>
                  {dueBadge(task)}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setEditing(task)}
                    className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-primary-50 hover:text-primary-600"
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleting(task)}
                    className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-destructive/10 hover:text-destructive-text"
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TaskModal
        open={modalOpen || !!editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        organizationId={organizationId}
        profileId={profileId}
        members={members}
        deals={deals}
        contacts={contacts}
        task={editing}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Excluir tarefa?"
        description={`A tarefa "${deleting?.title}" será excluída permanentemente.`}
        confirmLabel="Excluir"
        danger
        loading={busy}
      />
    </div>
  );
}
