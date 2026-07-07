import { cn } from "@/lib/utils";

type Tone =
  | "blue" | "green" | "red" | "amber" | "slate" | "violet" | "cyan" | "orange";

const tones: Record<Tone, string> = {
  blue: "bg-primary-50 text-primary-700 ring-primary-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  red: "bg-rose-50 text-rose-700 ring-rose-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  orange: "bg-orange-50 text-orange-600 ring-orange-100",
};

export function Badge({
  tone = "slate",
  dot,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// Badges semânticos do CRM
export function DealStatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: Tone; label: string }> = {
    open: { tone: "green", label: "Em andamento" },
    won: { tone: "blue", label: "Ganho" },
    lost: { tone: "red", label: "Perdido" },
    archived: { tone: "slate", label: "Arquivado" },
  };
  const s = map[status] ?? map.open;
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { tone: Tone; label: string }> = {
    low: { tone: "slate", label: "Baixa" },
    medium: { tone: "amber", label: "Média" },
    high: { tone: "red", label: "Alta" },
  };
  const p = map[priority] ?? map.medium;
  return <Badge tone={p.tone}>{p.label}</Badge>;
}

export function TemperatureBadge({ temperature }: { temperature: string }) {
  const map: Record<string, { tone: Tone; label: string }> = {
    cold: { tone: "cyan", label: "Frio" },
    warm: { tone: "amber", label: "Morno" },
    hot: { tone: "orange", label: "🔥 Quente" },
  };
  const t = map[temperature] ?? map.cold;
  return <Badge tone={t.tone}>{t.label}</Badge>;
}

export function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { tone: Tone; label: string }> = {
    org_admin: { tone: "blue", label: "Admin" },
    seller: { tone: "green", label: "Vendedor" },
    agent: { tone: "violet", label: "Atendente" },
    viewer: { tone: "slate", label: "Visualizador" },
  };
  const r = map[role] ?? map.viewer;
  return <Badge tone={r.tone}>{r.label}</Badge>;
}
