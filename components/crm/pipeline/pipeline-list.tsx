"use client";

import { dealOrigin, EntityAvatar, TemperatureChip } from "@/components/crm/pipeline/deal-visuals";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatCurrency, formatDate, fullName } from "@/lib/utils";
import { textOnColor } from "@/lib/utils/color";
import type { Deal, PipelineStage } from "@/types";

/**
 * Visão em lista do pipeline (print, conceito 3; prompt de design, seção 19):
 * tabela densa, cabeçalho fixo, hover sutil; clicar na linha abre o mesmo
 * painel lateral do Kanban.
 */
export function PipelineList({
  deals,
  stages,
  onOpen,
  selectedId,
}: {
  deals: Deal[];
  stages: PipelineStage[];
  onOpen: (deal: Deal) => void;
  selectedId?: string | null;
}) {
  const stageById = new Map(stages.map((s) => [s.id, s]));

  if (deals.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center text-sm text-muted-foreground">
        Nenhuma oportunidade com estes filtros.
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border bg-card shadow-panel">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
          <tr className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            <th className="px-4 py-2.5">Oportunidade</th>
            <th className="px-4 py-2.5">Valor</th>
            <th className="px-4 py-2.5">Etapa</th>
            <th className="px-4 py-2.5">Temperatura</th>
            <th className="px-4 py-2.5">Origem</th>
            <th className="px-4 py-2.5">Responsável</th>
            <th className="px-4 py-2.5">Entrada</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {deals.map((deal) => {
            const stage = stageById.get(deal.stage_id);
            return (
              <tr
                key={deal.id}
                onClick={() => onOpen(deal)}
                className={cn(
                  "cursor-pointer transition-colors duration-150 hover:bg-secondary/40",
                  deal.id === selectedId && "bg-secondary/60"
                )}
              >
                <td className="px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <EntityAvatar name={deal.title} size="sm" />
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(deal);
                        }}
                        className="block max-w-64 truncate text-left font-medium text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {deal.title}
                      </button>
                      <p className="max-w-64 truncate text-xs text-muted-foreground">{deal.contact?.name ?? "—"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 font-medium whitespace-nowrap text-foreground tabular-nums">
                  {Number(deal.value) > 0 ? formatCurrency(deal.value) : "—"}
                </td>
                <td className="px-4 py-2.5">
                  {stage && (
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
                      style={{ background: stage.color || "var(--primary)", color: textOnColor(stage.color) }}
                    >
                      {stage.name}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <TemperatureChip temperature={deal.temperature} />
                </td>
                <td className="max-w-40 truncate px-4 py-2.5 text-muted-foreground">{dealOrigin(deal) ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {deal.responsible ? (
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <Avatar name={fullName(deal.responsible)} src={deal.responsible.avatar_url} size="xs" />
                      {fullName(deal.responsible)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Sem responsável</span>
                  )}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{formatDate(deal.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
