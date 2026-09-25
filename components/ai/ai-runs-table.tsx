import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import type { AiRun } from "@/types";
import { Activity } from "lucide-react";

export type AiRunRow = AiRun & { conversation: { name: string | null; phone: string } | null };

const STATUS: Record<AiRun["status"], { tone: "green" | "amber" | "slate" | "red"; label: string }> = {
  success: { tone: "green", label: "Respondeu" },
  handoff: { tone: "amber", label: "Transferiu" },
  skipped: { tone: "slate", label: "Não respondeu" },
  error: { tone: "red", label: "Falhou" },
};

export function AiRunsTable({ runs }: { runs: AiRunRow[] }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={<Activity className="h-6 w-6" />}
        title="Nenhum atendimento da IA ainda"
        description="Quando um agente ativo responder uma conversa, cada turno aparece aqui com as ações que ele executou no CRM."
      />
    );
  }

  return (
    <DataTable>
      <thead className="bg-muted/50 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
        <tr>
          <th className="px-5 py-3.5">Quando</th>
          <th className="px-5 py-3.5">Conversa</th>
          <th className="px-5 py-3.5">Resultado</th>
          <th className="px-5 py-3.5">Ações no CRM</th>
          <th className="px-5 py-3.5">Resposta / motivo</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {runs.map((run) => {
          const status = STATUS[run.status];
          return (
            <tr key={run.id} className="align-top transition-colors hover:bg-primary-50/40">
              <td className="px-5 py-3.5 whitespace-nowrap text-ink-soft">{formatDateTime(run.created_at)}</td>
              <td className="px-5 py-3.5 text-ink">
                {run.conversation ? run.conversation.name ?? `+${run.conversation.phone}` : "—"}
              </td>
              <td className="px-5 py-3.5">
                <Badge tone={status.tone} dot>
                  {status.label}
                </Badge>
              </td>
              <td className="px-5 py-3.5">
                {run.tool_calls.length === 0 ? (
                  <span className="text-ink-faint">—</span>
                ) : (
                  <ul className="space-y-0.5 text-xs text-ink-soft">
                    {run.tool_calls.map((call, i) => (
                      <li key={i} className={call.ok ? undefined : "text-destructive-text"}>
                        {call.summary ?? call.name}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="max-w-md px-5 py-3.5 text-xs text-ink-soft">
                <p className="line-clamp-3 whitespace-pre-wrap">{run.error ?? run.output_text ?? "—"}</p>
                {(run.prompt_tokens > 0 || run.latency_ms) && (
                  <p className="mt-1 text-[11px] text-ink-faint">
                    {run.model ?? ""} · {run.prompt_tokens + run.completion_tokens} tokens
                    {run.latency_ms ? ` · ${(run.latency_ms / 1000).toFixed(1)}s` : ""}
                  </p>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
