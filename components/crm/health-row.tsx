// Linha de indicador com semáforo, ponto colorido e valor à direita.
//
// Nasceu privada dentro de `app/(dashboard)/empresas/[id]/page.tsx` e foi
// extraída ao ganhar o segundo consumidor (o painel de saúde da entrada de
// leads, em `/atendimento/configuracoes` e `/formularios`). A extração
// aconteceu ANTES da duplicação, não depois: copiar as 25 linhas teria
// funcionado hoje e divergido na primeira mudança de tom ou de espaçamento.
//
// Server Component — nenhum estado, nenhum evento.
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";

export type HealthTone = "green" | "amber" | "red" | "slate";

const TONE_DOT: Record<HealthTone, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  slate: "bg-slate-300",
};

export function HealthRow({
  icon,
  title,
  description,
  value,
  tone,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  value: ReactNode;
  tone: HealthTone;
  /** CTA opcional abaixo da descrição — usado para "como consertar". */
  action?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-ink-faint">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {/* Sem `truncate` quando há ação: a frase do indicador é a informação,
            e cortá-la com reticências esconde justamente o "há N dias". */}
        <p className={action ? "text-xs text-ink-faint" : "truncate text-xs text-ink-faint"}>
          {description}
        </p>
        {action}
      </div>
      <Badge tone={tone}>{value}</Badge>
    </li>
  );
}
