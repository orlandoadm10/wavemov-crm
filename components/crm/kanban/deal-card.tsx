"use client";

import { dealOrigin, EntityAvatar, OriginChip, TemperatureChip } from "@/components/crm/pipeline/deal-visuals";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { cn, formatCurrency, formatDate, fullName } from "@/lib/utils";
import type { Deal, DealTag, PipelineStage } from "@/types";
import { ExternalLink, MessageCircle, MoreHorizontal, Phone, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";

/**
 * Cartão de oportunidade (print-melhorias-deals; prompt de design, seção 8).
 *
 * Hierarquia: nome/contato → valor → origem e temperatura → responsável.
 * Ações rápidas (WhatsApp, ligar, abrir) só no hover/foco — nada de dez
 * ícones fixos. Clicar no cartão abre o painel lateral; o "…" tem "Abrir
 * ficha completa" e o "Mover para", alternativa acessível ao arrastar.
 */

const AI_STATUS: Record<Exclude<Deal["ai_status"], "none">, string> = {
  qualifying: "IA qualificando",
  qualified: "Qualificado pela IA",
  handoff: "Transferido pela IA",
};

export function dealTags(deal: Deal): DealTag[] {
  return (deal.tag_assignments ?? [])
    .map((assignment) => assignment.tag)
    .filter((tag): tag is DealTag => Boolean(tag));
}

const stop = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
};

export function DealCard({
  deal,
  stages,
  onMove,
  onOpen,
  selected,
  overlay,
}: {
  deal: Deal;
  /** Etapas do funil para o "Mover para…". */
  stages?: PipelineStage[];
  onMove?: (dealId: string, stageId: string) => void;
  /** Abre o painel lateral. */
  onOpen?: (deal: Deal) => void;
  selected?: boolean;
  overlay?: boolean;
}) {
  const origin = dealOrigin(deal);
  const phone = deal.contact?.whatsapp_phone ?? null;
  const contactName = deal.contact?.name?.trim();
  const subtitle = contactName && !deal.title.toLowerCase().includes(contactName.toLowerCase()) ? contactName : null;
  const value = Number(deal.value) || 0;

  return (
    <article
      onClick={onOpen ? () => onOpen(deal) : undefined}
      className={cn(
        "group relative cursor-pointer rounded-xl border border-border bg-card p-3 text-card-foreground shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition duration-150",
        "hover:border-primary/35 hover:shadow-panel motion-safe:hover:-translate-y-px",
        selected && "outline-2 outline-offset-1 outline-primary",
        deal.status === "lost" && "border-l-2 border-l-destructive",
        overlay && "scale-[1.02] opacity-95 shadow-lift"
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5">
        <EntityAvatar name={deal.title} />
        <div className="min-w-0">
          <h3 className="truncate text-sm leading-snug font-semibold text-foreground" title={deal.title}>
            {onOpen ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(deal);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="max-w-full truncate text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
              >
                {deal.title}
              </button>
            ) : (
              deal.title
            )}
          </h3>
          <p className="truncate text-xs text-muted-foreground">{subtitle ?? " "}</p>
        </div>
        {onMove && stages && (
          <div {...stop} className="-mt-1 -mr-1">
            <Dropdown
              trigger={
                <button
                  type="button"
                  aria-label={`Ações de ${deal.title}`}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              }
            >
              <Link
                href={`/negociacoes/${deal.id}`}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" /> Abrir ficha completa
              </Link>
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Mover para
              </p>
              {stages
                .filter((s) => s.id !== deal.stage_id)
                .map((s) => (
                  <DropdownItem key={s.id} onClick={() => onMove(deal.id, s.id)}>
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      {s.name}
                    </span>
                  </DropdownItem>
                ))}
            </Dropdown>
          </div>
        )}
      </div>

      <p className={cn("font-display mt-2 text-[15px] font-bold tabular-nums", value > 0 ? "text-foreground" : "text-muted-foreground")}>
        {value > 0 ? formatCurrency(value) : "Sem valor"}
      </p>

      <div className="mt-2 flex items-center gap-1.5">
        {deal.status === "won" ? (
          <span className="inline-flex h-5 items-center rounded-md bg-success/12 px-1.5 text-[11px] font-semibold text-success-text">
            Ganho{deal.won_at ? ` · ${formatDate(deal.won_at)}` : ""}
          </span>
        ) : deal.status === "lost" ? (
          <span className="inline-flex h-5 items-center rounded-md bg-destructive/10 px-1.5 text-[11px] font-semibold text-destructive-text">
            Perdida
          </span>
        ) : (
          <>
            {origin && <OriginChip origin={origin} />}
            <TemperatureChip temperature={deal.temperature} />
          </>
        )}
        {deal.ai_status !== "none" && (
          <span title={AI_STATUS[deal.ai_status]} className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-300">
            <Sparkles className="h-3 w-3" aria-label={AI_STATUS[deal.ai_status]} />
          </span>
        )}
        <span className="ml-auto shrink-0">
          {deal.responsible ? (
            <span title={fullName(deal.responsible)}>
              <Avatar name={fullName(deal.responsible)} src={deal.responsible.avatar_url} size="xs" />
            </span>
          ) : (
            <span
              title="Sem responsável"
              aria-label="Sem responsável"
              className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground"
            >
              <UserRound className="h-3.5 w-3.5" />
            </span>
          )}
        </span>
      </div>

      {/* Ações rápidas: só no hover/foco (prompt de design, seção 11). */}
      {phone && !overlay && (
        <div
          {...stop}
          className="pointer-events-none absolute top-11 right-2 flex gap-1 rounded-lg border border-border bg-card p-0.5 opacity-0 shadow-panel transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100"
        >
          <Link
            href={`/atendimento?telefone=${phone}`}
            aria-label={`WhatsApp de ${deal.title}`}
            title="Abrir conversa"
            className="flex h-7 w-7 items-center justify-center rounded-md text-success-text hover:bg-success/15"
          >
            <MessageCircle className="h-4 w-4" />
          </Link>
          <a
            href={`tel:+${phone}`}
            aria-label={`Ligar para ${deal.title}`}
            title="Ligar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-primary hover:bg-primary/10"
          >
            <Phone className="h-4 w-4" />
          </a>
        </div>
      )}
    </article>
  );
}
