"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { cn, formatCurrency, formatDateTime, fullName } from "@/lib/utils";
import type { Deal, DealTag, PipelineStage } from "@/types";
import {
  Building2,
  CalendarClock,
  ExternalLink,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Sparkles,
  Star,
} from "lucide-react";
import Link from "next/link";

/**
 * Cartão do lead no Kanban (DESIGN_GUIDE, seção 13; print 1).
 *
 * Só mostra dado que o quadro já carrega. Faturamento e "sem contato há…" do
 * Jidianos não existem neste CRM — no lugar entram o valor da negociação e o
 * andamento da IA. A qualificação é a temperatura (Frio/Morno/Quente).
 */

const STATUS_LABEL: Record<Deal["status"], string> = {
  open: "Em aberto",
  won: "Venda realizada",
  lost: "Perdido",
  archived: "Arquivado",
};

const TEMPERATURE: Record<Deal["temperature"], { label: string; stars: number }> = {
  cold: { label: "Frio", stars: 1 },
  warm: { label: "Morno", stars: 2 },
  hot: { label: "Quente", stars: 3 },
};

const AI_STATUS: Record<Exclude<Deal["ai_status"], "none">, string> = {
  qualifying: "Em qualificação pela IA",
  qualified: "Qualificado pela IA",
  handoff: "Transferido pela IA",
};

/** Cabe na caixa de ~110px: abaixo de R$ 100 mil por extenso, acima compacto. */
const COMPACT_BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
function cardValue(value: number): string {
  return value >= 100_000 ? COMPACT_BRL.format(value) : formatCurrency(value);
}

export function dealTags(deal: Deal): DealTag[] {
  return (deal.tag_assignments ?? [])
    .map((assignment) => assignment.tag)
    .filter((tag): tag is DealTag => Boolean(tag));
}

/** Faixa do topo: cor da etapa enquanto aberto; verde/vermelho/neutro depois. */
function headerStyle(deal: Deal, stageColor: string): React.CSSProperties {
  if (deal.status === "won") return { background: "var(--success)" };
  if (deal.status === "lost") return { background: "var(--destructive)" };
  if (deal.status === "archived") return { background: "var(--muted-foreground)" };
  return { background: stageColor };
}

export function DealCard({
  deal,
  stageColor,
  stages,
  onMove,
  overlay,
}: {
  deal: Deal;
  stageColor: string;
  /** Etapas do funil para o "Mover para…" — alternativa ao arrastar. */
  stages?: PipelineStage[];
  onMove?: (dealId: string, stageId: string) => void;
  overlay?: boolean;
}) {
  const tags = dealTags(deal);
  const temperature = TEMPERATURE[deal.temperature] ?? TEMPERATURE.cold;
  const origin = deal.utm_campaign || deal.utm_source || deal.source;
  const phone = deal.contact?.whatsapp_phone ?? null;
  const contactName = deal.contact?.name;
  const showContact = contactName && contactName.trim().toLowerCase() !== deal.title.trim().toLowerCase();
  const stopDrag = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };

  return (
    <article
      className={cn(
        "group overflow-hidden rounded-xl border bg-card text-card-foreground shadow-panel transition duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-lift",
        deal.status === "lost" && "border-destructive/30 bg-[color-mix(in_oklab,var(--destructive)_5%,var(--card))]",
        deal.status === "won" && "border-success/30 bg-[color-mix(in_oklab,var(--success)_6%,var(--card))]",
        overlay && "rotate-2 opacity-90 shadow-lift"
      )}
    >
      <header className="flex h-8 items-center justify-between px-4 text-white" style={headerStyle(deal, stageColor)}>
        <span className="text-[10px] font-bold tracking-wider uppercase">{STATUS_LABEL[deal.status]}</span>
        {onMove && stages ? (
          <div {...stopDrag}>
            <Dropdown
              trigger={
                <button
                  type="button"
                  aria-label={`Ações de ${deal.title}`}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-white/90 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              }
            >
              <Link
                href={`/negociacoes/${deal.id}`}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" /> Abrir negociação
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
        ) : (
          <MoreHorizontal className="h-4 w-4 text-white/80" aria-hidden />
        )}
      </header>

      <div className="space-y-3 p-4">
        <Link href={`/negociacoes/${deal.id}`} className="block" {...stopDrag}>
          <h3 className="line-clamp-2 text-base leading-snug font-bold text-foreground group-hover:text-primary">
            {deal.title}
          </h3>
          {showContact && (
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground uppercase">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{contactName}</span>
            </p>
          )}
        </Link>

        {origin && (
          <div className="flex items-center gap-2.5 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5 text-xs">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Megaphone className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 text-muted-foreground">
              Origem: <span className="text-primary">{origin}</span>
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div
            className={cn(
              "rounded-xl border px-3 py-2",
              Number(deal.value) > 0
                ? "border-success/25 bg-success/8"
                : "border-primary/15 bg-primary/5"
            )}
          >
            <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Valor</p>
            <p className={cn("mt-0.5 text-[13px] font-bold whitespace-nowrap tabular-nums", Number(deal.value) > 0 ? "text-success-text" : "text-foreground")}>
              {Number(deal.value) > 0 ? cardValue(Number(deal.value)) : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2">
            <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Qualificação</p>
            <p className="mt-0.5 flex items-center gap-1 text-sm font-bold text-foreground">
              <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />
              {temperature.label}
            </p>
          </div>
        </div>

        {deal.ai_status !== "none" && (
          <p className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1.5 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            {AI_STATUS[deal.ai_status]}
          </p>
        )}

        <div className="flex items-end justify-between gap-2 border-t border-border pt-3">
          <div className="min-w-0 space-y-1 text-xs">
            {phone && (
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">+{phone}</span>
              </p>
            )}
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              {formatDateTime(deal.created_at)}
            </p>
          </div>
          {deal.responsible ? (
            <span title={fullName(deal.responsible)}>
              <Avatar name={fullName(deal.responsible)} src={deal.responsible.avatar_url} size="sm" />
            </span>
          ) : (
            <Badge tone="slate">Sem responsável</Badge>
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag.id} tone={tag.tone} className="max-w-[8.5rem] truncate">
                {tag.name}
              </Badge>
            ))}
            {tags.length > 3 && <Badge tone="slate">+{tags.length - 3}</Badge>}
          </div>
        )}
      </div>

      <footer className="grid grid-cols-2 border-t border-border text-xs font-semibold" {...stopDrag}>
        <Link
          href={`/negociacoes/${deal.id}`}
          className="flex items-center justify-center gap-1.5 px-2 py-2.5 text-foreground transition-colors hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Abrir lead
        </Link>
        {phone ? (
          <Link
            href={`/atendimento?telefone=${phone}`}
            className="flex items-center justify-center gap-1.5 border-l border-border bg-success/8 px-2 py-2.5 text-success-text transition-colors hover:bg-success/15"
          >
            <MessageCircle className="h-3.5 w-3.5" /> Conversa
          </Link>
        ) : (
          <span className="flex items-center justify-center gap-1.5 border-l border-border px-2 py-2.5 text-muted-foreground">
            <MessageCircle className="h-3.5 w-3.5" /> Sem WhatsApp
          </span>
        )}
      </footer>
    </article>
  );
}
