"use client";

import { DealFiltersPanel } from "@/components/crm/deal-filters-panel";
import { DealModal } from "@/components/crm/deal-modal";
import { DealCard, dealTags } from "@/components/crm/kanban/deal-card";
import { KanbanColumn } from "@/components/crm/kanban/kanban-column";
import { DealDrawer } from "@/components/crm/pipeline/deal-drawer";
import { FilterChip, FilterMenu } from "@/components/crm/pipeline/filter-menu";
import { MetricStrip } from "@/components/crm/pipeline/metric-strip";
import { PipelineList } from "@/components/crm/pipeline/pipeline-list";
import { UnreadConversationsPill } from "@/components/crm/unread-conversations-pill";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchField } from "@/components/ui/search-field";
import { useDebounce } from "@/hooks/use-debounce";
import {
  DEAL_DATE_FILTERS,
  DEAL_SORTS,
  DEFAULT_DEAL_SORT,
  type DealDateFilters,
  type DealSort,
} from "@/lib/features/deal-filters/domain/deal-filters";
import { pipelineMetrics, type MetricDealRow } from "@/lib/features/deal-filters/domain/pipeline-metrics";
import { createClient } from "@/lib/supabase/client";
import { describeDateRange, encodeDateRange } from "@/lib/utils/period";
import { cn, fullName } from "@/lib/utils";
import type { Contact, Deal, DealTag, Pipeline, Profile } from "@/types";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  CircleDot,
  Handshake,
  LayoutGrid,
  List,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Scale,
  SlidersHorizontal,
  Tags as TagsIcon,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  /** Negociações do funil que entraram ou foram vendidas no mês (indicadores). */
  monthDeals: MetricDealRow[];
  /** Início do mês no fuso do negócio, em ISO. */
  monthStart: string;
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
  monthDeals,
  monthStart,
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
  // Oportunidade aberta no painel lateral.
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  function onDragEnd(event: DragEndEvent) {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over) return;
    void moveDeal(String(active.id), String(over.id));
  }

  /**
   * Move a negociação de etapa. Um caminho só para o arrastar e para o
   * "Mover para…" do cartão — que existe porque arrastar não pode ser a única
   * forma de mover (toque e teclado; DESIGN_GUIDE, seção 12).
   */
  async function moveDeal(dealId: string, newStageId: string) {
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

  const status = params.get("status") ?? "open";
  const responsible = params.get("responsavel") ?? "";
  const tagParam = tags.some((tag) => tag.id === params.get("tag")) ? params.get("tag")! : "todas";
  const view: "kanban" | "lista" = params.get("visao") === "lista" ? "lista" : "kanban";
  const metrics = pipelineMetrics(filtered, monthDeals, new Date(monthStart));
  const selectedDeal = deals.find((d) => d.id === selectedId) ?? null;
  const openDeal = useCallback((deal: Deal) => setSelectedId(deal.id), []);
  const closeDrawer = useCallback(() => setSelectedId(null), []);

  const responsibleOptions = [
    { value: "", label: "Todos os responsáveis" },
    { value: profileId, label: "Minhas negociações" },
    ...members.filter((m) => m.id !== profileId).map((m) => ({ value: m.id, label: fullName(m) ?? "Sem nome" })),
  ];
  const tagOptions = [{ value: "todas", label: "Todas as tags" }, ...tags.map((t) => ({ value: t.id, label: t.name }))];
  const statusOptions = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));
  const sortOptions = DEAL_SORTS.map((o) => ({ value: o.value, label: o.label }));

  // Filtros ativos viram chips removíveis (prompt de design, seção 5).
  const chips: { label: string; clear: () => void }[] = [];
  if (responsible) {
    chips.push({
      label: `Responsável: ${responsibleOptions.find((o) => o.value === responsible)?.label ?? "—"}`,
      clear: () => setParam("responsavel", ""),
    });
  }
  if (status !== "open") chips.push({ label: `Situação: ${STATUS_LABELS[status] ?? status}`, clear: () => setParam("status", "") });
  if (tagParam !== "todas") {
    chips.push({ label: `Tag: ${tags.find((t) => t.id === tagParam)?.name ?? "—"}`, clear: () => setParam("tag", "") });
  }
  if (sort !== DEFAULT_DEAL_SORT) {
    chips.push({ label: `Ordem: ${DEAL_SORTS.find((o) => o.value === sort)?.label}`, clear: () => setParam("ordem", "") });
  }
  for (const { key, param, label } of DEAL_DATE_FILTERS) {
    const value = dateFilters[key];
    if (value) chips.push({ label: `${label}: ${describeDateRange(value)}`, clear: () => setParams({ [param]: null }) });
  }
  if (appliedSearch) chips.push({ label: `Busca: “${appliedSearch}”`, clear: () => setSearch("") });

  function clearAll() {
    setSearch("");
    setParams({
      responsavel: null,
      status: null,
      tag: null,
      ordem: null,
      q: null,
      ...Object.fromEntries(DEAL_DATE_FILTERS.map(({ param }) => [param, null])),
    });
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[38rem] flex-col gap-3">
      {/* Barra do workspace (print-melhorias-deals; prompt de design, seção 5). */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase">Vendas · Negociações</p>
          <Dropdown
            align="left"
            trigger={
              <button
                type="button"
                aria-label={`Funil: ${activePipeline?.name ?? "nenhum"}. Trocar funil`}
                className="group inline-flex max-w-full items-center gap-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
              >
                <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {activePipeline?.name ?? "Pipeline"}
                </h1>
                <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
              </button>
            }
          >
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Funis</p>
            {pipelines.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setParam("funil", p.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                  p.id === activePipeline?.id ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.id === activePipeline?.id && <Check className="h-4 w-4 text-primary" aria-hidden />}
              </button>
            ))}
          </Dropdown>
        </div>

        {/* Troca de visão (seção 5): segmentado. */}
        <div role="tablist" aria-label="Visão" className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
          {(
            [
              ["kanban", "Kanban", LayoutGrid],
              ["lista", "Lista", List],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setParam("visao", id === "kanban" ? "" : "lista")}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors",
                view === id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
          <Link
            href="/atendimento"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            Conversas
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <UnreadConversationsPill />
          <Link
            href={activePipeline ? `/funis?funil=${activePipeline.id}` : "/funis"}
            className={buttonClasses({ variant: "outline", size: "sm" })}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Configurar funil</span>
          </Link>
          {/* Atalhos de administração só para quem pode usá-los. */}
          {canManageOrg && (
            <Dropdown
              trigger={
                <Button variant="outline" size="sm" className="w-8 px-0" aria-label="Mais opções do funil">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              }
            >
              <Link href="/tags" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                <TagsIcon className="h-4 w-4" /> Tags
              </Link>
              <Link href="/distribuicao" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                <Scale className="h-4 w-4" /> Distribuição
              </Link>
            </Dropdown>
          )}
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nova oportunidade</span>
            <span className="sr-only sm:hidden">Nova oportunidade</span>
          </Button>
        </div>
      </div>

      {/* Filtros compactos: rolam de lado no celular em vez de empilhar. */}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
        <SearchField
          size="sm"
          value={search}
          onChange={setSearch}
          placeholder="Buscar lead, telefone…"
          label="Buscar negociação"
          className="w-56 flex-none"
        />
        <FilterMenu
          icon={UserRound}
          label="Responsável"
          value={responsible}
          defaultValue=""
          options={responsibleOptions}
          onChange={(v) => setParam("responsavel", v)}
        />
        <FilterMenu icon={CircleDot} label="Situação" value={status} defaultValue="open" options={statusOptions} onChange={(v) => setParam("status", v === "open" ? "" : v)} />
        <FilterMenu icon={TagsIcon} label="Tag" value={tagParam} defaultValue="todas" options={tagOptions} onChange={(v) => setParam("tag", v === "todas" ? "" : v)} />
        <DealFiltersPanel applied={dateFilters} onApply={applyDateFilters} onClear={clearDateFilters} />
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
        <FilterMenu icon={ArrowUpDown} label="Ordenar" value={sort} defaultValue={DEFAULT_DEAL_SORT} options={sortOptions} onChange={(v) => setParam("ordem", v === DEFAULT_DEAL_SORT ? "" : v)} />
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <FilterChip key={chip.label} label={chip.label} onRemove={chip.clear} />
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="ml-1 h-7 rounded-md px-2 text-xs font-semibold text-destructive-text hover:bg-destructive/10"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {moveError && <Alert>{moveError}</Alert>}
      {tagsError && <Alert>{tagsError}</Alert>}
      {totalDeals > initialDeals.length && (
        <Alert tone="warning">
          Mostrando {initialDeals.length} de {totalDeals} negociações (limite de {dealsLimit}). Refine com os
          filtros ou a busca para ver as demais.
        </Alert>
      )}
      {dealsError && <Alert>{dealsError}</Alert>}

      <MetricStrip metrics={metrics} />

      {stages.length === 0 ? (
        <EmptyState
          icon={<Handshake className="h-6 w-6" />}
          title="Nenhum funil configurado"
          description="Crie um funil com etapas para começar a organizar suas negociações."
        />
      ) : view === "lista" ? (
        <PipelineList deals={filtered} stages={stages} onOpen={openDeal} selectedId={selectedId} />
      ) : (
        <DndContext
          // `id` fixo: sem ele o dnd-kit gera ids de acessibilidade diferentes
          // no servidor e no navegador, e o React acusa erro de hidratação.
          id="kanban"
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="flex min-h-[24rem] flex-1 gap-3 overflow-x-auto pb-2">
            {stages.map((stage, index) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                index={index + 1}
                stages={stages}
                onMove={moveDeal}
                onOpen={openDeal}
                onCreate={() => setModalOpen(true)}
                selectedId={selectedId}
                deals={filtered.filter((d) => d.stage_id === stage.id)}
              />
            ))}
          </div>
          <DragOverlay>{activeDeal && <DealCard deal={activeDeal} overlay />}</DragOverlay>
        </DndContext>
      )}

      <DealDrawer
        deal={selectedDeal}
        stage={selectedDeal ? (stages.find((s) => s.id === selectedDeal.stage_id) ?? null) : null}
        onClose={closeDrawer}
      />

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

const STATUS_LABELS: Record<string, string> = {
  // Mesmo vocabulário do selo de situação (DealStatusBadge), no plural.
  open: "Em aberto",
  won: "Vendas realizadas",
  lost: "Perdidas",
  archived: "Arquivadas",
  todas: "Todas",
};
