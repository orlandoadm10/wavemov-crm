"use client";

import { DealFiltersPanel } from "@/components/crm/deal-filters-panel";
import { DealModal } from "@/components/crm/deal-modal";
import { Badge, TemperatureBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { UnreadConversationsPill } from "@/components/crm/unread-conversations-pill";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useDebounce } from "@/hooks/use-debounce";
import {
  DEAL_DATE_FILTERS,
  DEAL_SORTS,
  type DealDateFilters,
  type DealSort,
} from "@/lib/features/deal-filters/domain/deal-filters";
import { createClient } from "@/lib/supabase/client";
import { encodeDateRange } from "@/lib/utils/period";
import { cn, formatCurrency, formatDateTime, fullName } from "@/lib/utils";
import type { Contact, Deal, DealTag, Pipeline, PipelineStage, Profile } from "@/types";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Archive,
  Clock,
  Handshake,
  Phone,
  Plus,
  Scale,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tags as TagsIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface Props {
  organizationId: string;
  profileId: string;
  pipelines: Pipeline[];
  activePipeline: Pipeline | null;
  deals: Deal[];
  /** Quantas negociações atendem aos filtros no banco (antes do teto). */
  totalDeals: number;
  dealsLimit: number;
  /** Ordenação e filtros de data JÁ aplicados — validados pelo servidor. */
  sort: DealSort;
  dateFilters: DealDateFilters;
  /** Busca aplicada no servidor (`?q=`). */
  search: string;
  members: Profile[];
  contacts: Contact[];
  tags: DealTag[];
  tagsError: string | null;
  dealsError: string | null;
  /** `org_admin`/admin global: libera o catálogo de tags e a distribuição. */
  canManageOrg: boolean;
}

export function KanbanBoard({
  organizationId,
  profileId,
  pipelines,
  activePipeline,
  deals: initialDeals,
  totalDeals,
  dealsLimit,
  sort,
  dateFilters,
  search: appliedSearch,
  members,
  contacts,
  tags,
  tagsError,
  dealsError,
  canManageOrg,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const supabase = createClient();

  const [deals, setDeals] = useState(initialDeals);
  const [search, setSearch] = useState(appliedSearch);
  const debouncedSearch = useDebounce(search.trim(), 400);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  // Sincroniza quando o servidor manda novos dados (filtros/refresh).
  // Precisa ser efeito: setState durante o render dispara re-render em cascata.
  const initialIds = initialDeals
    .map((d) => `${d.id}:${d.stage_id}:${d.updated_at}:${dealTags(d).map((tag) => `${tag.id}:${tag.updated_at}`).join(".")}`)
    .join(",");
  useEffect(() => setDeals(initialDeals), [initialIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const stages = useMemo(
    () =>
      [...(activePipeline?.stages ?? [])].sort((a, b) => a.order_index - b.order_index),
    [activePipeline]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.contact?.name?.toLowerCase().includes(q) ||
        d.contact?.whatsapp_phone?.includes(q)
    );
  }, [deals, search]);

  function setParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  function setParam(key: string, value: string) {
    setParams({ [key]: value });
  }

  // A busca vai ao servidor (o board carrega no máximo `dealsLimit`): filtrar
  // só o que já chegou esconderia o lead 501. O filtro local acima dá a
  // resposta imediata enquanto o servidor não responde.
  useEffect(() => {
    if (debouncedSearch === (params.get("q") ?? "")) return;
    setParam("q", debouncedSearch);
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyDateFilters(filters: DealDateFilters) {
    const updates: Record<string, string | null> = {};
    for (const { key, param } of DEAL_DATE_FILTERS) {
      const value = filters[key];
      updates[param] = value ? encodeDateRange(value) : null;
    }
    setParams(updates);
  }

  function clearDateFilters() {
    // Só os filtros de data: ordenação, funil, busca e demais continuam.
    setParams(Object.fromEntries(DEAL_DATE_FILTERS.map(({ param }) => [param, null])));
  }

  function onDragStart(event: DragStartEvent) {
    setActiveDeal(deals.find((d) => d.id === event.active.id) ?? null);
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over) return;

    const dealId = String(active.id);
    const newStageId = String(over.id);
    const deal = deals.find((d) => d.id === dealId);
    const newStage = stages.find((s) => s.id === newStageId);
    if (!deal || !newStage || deal.stage_id === newStageId) return;

    // Guarda o estado anterior inteiro para reverter sem deixar resíduo
    const previous = deal;

    // Otimista
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dealId
          ? {
              ...d,
              stage_id: newStageId,
              stage: newStage,
              status: newStage.is_won_stage ? "won" : newStage.is_lost_stage ? "lost" : d.status,
            }
          : d
      )
    );

    const patch: Record<string, unknown> = { stage_id: newStageId };
    if (newStage.is_won_stage) {
      patch.status = "won";
      patch.won_at = new Date().toISOString();
    } else if (newStage.is_lost_stage) {
      patch.status = "lost";
      patch.lost_at = new Date().toISOString();
    }

    const { error } = await supabase.from("deals").update(patch).eq("id", dealId);
    if (error) {
      // Reverte o card inteiro (etapa, objeto da etapa e status) e avisa
      setDeals((prev) => prev.map((d) => (d.id === dealId ? previous : d)));
      setMoveError(
        `Não foi possível mover "${deal.title}" para ${newStage.name}. Tente novamente.`
      );
      return;
    }
    setMoveError(null);

    await Promise.all([
      supabase.from("deal_stage_history").insert({
        deal_id: dealId,
        from_stage_id: previous.stage_id,
        to_stage_id: newStageId,
        changed_by: profileId,
      }),
      supabase.from("activity_logs").insert({
        organization_id: organizationId,
        actor_id: profileId,
        deal_id: dealId,
        type: "stage_changed",
        title: `Etapa alterada para "${newStage.name}"`,
      }),
    ]);
    // A trigger da 0028 já gravou o evento; isto só faz as automações da
    // etapa rodarem agora em vez de esperar o cron. Falha aqui não desfaz o
    // movimento — o cron processa depois.
    void fetch("/api/automations/dispatch", { method: "POST" }).catch(() => undefined);
    router.refresh();
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col">
      {/* Barra de filtros */}
      <div className="mb-4 rounded-2xl border border-line bg-white p-3 shadow-(--shadow-card)">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            value={params.get("funil") ?? activePipeline?.id ?? ""}
            onChange={(e) => setParam("funil", e.target.value)}
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select
            value={params.get("status") ?? "open"}
            onChange={(e) => setParam("status", e.target.value)}
          >
            <option value="open">Em andamento</option>
            <option value="won">Ganhas</option>
            <option value="lost">Perdidas</option>
            <option value="archived">Arquivadas</option>
            <option value="todas">Todas</option>
          </Select>
          <Select
            value={params.get("responsavel") ?? ""}
            onChange={(e) => setParam("responsavel", e.target.value)}
          >
            <option value="">Todos os responsáveis</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {fullName(m)}
              </option>
            ))}
          </Select>
          <Select
            value={tags.some((tag) => tag.id === params.get("tag")) ? params.get("tag")! : "todas"}
            onChange={(e) => setParam("tag", e.target.value)}
          >
            <option value="todas">Todas as tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </Select>
          <Select
            aria-label="Ordenação"
            value={sort}
            onChange={(e) => setParam("ordem", e.target.value)}
          >
            {DEAL_SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              className="pl-9"
              placeholder="Buscar lead por nome ou telefone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <DealFiltersPanel
            applied={dateFilters}
            onApply={applyDateFilters}
            onClear={clearDateFilters}
          />
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Negociação
          </Button>
          <Button
            variant={params.get("status") === "archived" ? "secondary" : "outline"}
            onClick={() =>
              setParam("status", params.get("status") === "archived" ? "open" : "archived")
            }
          >
            <Archive className="h-4 w-4" />
            Arquivados
          </Button>
          <Link
            href={activePipeline ? `/funis?funil=${activePipeline.id}` : "/funis"}
            className={buttonClasses({ variant: "outline" })}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Etapas
          </Link>
          {/* Configurações do trabalho com negociações, ao lado dos filtros em
              vez do menu superior. Só para quem pode administrá-las: oferecer o
              atalho a um `seller` levaria a uma tela bloqueada. */}
          {canManageOrg && (
            <>
              <Link href="/tags" className={buttonClasses({ variant: "outline" })}>
                <TagsIcon className="h-4 w-4" />
                Tags
              </Link>
              <Link href="/distribuicao" className={buttonClasses({ variant: "outline" })}>
                <Scale className="h-4 w-4" />
                Distribuição
              </Link>
            </>
          )}
          {/* O contador que o cliente pediu "na página do kanban". Empurrado
              para a direita da fileira; em telas estreitas o `flex-wrap` já
              existente o joga para a linha de baixo, com largura própria —
              nunca `w-full`, porque pílula esticada de borda a borda vira
              faixa, e faixa nesta tela é do aviso de ingestão. */}
          <div className="ml-auto">
            <UnreadConversationsPill />
          </div>
        </div>
        {moveError && (
          <p
            role="alert"
            className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {moveError}
          </p>
        )}
        {tagsError && (
          <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {tagsError}
          </p>
        )}
        {totalDeals > initialDeals.length && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Mostrando {initialDeals.length} de {totalDeals} negociações (limite de {dealsLimit}).
            Refine com os filtros ou a busca para ver as demais.
          </p>
        )}
        {dealsError && (
          <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {dealsError}
          </p>
        )}
      </div>

      {/* Board */}
      {stages.length === 0 ? (
        <EmptyState
          icon={<Handshake className="h-6 w-6" />}
          title="Nenhum funil configurado"
          description="Crie um funil com etapas para começar a organizar suas negociações."
        />
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex flex-1 gap-3 overflow-x-auto pb-3">
            {stages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                deals={filtered.filter((d) => d.stage_id === stage.id)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeDeal && <DealCard deal={activeDeal} overlay />}
          </DragOverlay>
        </DndContext>
      )}

      <DealModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        organizationId={organizationId}
        pipelines={pipelines}
        members={members}
        contacts={contacts}
        defaultPipelineId={activePipeline?.id}
      />
    </div>
  );
}

// ---------------- Coluna ----------------
function KanbanColumn({ stage, deals }: { stage: PipelineStage; deals: Deal[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((s, d) => s + Number(d.value), 0);

  return (
    <div className="flex w-[280px] shrink-0 flex-col sm:w-[300px]">
      <div
        className="mb-2 flex items-center justify-between rounded-xl border border-line bg-white px-3.5 py-2.5 shadow-(--shadow-card)"
        style={{ borderTop: `3px solid ${stage.color}` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink">{stage.name}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-ink-soft">
            {deals.length}
          </span>
        </div>
        <span className="text-[11px] font-semibold whitespace-nowrap text-ink-faint">
          {formatCurrency(total)}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2.5 overflow-y-auto rounded-xl p-1 transition-colors",
          isOver && "bg-primary-50/80 ring-2 ring-primary-200"
        )}
      >
        {deals.map((deal) => (
          <DraggableDealCard key={deal.id} deal={deal} />
        ))}
        {deals.length === 0 && (
          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-line text-xs text-ink-faint">
            Arraste leads para cá
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Card ----------------
function DraggableDealCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(isDragging && "opacity-30")}
    >
      <DealCard deal={deal} />
    </div>
  );
}

function DealCard({ deal, overlay }: { deal: Deal; overlay?: boolean }) {
  const tags = dealTags(deal);
  return (
    <div
      className={cn(
        "group rounded-xl border border-line bg-white p-3.5 shadow-(--shadow-card) transition-shadow hover:shadow-(--shadow-pop)",
        overlay && "rotate-2 shadow-(--shadow-pop)"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <TemperatureBadge temperature={deal.temperature} />
        <span className="text-xs font-bold text-ink">{formatCurrency(deal.value)}</span>
      </div>

      <Link
        href={`/negociacoes/${deal.id}`}
        className="block"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          <Avatar name={deal.contact?.name ?? deal.title} size="sm" />
          <p className="truncate text-sm font-semibold text-ink group-hover:text-primary-700">
            {deal.title}
          </p>
        </div>

        <div className="mt-2.5 space-y-1 text-xs text-ink-faint">
          <p className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {formatDateTime(deal.created_at)}
          </p>
          {deal.contact?.whatsapp_phone && (
            <p className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />+{deal.contact.whatsapp_phone}
            </p>
          )}
          {deal.ai_status !== "none" && (
            <p className="flex items-center gap-1.5 font-medium text-primary-600">
              <Sparkles className="h-3.5 w-3.5" />
              {deal.ai_status === "qualifying"
                ? "Em qualificação IA"
                : deal.ai_status === "qualified"
                  ? "Qualificado pela IA"
                  : "Transferido pela IA"}
            </p>
          )}
        </div>
      </Link>

      {tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {tags.slice(0, 3).map((tag) => (
            <Badge key={tag.id} tone={tag.tone} className="max-w-[8.5rem] truncate">
              {tag.name}
            </Badge>
          ))}
          {tags.length > 3 && <Badge tone="slate">+{tags.length - 3}</Badge>}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5">
        {deal.responsible ? (
          <span className="flex items-center gap-1.5 text-xs text-ink-soft">
            <Avatar name={fullName(deal.responsible)} src={deal.responsible.avatar_url} size="xs" />
            <span className="max-w-24 truncate">{fullName(deal.responsible)}</span>
          </span>
        ) : (
          <Badge tone="slate">Sem responsável</Badge>
        )}
        {deal.source && (
          <span className="max-w-24 truncate text-[10px] text-ink-faint">{deal.source}</span>
        )}
      </div>
    </div>
  );
}

function dealTags(deal: Deal): DealTag[] {
  return (deal.tag_assignments ?? [])
    .map((assignment) => assignment.tag)
    .filter((tag): tag is DealTag => Boolean(tag));
}
