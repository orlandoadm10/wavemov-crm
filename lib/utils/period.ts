import { endOfDay, endOfMonth, startOfDay, startOfMonth, subDays } from "date-fns";

// Períodos usados nas telas de relatório e no resumo da empresa.
// Mantidos como chaves curtas porque viajam na URL (?periodo=7d).
export const PERIOD_KEYS = ["hoje", "7d", "30d", "mes"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  hoje: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
  mes: "Este mês",
};

export interface ResolvedPeriod {
  key: PeriodKey;
  label: string;
  /** Início do intervalo (inclusive). */
  from: Date;
  /** Fim do intervalo (inclusive). */
  to: Date;
  /** Quantidade de dias cobertos — usada para média por dia e para o gráfico. */
  days: number;
}

export function parsePeriod(value: string | undefined): PeriodKey {
  return PERIOD_KEYS.includes(value as PeriodKey) ? (value as PeriodKey) : "7d";
}

export function resolvePeriod(value: string | undefined, now = new Date()): ResolvedPeriod {
  const key = parsePeriod(value);
  const to = endOfDay(now);

  switch (key) {
    case "hoje":
      return { key, label: PERIOD_LABELS[key], from: startOfDay(now), to, days: 1 };
    case "30d":
      return { key, label: PERIOD_LABELS[key], from: startOfDay(subDays(now, 29)), to, days: 30 };
    case "mes": {
      const from = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const days =
        Math.round((startOfDay(now).getTime() - from.getTime()) / 86_400_000) + 1;
      return {
        key,
        label: PERIOD_LABELS[key],
        from,
        to: monthEnd < to ? endOfDay(monthEnd) : to,
        days,
      };
    }
    case "7d":
    default:
      return { key, label: PERIOD_LABELS[key], from: startOfDay(subDays(now, 6)), to, days: 7 };
  }
}

/**
 * Série diária contínua (sem buracos) entre `from` e `to`.
 * Recebe as datas dos registros e devolve `{ day, label, total }` por dia.
 */
export function dailySeries(dates: (string | Date)[], from: Date, to: Date) {
  const buckets = new Map<string, number>();
  const cursor = new Date(startOfDay(from));
  const last = startOfDay(to);

  while (cursor <= last) {
    buckets.set(dayKey(cursor), 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const raw of dates) {
    const key = dayKey(new Date(raw));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()].map(([day, total]) => ({
    day,
    label: `${day.slice(8, 10)}/${day.slice(5, 7)}`,
    total,
  }));
}

function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}
