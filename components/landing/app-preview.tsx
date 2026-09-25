import { cn } from "@/lib/utils";
import { Clock, TrendingUp, User } from "lucide-react";

type PreviewCard = {
  status: string;
  statusColor: string;
  title: string;
  meta: string[];
  value: string;
};

const COLUMNS: { name: string; total: string; cards: PreviewCard[] }[] = [
  {
    name: "Novo",
    total: "R$ 12.400",
    cards: [
      {
        status: "Aguardando contato",
        statusColor: "bg-amber-400",
        title: "Consultoria comercial",
        meta: ["Origem: formulário", "Responsável: Ana"],
        value: "R$ 4.200",
      },
      {
        status: "Em contato",
        statusColor: "bg-primary-500",
        title: "Oportunidade inbound",
        meta: ["22/05 · 18:49", "Etapa: qualificação"],
        value: "R$ 8.200",
      },
    ],
  },
  {
    name: "Andamento",
    total: "R$ 26.900",
    cards: [
      {
        status: "Tarefa pendente",
        statusColor: "bg-violet-500",
        title: "Follow-up agendado",
        meta: ["Responsável definido", "Próxima ação criada"],
        value: "R$ 15.400",
      },
      {
        status: "Reunião marcada",
        statusColor: "bg-cyan-500",
        title: "Expansão de contrato",
        meta: ["Contato vinculado", "Etapa: apresentação"],
        value: "R$ 11.500",
      },
    ],
  },
  {
    name: "Fechamento",
    total: "R$ 38.750",
    cards: [
      {
        status: "Proposta enviada",
        statusColor: "bg-emerald-500",
        title: "Negociação ativa",
        meta: ["Histórico completo", "Aguardando aprovação"],
        value: "R$ 38.750",
      },
    ],
  },
];

/** Mock estático do Kanban de negociações usado como prova visual do produto. */
export function AppPreview({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)} aria-hidden>
      <div className="absolute -inset-x-8 -top-10 bottom-0 rounded-2xl bg-linear-to-br from-primary-100/70 via-white to-primary-50/60 blur-2xl" />

      <div className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-(--shadow-pop)">
        <div className="flex h-12 items-center justify-between border-b border-line px-4">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold">
            <span className="rounded-full bg-primary-50 px-2.5 py-1 text-primary-700">
              Negociações
            </span>
            <span className="px-2.5 py-1 text-ink-faint">Tarefas</span>
            <span className="hidden px-2.5 py-1 text-ink-faint sm:inline">
              Dashboard
            </span>
          </div>
          <span className="h-6 w-6 rounded-full bg-slate-100" />
        </div>

        <div className="grid grid-cols-2 gap-3 bg-background p-3 sm:grid-cols-3">
          {COLUMNS.map((column, index) => (
            <div
              key={column.name}
              className={cn(
                "rounded-xl bg-white p-2.5 ring-1 ring-line",
                index === 2 && "hidden sm:block"
              )}
            >
              <div className="mb-2.5 flex items-center justify-between px-0.5">
                <span className="truncate text-[11px] font-bold tracking-tight text-ink">
                  {column.name}
                </span>
                <span className="shrink-0 text-[10px] font-semibold text-ink-faint">
                  {column.total}
                </span>
              </div>
              <div className="space-y-2">
                {column.cards.map((card) => (
                  <div
                    key={card.title}
                    className="rounded-lg border border-line bg-white p-2.5 shadow-(--shadow-card)"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={cn("h-1.5 w-1.5 rounded-full", card.statusColor)} />
                      <span className="text-[10px] font-medium text-ink-faint">
                        {card.status}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] font-bold text-ink">
                      {card.title}
                    </p>
                    <p className="mt-1 text-[10px] leading-relaxed text-ink-faint">
                      {card.meta.join(" · ")}
                    </p>
                    <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                      <span className="text-[11px] font-bold text-primary-700">
                        {card.value}
                      </span>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                        <User className="h-2.5 w-2.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <FloatingBadge
        className="-bottom-6 -left-6 hidden lg:flex"
        icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
        value="360°"
        label="Visão completa da operação"
      />
      <FloatingBadge
        className="-right-6 -top-7 hidden lg:flex"
        icon={<Clock className="h-4 w-4 text-primary-600" />}
        value="Follow-up"
        label="Nenhum lead esquecido"
      />
    </div>
  );
}

function FloatingBadge({
  icon,
  value,
  label,
  className,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute items-center gap-2.5 rounded-xl border border-line bg-white/90 px-3.5 py-2.5 shadow-(--shadow-pop) backdrop-blur-md",
        className
      )}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
        {icon}
      </span>
      <span className="flex flex-col leading-tight">
        <strong className="text-xs font-bold text-ink">{value}</strong>
        <span className="text-[10px] text-ink-faint">{label}</span>
      </span>
    </div>
  );
}
