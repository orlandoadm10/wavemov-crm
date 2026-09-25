/**
 * Estado de uma fonte de lead para a tela — sem framework.
 *
 * Segue a regra da saúde da entrada (`lead-ingestion/domain/ingestion-health`):
 * a tela afirma o que sabe e só pinta de vermelho o que exige ação. Uma fonte
 * quieta não é uma fonte quebrada; uma fonte cuja ÚLTIMA entrega falhou é.
 */
export type SourceStatusTone = "green" | "amber" | "red" | "slate";

export interface SourceStatus {
  tone: SourceStatusTone;
  label: string;
}

export interface SourceStatusInput {
  isActive: boolean;
  lastEventAt: string | null;
  /** Resultado da entrega mais recente, se houver. */
  lastStatus: "processed" | "duplicate" | "failed" | null;
  now?: Date;
}

/** "agora há pouco", "há 3 h", "há 2 dias". */
export function formatSince(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 2) return "agora há pouco";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

export function describeSourceStatus({ isActive, lastEventAt, lastStatus, now }: SourceStatusInput): SourceStatus {
  if (!isActive) return { tone: "slate", label: "Pausada" };
  if (!lastEventAt) return { tone: "amber", label: "Aguardando o primeiro lead" };
  if (lastStatus === "failed") return { tone: "red", label: "A última entrega falhou" };
  return { tone: "green", label: `Recebendo · ${formatSince(lastEventAt, now)}` };
}
