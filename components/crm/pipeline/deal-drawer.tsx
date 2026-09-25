"use client";

import { dealOrigin, EntityAvatar, TemperatureChip } from "@/components/crm/pipeline/deal-visuals";
import { Avatar } from "@/components/ui/avatar";
import { DealStatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency, formatDate, formatDateTime, fullName } from "@/lib/utils";
import { textOnColor } from "@/lib/utils/color";
import type { Deal, PipelineStage } from "@/types";
import { CalendarClock, ExternalLink, Mail, MessageCircle, Phone, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface NextTask {
  id: string;
  title: string;
  due_at: string | null;
}

/**
 * Painel lateral da oportunidade (print-melhorias-deals; prompt de design,
 * seções 12 e 13): clicar no cartão não tira a pessoa do Kanban. Mostra a
 * visão geral com o que o quadro já carregou e busca só a próxima tarefa. A
 * ficha completa (conversas, atividades, notas) continua em
 * `/negociacoes/[id]`, a um clique.
 *
 * Não é modal: o quadro segue utilizável atrás. Esc fecha.
 */
export function DealDrawer({
  deal,
  stage,
  onClose,
}: {
  deal: Deal | null;
  stage: PipelineStage | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [nextTask, setNextTask] = useState<NextTask | null | "loading">("loading");

  useEffect(() => {
    if (!deal) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deal, onClose]);

  useEffect(() => {
    if (!deal) return;
    let cancelled = false;
    setNextTask("loading");
    createClient()
      .from("tasks")
      .select("id, title, due_at")
      .eq("organization_id", deal.organization_id)
      .eq("deal_id", deal.id)
      .eq("status", "pending")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(1)
      .then(({ data }) => {
        if (!cancelled) setNextTask((data?.[0] as NextTask | undefined) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [deal]);

  if (!deal) return null;

  const phone = deal.contact?.whatsapp_phone ?? null;
  const email = deal.contact?.email ?? null;
  const overdue =
    nextTask && nextTask !== "loading" && nextTask.due_at ? new Date(nextTask.due_at).getTime() < Date.now() : false;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="painel-oportunidade-titulo"
      className="animate-fade-up fixed inset-0 z-40 flex flex-col bg-card shadow-lift sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[440px] sm:border-l sm:border-border"
    >
      <header className="flex items-start gap-3 border-b border-border p-5">
        <EntityAvatar name={deal.title} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 id="painel-oportunidade-titulo" className="truncate text-lg font-bold text-foreground">
            {deal.title}
          </h2>
          <p className="truncate text-sm text-muted-foreground">{deal.contact?.name ?? "Sem contato"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TemperatureChip temperature={deal.temperature} />
            <DealStatusBadge status={deal.status} />
          </div>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Fechar painel"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <nav aria-label="Ações rápidas" className="grid grid-cols-4 gap-2 border-b border-border px-5 py-3">
        <QuickAction href={phone ? `/atendimento?telefone=${phone}` : undefined} icon={<MessageCircle />} label="WhatsApp" tone="text-success-text" />
        <QuickAction href={phone ? `tel:+${phone}` : undefined} icon={<Phone />} label="Ligar" external />
        <QuickAction href={email ? `mailto:${email}` : undefined} icon={<Mail />} label="E-mail" external />
        <QuickAction href={`/negociacoes/${deal.id}`} icon={<ExternalLink />} label="Abrir ficha" />
      </nav>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        {/* Próxima ação em destaque (seção 13). */}
        <section
          aria-label="Próxima ação"
          className={cn(
            "rounded-xl border p-3.5",
            overdue ? "border-destructive/30 bg-destructive/5" : "border-warning/35 bg-warning/8"
          )}
        >
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Próxima ação
          </p>
          {nextTask === "loading" ? (
            <div className="skeleton mt-2 h-10 w-full" />
          ) : nextTask ? (
            <>
              <p className={cn("mt-1.5 text-xs font-semibold", overdue ? "text-destructive-text" : "text-warning-text")}>
                {nextTask.due_at ? formatDateTime(nextTask.due_at) : "Sem data"}
                {overdue && " · atrasada"}
              </p>
              <p className="text-sm font-medium text-foreground">{nextTask.title}</p>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">Nenhuma tarefa pendente.</p>
          )}
          <Link href={`/negociacoes/${deal.id}`} className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">
            Ver tarefas na ficha →
          </Link>
        </section>

        <section aria-labelledby="dados-principais">
          <div className="mb-2 flex items-center justify-between">
            <h3 id="dados-principais" className="font-sans text-sm font-semibold text-foreground">
              Dados principais
            </h3>
            <Link href={`/negociacoes/${deal.id}`} className={buttonClasses({ variant: "outline", size: "sm" })}>
              Editar
            </Link>
          </div>
          <dl className="divide-y divide-border text-sm">
            <Row label="Contato" value={deal.contact?.name} />
            <Row label="Telefone" value={phone ? `+${phone}` : deal.contact?.phone} />
            <Row label="E-mail" value={email} />
            <Row label="Origem" value={dealOrigin(deal)} />
            <Row
              label="Responsável"
              value={
                deal.responsible ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={fullName(deal.responsible)} src={deal.responsible.avatar_url} size="xs" />
                    {fullName(deal.responsible)}
                  </span>
                ) : null
              }
            />
            <Row
              label="Etapa"
              value={
                stage ? (
                  <span
                    className="rounded-md px-2 py-0.5 text-xs font-semibold"
                    style={{ background: stage.color || "var(--primary)", color: textOnColor(stage.color) }}
                  >
                    {stage.name}
                  </span>
                ) : null
              }
            />
            <Row label="Valor" value={Number(deal.value) > 0 ? formatCurrency(deal.value) : null} />
            <Row label="Previsão de fechamento" value={deal.expected_close_date ? formatDate(deal.expected_close_date) : null} />
            <Row label="Data de entrada" value={formatDate(deal.created_at)} />
          </dl>
        </section>
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-foreground">{value || "—"}</dd>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  tone,
  external,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  tone?: string;
  external?: boolean;
}) {
  const className = cn(
    "flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium transition-colors [&_svg]:h-4 [&_svg]:w-4",
    href ? cn("hover:bg-muted", tone ?? "text-primary") : "cursor-not-allowed text-muted-foreground/50"
  );
  if (!href) {
    return (
      <span className={className} aria-disabled title={`${label} indisponível`}>
        {icon}
        {label}
      </span>
    );
  }
  return external ? (
    <a href={href} className={className}>
      {icon}
      {label}
    </a>
  ) : (
    <Link href={href} className={className}>
      {icon}
      {label}
    </Link>
  );
}
