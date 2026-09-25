import { cn } from "@/lib/utils";
import type { Deal } from "@/types";

/**
 * Peças visuais da oportunidade usadas no cartão, na lista e no painel
 * lateral — um lugar só, para as três não divergirem.
 */

/** Paleta das iniciais: tons de marca, sem cores que signifiquem estado. */
const AVATAR_TONES = [
  "bg-primary/12 text-primary",
  "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
  "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
  "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  "bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300",
];

function toneFor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

/** Avatar quadrado da oportunidade (print): inicial numa cor estável por nome. */
export function EntityAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-display font-bold",
        size === "sm" && "h-7 w-7 text-xs",
        size === "md" && "h-9 w-9 text-sm",
        size === "lg" && "h-12 w-12 rounded-xl text-lg",
        toneFor(name)
      )}
    >
      {initial}
    </span>
  );
}

const TEMPERATURE: Record<Deal["temperature"], { label: string; className: string }> = {
  cold: { label: "Frio", className: "bg-primary/8 text-primary ring-primary/20" },
  warm: { label: "Morno", className: "bg-warning/15 text-warning-text ring-warning/30" },
  hot: { label: "Quente", className: "bg-destructive/10 text-destructive-text ring-destructive/25" },
};

/** Temperatura perceptível sem pintar o cartão (prompt de design, seção 9). */
export function TemperatureChip({ temperature }: { temperature: Deal["temperature"] }) {
  const t = TEMPERATURE[temperature] ?? TEMPERATURE.cold;
  return (
    <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-semibold ring-1 ring-inset", t.className)}>
      {t.label}
    </span>
  );
}

export const TEMPERATURE_OPTIONS = (Object.keys(TEMPERATURE) as Deal["temperature"][]).map((value) => ({
  value,
  label: TEMPERATURE[value].label,
}));

/** Origem curta para o chip: campanha > fonte UTM > origem. */
export function dealOrigin(deal: Pick<Deal, "utm_campaign" | "utm_source" | "source">): string | null {
  return deal.utm_source || deal.utm_campaign || deal.source || null;
}

export function OriginChip({ origin }: { origin: string }) {
  return (
    <span
      title={origin}
      className="inline-flex h-5 max-w-28 items-center truncate rounded-md bg-secondary px-1.5 text-[11px] font-medium text-secondary-foreground"
    >
      {origin}
    </span>
  );
}
