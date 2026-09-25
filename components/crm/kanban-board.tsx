"use client";

import { DealFiltersPanel } from "@/components/crm/deal-filters-panel";
import { DealModal } from "@/components/crm/deal-modal";
import { DealCard, dealTags } from "@/components/crm/kanban/deal-card";
import { KanbanColumn } from "@/components/crm/kanban/kanban-column";
import { UnreadConversationsPill } from "@/components/crm/unread-conversations-pill";
import { Button, buttonClasses } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Dropdown } from "@/components/ui/dropdown";
import { ACTIVE_FILTER, FILTER_CONTROL, SearchField } from "@/components/ui/search-field";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useDebounce } from "@/hooks/use-debounce";
import {
  countDealDateFilters,
  DEAL_DATE_FILTERS,
  DEAL_SORTS,
  DEFAULT_DEAL_SORT,
  type DealDateFilters,
  type DealSort,
} from "@/lib/features/deal-filters/domain/deal-filters";
import { createClient } from "@/lib/supabase/client";
import { encodeDateRange } from "@/lib/utils/period";
import { cn, formatCurrency, fullName } from "@/lib/utils";
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
  Archive,
  ArrowUpDown,
  Handshake,
  MoreHorizontal,
  Plus,
  Scale,
  SlidersHorizontal,
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
  // Celular: ferramentas recolhidas até a pessoa pedir.
  const [toolsOpen, setToolsOpen] = useState(false);
  // O que está mudando o quadro além do padrão — o número no botão "Filtros"
  // do celular, para ninguém esquecer um filtro escondido.
  const activeToolCount =
    [
      (params.get("status") ?? "open") !== "open",
      Boolean(params.get("responsavel")),
      tags.some((tag) => tag.id === params.get("tag")),
      sort !== DEFAULT_DEAL_SORT,
    ].filter(Boolean).length + countDealDateFilters(dateFilters);
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
  const valueOnBoard = filtered.reduce((sum, d) => sum + Number(d.value), 0);

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[36rem] flex-col gap-3">
      {/* Cabeçalho (seção 7): ações da página aqui, não na linha de filtros. */}
      <PageHeader
        eyebrow="Vendas"
        title="Negociações"
        subtitle="Cada lead do primeiro contato até a venda, com origem, tarefas e histórico completo."
        actions={
          <>
            <Link
              href={activePipeline ? `/funis?funil=${activePipeline.id}` : "/funis"}
              className={buttonClasses({ variant: "outline" })}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Configurar funil
            </Link>
            {/* Atalhos de administração só para quem pode usá-los: oferecer a
                um `seller` levaria a uma tela bloqueada. */}
            {canManageOrg && (
              <Dropdown
                trigger={
                  <Button variant="outline" size="icon" aria-label="Mais opções do funil">
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
            <Button className="hidden md:inline-flex" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Criar negociação
            </Button>
          </>
        }
      />
      {/* Barra de resumo (seção 10): pílulas que nunca quebram por dentro;
          no celular, a faixa rola de lado. */}
      <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-border bg-card/70 px-3 py-2.5 shadow-panel backdrop-blur">
        <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-bold whitespace-nowrap text-primary-foreground">
          {totalDeals} negociações
        </span>
        <span className="shrink-0 rounded-full border border-violet-300/60 bg-violet-400/10 px-3 py-1 text-xs font-semibold whitespace-nowrap text-violet-700 dark:text-violet-200">
          {STATUS_LABELS[status] ?? "Todas"}
        </span>
        <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold whitespace-nowrap text-primary">
          {formatCurrency(valueOnBoard)} {status === "open" ? "em aberto" : "no quadro"}
        </span>
        <div className="ml-auto shrink-0">
          <UnreadConversationsPill />
        </div>
      </div>

      {/* Filtros (seção 11). Celular: só busca, "Filtros" e "+". */}
      <div>
        <div className="flex items-center gap-2 md:hidden">
          <SearchField value={search} onChange={setSearch} placeholder="Buscar lead…" label="Buscar negociação" />
          <Button
            variant="outline"
            className={cn(FILTER_CONTROL, activeToolCount > 0 && ACTIVE_FILTER)}
            onClick={() => setToolsOpen((v) => !v)}
            aria-expanded={toolsOpen}
            aria-controls="kanban-ferramentas"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeToolCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-[10px] font-bold text-warning-foreground tabular-nums">
                {activeToolCount}
              </span>
            )}
          </Button>
          <Button size="icon" className="h-10 w-10 rounded-xl" onClick={() => setModalOpen(true)} aria-label="Nova negociação">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div id="kanban-ferramentas" className={cn("md:flex md:flex-wrap md:items-center md:gap-2", toolsOpen ? "mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2" : "hidden")}>
          <Select
            aria-label="Funil"
            className={cn(FILTER_CONTROL, "md:w-52")}
            value={params.get("funil") ?? activePipeline?.id ?? ""}
            onChange={(e) => setParam("funil", e.target.value)}
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <div className="hidden min-w-64 flex-1 md:block md:max-w-sm">
            <SearchField value={search} onChange={setSearch} placeholder="Buscar lead, telefone…" label="Buscar negociação" />
          </div>
          <Select
            aria-label="Responsável"
            className={cn(FILTER_CONTROL, "md:w-52", responsible && ACTIVE_FILTER)}
            value={responsible}
            onChange={(e) => setParam("responsavel", e.target.value)}
          >
            <option value="">Todos os responsáveis</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {fullName(m)}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            aria-pressed={responsible === profileId}
            className={cn(FILTER_CONTROL, responsible === profileId && ACTIVE_FILTER)}
            onClick={() => setParam("responsavel", responsible === profileId ? "" : profileId)}
          >
            Minhas negociações
          </Button>
          <Select
            aria-label="Situação"
            className={cn(FILTER_CONTROL, "md:w-44", status !== "open" && ACTIVE_FILTER)}
            value={status}
            onChange={(e) => setParam("status", e.target.value)}
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <div className="relative md:w-52">
            <ArrowUpDown className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Select
              aria-label="Ordenação"
              className={cn(FILTER_CONTROL, "pl-9", sort !== DEFAULT_DEAL_SORT && ACTIVE_FILTER)}
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
          <Select
            aria-label="Tag"
            className={cn(FILTER_CONTROL, "md:w-44", tagParam !== "todas" && ACTIVE_FILTER)}
            value={tagParam}
            onChange={(e) => setParam("tag", e.target.value)}
          >
            <option value="todas">Todas as tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </Select>
          <DealFiltersPanel applied={dateFilters} onApply={applyDateFilters} onClear={clearDateFilters} />

          <Button
            variant="outline"
            aria-pressed={status === "archived"}
            className={cn(FILTER_CONTROL, status === "archived" && ACTIVE_FILTER)}
            onClick={() => setParam("status", status === "archived" ? "open" : "archived")}
          >
            <Archive className="h-4 w-4" />
            Arquivados
          </Button>
        </div>

        {moveError && <Alert className="mt-2">{moveError}</Alert>}
        {tagsError && <Alert className="mt-2">{tagsError}</Alert>}
        {totalDeals > initialDeals.length && (
          <Alert tone="warning" className="mt-2">
            Mostrando {initialDeals.length} de {totalDeals} negociações (limite de {dealsLimit}).
            Refine com os filtros ou a busca para ver as demais.
          </Alert>
        )}
        {dealsError && <Alert className="mt-2">{dealsError}</Alert>}
      </div>

      {/* Quadro (seção 12): fundo azul translúcido, rolagem horizontal própria. */}
      {stages.length === 0 ? (
        <EmptyState
          icon={<Handshake className="h-6 w-6" />}
          title="Nenhum funil configurado"
          description="Crie um funil com etapas para começar a organizar suas negociações."
        />
      ) : (
        <DndContext
          // `id` fixo: sem ele o dnd-kit gera ids de acessibilidade diferentes
          // no servidor e no navegador, e o React acusa erro de hidratação.
          id="kanban"
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="flex min-h-[26rem] flex-1 gap-4 overflow-x-auto rounded-2xl border border-border bg-primary/[0.04] p-4">
            {stages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                stages={stages}
                onMove={moveDeal}
                deals={filtered.filter((d) => d.stage_id === stage.id)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeDeal && (
              <DealCard
                deal={activeDeal}
                stageColor={stages.find((s) => s.id === activeDeal.stage_id)?.color ?? "var(--primary)"}
                overlay
              />
            )}
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

const STATUS_LABELS: Record<string, string> = {
  // Mesmo vocabulário do selo de situação (DealStatusBadge), no plural.
  open: "Em aberto",
  won: "Vendas realizadas",
  lost: "Perdidas",
  archived: "Arquivadas",
  todas: "Todas",
};
