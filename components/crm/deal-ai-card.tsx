import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import type { AiStatus } from "@/types";
import { Bot } from "lucide-react";

const STATUS: Record<AiStatus, { tone: "slate" | "violet" | "green" | "amber"; label: string }> = {
  none: { tone: "slate", label: "Sem IA" },
  qualifying: { tone: "violet", label: "IA qualificando" },
  qualified: { tone: "green", label: "Qualificado pela IA" },
  handoff: { tone: "amber", label: "Transferido para a equipe" },
};

/** O que o agente de IA levantou sobre o lead (extração estruturada). */
export function DealAiCard({
  aiStatus,
  qualification,
}: {
  aiStatus: AiStatus;
  qualification: Record<string, unknown> | null | undefined;
}) {
  const entries = Object.entries(qualification ?? {}).filter(([, v]) => v !== null && v !== "");
  if (aiStatus === "none" && entries.length === 0) return null;
  const status = STATUS[aiStatus] ?? STATUS.none;

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Bot className="h-4 w-4 text-violet-600" /> Qualificação da IA
          </span>
        }
        subtitle="Dados coletados pelo agente durante a conversa"
        action={<Badge tone={status.tone}>{status.label}</Badge>}
      />
      {entries.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-faint">Nenhum dado coletado ainda.</p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 px-5 py-4 text-sm sm:grid-cols-2">
          {entries.map(([key, value]) => (
            <div key={key} className="min-w-0">
              <dt className="text-xs text-ink-faint">{key.replace(/_/g, " ")}</dt>
              <dd className="truncate font-medium text-ink">{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
