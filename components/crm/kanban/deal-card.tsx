"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { cn, formatDateTime, fullName } from "@/lib/utils";
import type { Deal, DealTag, PipelineStage } from "@/types";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalLink, Megaphone, MessageCircle, MoreHorizontal, Sparkles, User, UserRound } from "lucide-react";
import Link from "next/link";

/**
 * Cartão do lead no Kanban (DESIGN_GUIDE, seção 13; print 1).
 *
 * Enxuto de propósito (P.O., 25/09): só o que decide a próxima ação. Valor e
 * qualificação saíram (o valor está na soma da coluna e no detalhe); telefone
 * virou o botão de conversa; a data virou "há N". Cabem ~3 cartões por coluna
 * numa tela de 900px, contra 1,5 antes.
 */

/** Só aparece fora de "aberto": no filtro padrão a situação é óbvia. */
const STATUS_LABEL: Partial<Record<Deal["status"], string>> = {
  won: "Venda realizada",
  lost: "Perdida",
  archived: "Arquivada",
};

const AI_STATUS: Record<Exclude<Deal["ai_status"], "none">, string> = {
  qualifying: "Em qualificação pela IA",
  qualified: "Qualificado pela IA",
  handoff: "Transferido pela IA",
};

export function dealTags(deal: Deal): DealTag[] {
  return (deal.tag_assignments ?? [])
    .map((assignment) => assignment.tag)
    .filter((tag): tag is DealTag => Boolean(tag));
}

/** Faixa do topo: cor da etapa enquanto aberto; verde/vermelho/neutro depois. */
function stripColor(deal: Deal, stageColor: string): string {
  if (deal.status === "won") return "var(--success)";
  if (deal.status === "lost") return "var(--destructive)";
  if (deal.status === "archived") return "var(--muted-foreground)";
  return stageColor;
}

/** "há 2 d", "há 5 h" — a data completa fica no `title`. */
function since(iso: string): string {
  return `há ${formatDistanceToNowStrict(new Date(iso), { locale: ptBR })}`;
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
  const origin = deal.utm_campaign || deal.utm_source || deal.source;
  const phone = deal.contact?.whatsapp_phone ?? null;
  const contactName = deal.contact?.name?.trim();
  // "Isnar · MR Corretora" já contém o contato: repetir é ruído.
  const showContact = contactName && !deal.title.toLowerCase().includes(contactName.toLowerCase());
  const statusLabel = STATUS_LABEL[deal.status];
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
      <div className="h-1" style={{ background: stripColor(deal, stageColor) }} />

      <div className="space-y-2 p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1">
          <Link href={`/negociacoes/${deal.id}`} className="min-w-0" {...stopDrag}>
            {statusLabel && (
              <span className="mb-0.5 block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                {statusLabel}
              </span>
            )}
            <h3 className="line-clamp-2 text-[15px] leading-snug font-bold text-foreground group-hover:text-primary">
              {deal.title}
            </h3>
          </Link>
          {onMove && stages && (
            <div {...stopDrag}>
              <Dropdown
                trigger={
                  <button
                    type="button"
                    aria-label={`Ações de ${deal.title}`}
                    className="-mt-1 -mr-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
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
          )}
        </div>

        {showContact && (
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{contactName}</span>
          </p>
        )}

        {origin && (
          <p className="flex min-w-0 items-center gap-1.5 text-xs" title={`Origem: ${origin}`}>
            <Megaphone className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate text-primary">{origin}</span>
          </p>
        )}

        {/* Rodapé: idade · IA · tags … conversa · responsável. */}
        <div className="flex items-center gap-1.5 pt-1" {...stopDrag}>
          <time
            dateTime={deal.created_at}
            title={`Entrou em ${formatDateTime(deal.created_at)}`}
            className="shrink-0 text-[11px] text-muted-foreground"
            suppressHydrationWarning
          >
            {since(deal.created_at)}
          </time>
          {deal.ai_status !== "none" && (
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-label={AI_STATUS[deal.ai_status]}>
              <title>{AI_STATUS[deal.ai_status]}</title>
            </Sparkles>
          )}
          <div className="flex min-w-0 flex-1 gap-1 overflow-hidden">
            {tags.slice(0, 2).map((tag) => (
              <Badge key={tag.id} tone={tag.tone} className="max-w-24 truncate">
                {tag.name}
              </Badge>
            ))}
            {tags.length > 2 && <Badge tone="slate">+{tags.length - 2}</Badge>}
          </div>
          {phone && (
            <Link
              href={`/atendimento?telefone=${phone}`}
              aria-label={`Abrir conversa com ${deal.title}`}
              title="Abrir conversa no WhatsApp"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-success-text transition-colors hover:bg-success/15"
            >
              <MessageCircle className="h-4 w-4" />
            </Link>
          )}
          {deal.responsible ? (
            <span title={fullName(deal.responsible)} className="shrink-0">
              <Avatar name={fullName(deal.responsible)} src={deal.responsible.avatar_url} size="xs" />
            </span>
          ) : (
            <span
              title="Sem responsável"
              aria-label="Sem responsável"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground"
            >
              <UserRound className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
