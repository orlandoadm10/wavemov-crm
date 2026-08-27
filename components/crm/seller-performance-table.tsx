import type { SellerRow } from "@/app/(dashboard)/relatorios/vendedores/page";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DataTable, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn, formatCurrency } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

const ROLE_LABELS: Record<string, string> = {
  org_admin: "Administrador",
  seller: "Vendedor",
  agent: "Atendente",
  viewer: "Somente leitura",
};

/**
 * Rendimento por vendedor: o que cada pessoa recebeu do rodízio e o que fez
 * com isso.
 *
 * A leitura pretendida é comparar RECEBIDOS com PESO. Duas pessoas de peso
 * igual recebendo números muito diferentes significa que a configuração não
 * está fazendo o que o administrador acha que faz — e é o motivo de a coluna
 * de peso ficar ao lado da de recebidos, e não no fim da linha.
 */
export function SellerPerformanceTable({ rows }: { rows: SellerRow[] }) {
  const maiorRecebido = Math.max(...rows.map((r) => r.received), 1);

  return (
    <DataTable>
      <THead>
        <Th>Pessoa</Th>
        <Th className="text-center">Fila</Th>
        <Th>Leads recebidos</Th>
        <Th className="text-center">Em aberto</Th>
        <Th className="text-center">Ganhos</Th>
        <Th className="text-center">Perdidos</Th>
        <Th className="text-center">Conversão</Th>
        <Th className="text-right">Valor ganho</Th>
        <Th className="text-center">Tarefas</Th>
        <Th className="text-center">Notas</Th>
      </THead>
      <TBody>
        {rows.map((row) => (
          <Tr key={row.profileId}>
            <Td>
              <div className="flex items-center gap-2.5">
                <Avatar name={row.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{row.name}</p>
                  <p className="truncate text-xs text-ink-faint">
                    {row.jobTitle || ROLE_LABELS[row.role] || row.role}
                  </p>
                </div>
              </div>
            </Td>

            <Td className="text-center">
              {/* Duas explicações diferentes para "fulano não está recebendo
                  nada", e o administrador precisa distinguir: fora da fila é
                  configuração; fora do plantão é o dia de hoje. */}
              {row.weight === null ? (
                <Badge tone="slate">Fora da fila</Badge>
              ) : !row.onDuty ? (
                <Badge tone="amber">Sem plantão</Badge>
              ) : (
                <span className="font-semibold text-ink" title="Leads consecutivos por vez">
                  {row.weight}
                </span>
              )}
            </Td>

            <Td>
              <div className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-sm font-bold text-ink">{row.received}</span>
                {/* Barra comparativa: a distribuição se lê de relance. */}
                <span
                  aria-hidden
                  className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100"
                >
                  <span
                    className="block h-full rounded-full bg-primary-500"
                    style={{ width: `${Math.round((row.received / maiorRecebido) * 100)}%` }}
                  />
                </span>
              </div>
            </Td>

            <Td className="text-center text-ink-soft">{row.open}</Td>
            <Td className="text-center font-semibold text-emerald-600">{row.won}</Td>
            <Td className="text-center text-ink-soft">{row.lost}</Td>

            <Td className="text-center">
              {row.conversion === null ? (
                <span className="text-xs text-ink-faint" title="Nenhum lead fechado no período">
                  —
                </span>
              ) : (
                <span
                  className={cn(
                    "font-semibold",
                    row.conversion >= 0.5
                      ? "text-emerald-600"
                      : row.conversion >= 0.25
                        ? "text-amber-600"
                        : "text-rose-600"
                  )}
                >
                  {Math.round(row.conversion * 100)}%
                </span>
              )}
            </Td>

            <Td className="text-right font-medium text-ink">{formatCurrency(row.wonValue)}</Td>

            <Td className="text-center">
              <Link
                href="/tarefas"
                className="inline-flex items-center gap-1.5 text-ink-soft hover:text-primary-700"
              >
                {row.tasksPending}
                {row.tasksOverdue > 0 && (
                  <span
                    className="inline-flex items-center gap-0.5 text-xs font-semibold text-rose-600"
                    title={`${row.tasksOverdue} tarefa(s) vencida(s)`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {row.tasksOverdue}
                  </span>
                )}
              </Link>
            </Td>

            <Td className="text-center text-ink-soft">{row.notes}</Td>
          </Tr>
        ))}
      </TBody>
    </DataTable>
  );
}
