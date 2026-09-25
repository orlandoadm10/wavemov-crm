import { cn } from "@/lib/utils";

type Tone =
  | "blue" | "green" | "red" | "amber" | "slate" | "violet" | "cyan" | "orange";

const tones: Record<Tone, string> = {
  blue: "bg-primary/10 text-primary ring-primary/25",
  green: "bg-success/12 text-success-text ring-success/30",
  red: "bg-destructive/10 text-destructive-text ring-destructive/25",
  amber: "bg-warning/15 text-warning-text ring-warning/40",
  slate: "bg-muted text-muted-foreground ring-border",
  // Sem token semântico no guia: paleta do Tailwind com variante escura.
  violet: "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-400/15 dark:text-violet-200 dark:ring-violet-300/25",
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100 dark:bg-cyan-400/15 dark:text-cyan-200 dark:ring-cyan-300/25",
  orange: "bg-orange-50 text-orange-600 ring-orange-100 dark:bg-orange-400/15 dark:text-orange-200 dark:ring-orange-300/25",
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
        // Badge comum: compacto, raio de 6px, peso 600 (seção 18). Pílula
        // completa fica para contadores e indicadores de resumo.
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset",
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
