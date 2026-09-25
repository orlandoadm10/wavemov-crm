"use client";

import { cn, formatCurrency } from "@/lib/utils";
import type { Deal, PipelineStage } from "@/types";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { DealCard } from "./deal-card";

/**
 * Coluna do pipeline (print-melhorias-deals): cada coluna na cor da própria
 * etapa, bem leve — fundo e cabeçalho tingidos, borda no mesmo tom e linha
 * forte no topo. Os cartões brancos se destacam sobre esse fundo e ficam
 * distintos de coluna para coluna. Cabeçalho fixo durante a rolagem, halo
 * quando é destino do arraste. 85vw no celular, 290px a partir de 640px.
 */
export function KanbanColumn({
  stage,
  index,
  deals,
  stages,
  onMove,
  onOpen,
  onCreate,
  selectedId,
}: {
  stage: PipelineStage;
  /** Posição da etapa no funil, a partir de 1 ("1. Novos Leads"). */
  index: number;
  deals: Deal[];
  stages: PipelineStage[];
  onMove: (dealId: string, stageId: string) => void;
  onOpen: (deal: Deal) => void;
  onCreate?: () => void;
  selectedId?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((s, d) => s + (Number(d.value) || 0), 0);

  return (
    <section
      aria-label={`${stage.name}: ${deals.length} oportunidade(s)`}
      style={{ "--stage": stage.color || "var(--primary)" } as React.CSSProperties}
      className={cn(
        "flex w-[85vw] shrink-0 flex-col overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--stage)_28%,transparent)] bg-[color-mix(in_oklab,var(--stage)_10%,var(--card))] transition duration-150 sm:w-[290px]",
        isOver && "bg-[color-mix(in_oklab,var(--stage)_14%,var(--card))] ring-2 ring-[color-mix(in_oklab,var(--stage)_45%,transparent)]"
      )}
    >
      <header className="sticky top-0 z-10 border-t-[3px] border-t-(--stage) bg-[color-mix(in_oklab,var(--stage)_16%,var(--card))] px-3.5 pt-2.5 pb-2">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 truncate font-sans text-sm font-semibold text-foreground">
            {index}. {stage.name}
          </h2>
          <span className="rounded-full bg-[color-mix(in_oklab,var(--stage)_24%,var(--card))] px-1.5 py-0.5 text-[11px] font-semibold text-[color-mix(in_oklab,var(--stage)_70%,var(--foreground))] tabular-nums">
            {deals.length}
          </span>
          {onCreate && (
            <button
              type="button"
              onClick={onCreate}
              aria-label={`Nova oportunidade em ${stage.name}`}
              title="Nova oportunidade"
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-card/70 hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{formatCurrency(total)}</p>
      </header>

      <div ref={setNodeRef} className="flex-1 space-y-2 overflow-y-auto p-2.5">
        {deals.map((deal) => (
          <DraggableDealCard
            key={deal.id}
            deal={deal}
            stages={stages}
            onMove={onMove}
            onOpen={onOpen}
            selected={deal.id === selectedId}
          />
        ))}
        {deals.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[color-mix(in_oklab,var(--stage)_35%,transparent)] px-3 py-6 text-center">
            <p className="text-xs font-medium text-muted-foreground">Nenhuma oportunidade nesta etapa.</p>
            <p className="text-[11px] text-ink-faint">Arraste uma oportunidade para cá.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function DraggableDealCard({
  deal,
  stages,
  onMove,
  onOpen,
  selected,
}: {
  deal: Deal;
  stages: PipelineStage[];
  onMove: (dealId: string, stageId: string) => void;
  onOpen: (deal: Deal) => void;
  selected: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn("rounded-xl", isDragging && "opacity-40")}>
      <DealCard deal={deal} stages={stages} onMove={onMove} onOpen={onOpen} selected={selected} />
    </div>
  );
}
