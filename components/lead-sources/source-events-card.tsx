"use client";

import { reprocessLeadSourceEventAction, type LeadSourceActionResult } from "@/app/(dashboard)/fontes/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { SourceEventView } from "./types";

function outcomeBadge(event: SourceEventView) {
  if (event.status === "failed") return <Badge tone="red" dot>Falhou</Badge>;
  if (event.status === "duplicate") return <Badge tone="slate" dot>Já estava no CRM</Badge>;
  if (event.deduplicated) return <Badge tone="blue" dot>Anexado ao lead existente</Badge>;
  return <Badge tone="green" dot>Lead criado</Badge>;
}

/** "Últimas entregas": o que chegou, o que virou lead e o que falhou (e por quê). */
export function SourceEventsCard({ events }: { events: SourceEventView[] }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<LeadSourceActionResult & { eventId?: string } | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function reprocess(eventId: string) {
    setFeedback(null);
    setRunningId(eventId);
    startTransition(async () => {
      const result = await reprocessLeadSourceEventAction(eventId);
      setFeedback({ ...result, eventId });
      setRunningId(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader title="Últimas entregas" subtitle="As 30 mais recentes. O histórico é guardado por 30 dias." />
      {events.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-faint">Nenhuma entrega recebida ainda.</p>
      ) : (
        <ul className="divide-y divide-line">
          {events.map((event) => (
            <li key={event.id} className="space-y-2 px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {outcomeBadge(event)}
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {event.dealId ? (
                    <Link href={`/negociacoes/${event.dealId}`} className="font-medium text-primary-600 hover:text-primary-700">
                      {event.leadLabel ?? "Abrir lead"}
                    </Link>
                  ) : (
                    (event.leadLabel ?? "—")
                  )}
                </span>
                <time dateTime={event.receivedAt} className="text-xs text-ink-faint">
                  {formatDateTime(event.receivedAt)}
                </time>
                {event.status === "failed" && event.fields.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={runningId === event.id}
                    disabled={runningId !== null}
                    onClick={() => reprocess(event.id)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Reprocessar
                  </Button>
                )}
              </div>
              {event.error && <p className="text-xs text-destructive-text">{event.error}</p>}
              {feedback?.eventId === event.id && (
                <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-xs text-destructive-text" : "text-xs text-success-text"}>
                  {feedback.error ?? feedback.success}
                </p>
              )}
              {event.fields.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-ink-faint hover:text-primary-700">
                    Ver os {event.fields.length} campos recebidos
                  </summary>
                  <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 rounded-lg bg-muted/50 p-3 ring-1 ring-line sm:grid-cols-[minmax(0,14rem)_1fr]">
                    {event.fields.map((field) => (
                      <div key={field.key} className="contents">
                        <dt className="truncate text-ink-faint" title={field.key}>{field.label}</dt>
                        <dd className="break-words text-ink">{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
