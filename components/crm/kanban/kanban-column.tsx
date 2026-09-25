"use client";

import { cn, formatCurrency } from "@/lib/utils";
import type { Deal, PipelineStage } from "@/types";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { DealCard } from "./deal-card";

/**
 * Coluna do Kanban (DESIGN_GUIDE, seção 12; print 1): tudo na cor da etapa —
 * faixa de 6px no topo, fundo e borda com baixa opacidade, título, contador e
 * soma. 85vw no celular, 290px a partir de 640px, sem encolher.
 */
export function KanbanColumn({
  stage,
  deals,
  stages,
  onMove,
}: {
  stage: PipelineStage;
  deals: Deal[];
  stages: PipelineStage[];
  onMove: (dealId: string, stageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((s, d) => s + Number(d.value), 0);
  const color = stage.color || "var(--primary)";

  return (
    <section
      aria-label={`${stage.name}: ${deals.length} negociação(ões)`}
      style={{ "--stage": color } as React.CSSProperties}
      className={cn(
        "flex w-[85vw] shrink-0 flex-col overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--stage)_30%,transparent)] bg-[color-mix(in_oklab,var(--stage)_7%,var(--card))] transition duration-200 sm:w-[290px]",
        isOver && "scale-[1.01] shadow-lift"
      )}
    >
      <div className="h-1.5 shrink-0 bg-(--stage)" />
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate font-sans text-sm font-semibold text-[color-mix(in_oklab,var(--stage)_80%,var(--foreground))]">
            {stage.name}
          </h2>
          <span className="rounded-full bg-[color-mix(in_oklab,var(--stage)_18%,transparent)] px-1.5 py-0.5 text-[10px] font-bold text-[color-mix(in_oklab,var(--stage)_80%,var(--foreground))] tabular-nums">
            {deals.length}
          </span>
        </div>
        <span className="rounded-full bg-[color-mix(in_oklab,var(--stage)_16%,transparent)] px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-[color-mix(in_oklab,var(--stage)_80%,var(--foreground))] tabular-nums">
          {formatCurrency(total)}
        </span>
      </header>

      <div ref={setNodeRef} className="flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {deals.map((deal) => (
          <DraggableDealCard key={deal.id} deal={deal} stageColor={color} stages={stages} onMove={onMove} />
        ))}
        {deals.length === 0 && (
          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-[color-mix(in_oklab,var(--stage)_35%,transparent)] text-xs text-muted-foreground">
            Arraste leads para cá
          </div>
        )}
      </div>
    </section>
  );
}

function DraggableDealCard({
  deal,
  stageColor,
  stages,
  onMove,
}: {
  deal: Deal;
  stageColor: string;
  stages: PipelineStage[];
  onMove: (dealId: string, stageId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn(isDragging && "opacity-40")}>
      <DealCard deal={deal} stageColor={stageColor} stages={stages} onMove={onMove} />
    </div>
  );
}
