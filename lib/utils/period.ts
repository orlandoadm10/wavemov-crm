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

/**
 * O fuso do negócio, não o do processo. Em produção o Node roda em UTC, então
 * `startOfDay`/`endOfDay` do date-fns recortariam o período das 21h do dia
 * anterior às 21h — e um lead criado às 22h BRT cairia no dia seguinte. As RPCs
 * de relatório já agrupam em `America/Sao_Paulo`; as bordas do período e as
 * chaves do eixo precisam usar exatamente o mesmo fuso, senão o gráfico
 * diverge dos totais.
 */
export const APP_TIME_ZONE = "America/Sao_Paulo";

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
  const to = endOfZonedDay(now);

  switch (key) {
    case "hoje":
      return { key, label: PERIOD_LABELS[key], from: startOfZonedDay(now), to, days: 1 };
    case "30d":
      return { key, label: PERIOD_LABELS[key], from: addZonedDays(now, -29), to, days: 30 };
    case "mes": {
      const [year, month, day] = zonedParts(now);
      const from = zonedInstant(year, month, 1);
      // Dia 0 do mês seguinte é o último dia deste mês.
      const monthEnd = endOfZonedDay(zonedInstant(year, month + 1, 0));
      return {
        key,
        label: PERIOD_LABELS[key],
        from,
        to: monthEnd < to ? monthEnd : to,
        days: day,
      };
    }
    case "7d":
    default:
      return { key, label: PERIOD_LABELS[key], from: addZonedDays(now, -6), to, days: 7 };
  }
}

/**
 * Eixo diário contínuo (sem buracos) entre `from` e `to`, no fuso da aplicação.
 * Devolve `{ day, label }` por dia civil — `day` no formato `YYYY-MM-DD`, que é
 * o mesmo `bucket_start` devolvido pelas RPCs que agrupam por dia.
 */
export function zonedDayRange(from: Date, to: Date) {
  const last = zonedDayKey(to);
  // Intervalo invertido não é um eixo de um dia: é `resolvePeriod` quebrado.
  // Devolver vazio faz o gráfico aparecer sem barras em vez de mentir um dia.
  if (zonedDayKey(from) > last) return [];

  const days: { day: string; label: string }[] = [];
  let cursor = startOfZonedDay(from);

  // O maior período do produto é `mes` (31 dias). Um eixo de mais de um ano
  // significa borda errada — falhar alto é melhor que truncar em silêncio.
  const TETO_DE_DIAS = 400;
  for (let i = 0; i <= TETO_DE_DIAS; i += 1) {
    if (i === TETO_DE_DIAS) {
      throw new Error(
        `Intervalo de período maior que ${TETO_DE_DIAS} dias (${zonedDayKey(from)} a ${last}).`
      );
    }
    const day = zonedDayKey(cursor);
    days.push({ day, label: `${day.slice(8, 10)}/${day.slice(5, 7)}` });
    if (day >= last) break;
    cursor = addZonedDays(cursor, 1);
  }

  return days;
}

/**
 * Série diária contínua (sem buracos) entre `from` e `to`.
 * Recebe as datas dos registros e devolve `{ day, label, total }` por dia.
 */
export function dailySeries(dates: (string | Date)[], from: Date, to: Date) {
  const buckets = new Map<string, number>();
  const axis = zonedDayRange(from, to);
  for (const { day } of axis) buckets.set(day, 0);

  for (const raw of dates) {
    const key = zonedDayKey(new Date(raw));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return axis.map(({ day, label }) => ({ day, label, total: buckets.get(day) ?? 0 }));
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** `YYYY-MM-DD` do dia civil em `APP_TIME_ZONE` que contém o instante. */
export function zonedDayKey(date: Date): string {
  // en-CA formata como YYYY-MM-DD.
  return dayFormatter.format(date);
}

/** Ano, mês (1-12) e dia civis do instante em `APP_TIME_ZONE`. */
function zonedParts(date: Date): [number, number, number] {
  const [year, month, day] = zonedDayKey(date).split("-").map(Number);
  return [year, month, day];
}

/** Deslocamento do fuso, em milissegundos, no instante informado. */
function zonedOffsetMs(date: Date): number {
  const parts = partsFormatter.formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUTC = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour") % 24,
    value("minute"),
    value("second")
  );
  // O instante original truncado no segundo, para comparar com o mesmo grão.
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Instante correspondente à meia-noite da data civil informada em
 * `APP_TIME_ZONE`. Mês e dia podem transbordar (mês 13, dia 0), como em
 * `Date.UTC`. Resolve o deslocamento em duas passagens para continuar correto
 * caso o Brasil volte a adotar horário de verão.
 */
function zonedInstant(year: number, month: number, day: number): Date {
  const wallClock = Date.UTC(year, month - 1, day);
  const firstGuess = wallClock - zonedOffsetMs(new Date(wallClock));
  return new Date(wallClock - zonedOffsetMs(new Date(firstGuess)));
}

/** Início (00:00:00.000) do dia civil em `APP_TIME_ZONE`. */
export function startOfZonedDay(date: Date): Date {
  const [year, month, day] = zonedParts(date);
  return zonedInstant(year, month, day);
}

/** Fim (23:59:59.999) do dia civil em `APP_TIME_ZONE`. */
export function endOfZonedDay(date: Date): Date {
  const [year, month, day] = zonedParts(date);
  return new Date(zonedInstant(year, month, day + 1).getTime() - 1);
}

/** Meia-noite do dia civil deslocado em `amount` dias, em `APP_TIME_ZONE`. */
export function addZonedDays(date: Date, amount: number): Date {
  const [year, month, day] = zonedParts(date);
  return zonedInstant(year, month, day + amount);
}
