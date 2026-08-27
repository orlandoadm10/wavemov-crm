"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, TBody, TableFooter, THead, Td, Th, Tr } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { History } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export interface AuditEntry {
  id: string;
  deal_id: string | null;
  rule_name: string | null;
  origin: string;
  assigned_to_name: string | null;
  candidates: { profile_id: string; name: string; weight: number }[];
  ticket: number | null;
  reason: string;
  created_at: string;
}

const ORIGIN_LABELS: Record<string, string> = {
  public_form: "Formulário público",
  external_ingest: "Integração (n8n)",
  whatsapp: "WhatsApp",
};

/**
 * O motivo é a informação mais útil da tabela — e os dois motivos "ruins" são
 * os que fazem alguém corrigir a configuração, por isso ganham cor de alerta.
 */
const REASON_META: Record<string, { label: string; tone: "green" | "blue" | "amber" | "red"; hint: string }> = {
  rule_matched: {
    label: "Distribuído",
    tone: "green",
    hint: "Uma regra casou e o rodízio escolheu o responsável.",
  },
  form_default: {
    label: "Responsável do formulário",
    tone: "blue",
    hint: "O formulário tem responsável padrão, que vence o rodízio.",
  },
  no_rule: {
    label: "Sem regra",
    tone: "red",
    hint: "Nenhuma regra ativa casou com este lead. Ele entrou SEM responsável.",
  },
  no_candidates: {
    label: "Sem participantes",
    tone: "red",
    hint: "A regra casou, mas ninguém estava elegível: fila vazia ou todo mundo fora do plantão. O lead entrou SEM responsável.",
  },
  contention: {
    label: "Disputa pela vez",
    tone: "red",
    hint: "Havia gente de plantão, mas leads simultâneos disputaram a mesma posição da fila e a vez não se resolveu a tempo. O lead entrou SEM responsável.",
  },
};

export function DistributionAuditTable({
  entries,
  pageSize,
}: {
  entries: AuditEntry[];
  pageSize: number;
}) {
  const [apenasProblemas, setApenasProblemas] = useState(false);

  const visiveis = useMemo(
    () =>
      apenasProblemas
        ? entries.filter((e) =>
            ["no_rule", "no_candidates", "contention"].includes(e.reason)
          )
        : entries,
    [entries, apenasProblemas]
  );

  const SEM_RESPONSAVEL = ["no_rule", "no_candidates", "contention"];
  const problemas = entries.filter((e) => SEM_RESPONSAVEL.includes(e.reason)).length;

  return (
    <Card>
      <CardHeader
        title="Histórico de distribuição"
        subtitle="Cada decisão do rodízio, para auditoria"
        action={
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-primary-600"
              checked={apenasProblemas}
              onChange={(e) => setApenasProblemas(e.target.checked)}
            />
            Só os sem responsável
            {problemas > 0 && <Badge tone="red">{problemas}</Badge>}
          </label>
        }
      />

      {visiveis.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-faint">
          {apenasProblemas
            ? "Nenhum lead ficou sem responsável nas últimas decisões. 🎉"
            : "Nenhuma distribuição registrada ainda. Assim que o primeiro lead entrar, ele aparece aqui."}
        </p>
      ) : (
        <>
          <DataTable className="rounded-none border-0 shadow-none">
            <THead>
              <Th>Quando</Th>
              <Th>Origem</Th>
              <Th>Regra</Th>
              <Th>Responsável</Th>
              <Th>Motivo</Th>
              <Th className="text-center">Candidatos</Th>
              <Th><span className="sr-only">Ações</span></Th>
            </THead>
            <TBody>
              {visiveis.map((entry) => {
                const meta = REASON_META[entry.reason];
                return (
                  <Tr key={entry.id}>
                    <Td className="whitespace-nowrap text-xs text-ink-soft">
                      {formatDateTime(entry.created_at)}
                    </Td>
                    <Td className="text-xs text-ink-soft">
                      {ORIGIN_LABELS[entry.origin] ?? entry.origin}
                    </Td>
                    <Td className="text-sm text-ink">{entry.rule_name ?? "—"}</Td>
                    <Td className="text-sm font-medium text-ink">
                      {entry.assigned_to_name ?? (
                        <span className="text-rose-600">Ninguém</span>
                      )}
                    </Td>
                    <Td>
                      <span title={meta?.hint}>
                        <Badge tone={meta?.tone ?? "slate"}>{meta?.label ?? entry.reason}</Badge>
                      </span>
                    </Td>
                    <Td className="text-center text-xs text-ink-faint">
                      {/* O snapshot de quem estava elegível é o que permite
                          conferir a escolha meses depois, mesmo que a regra
                          tenha mudado ou a pessoa saído da empresa. */}
                      <span
                        title={
                          entry.candidates.length > 0
                            ? entry.candidates.map((c) => `${c.name} (peso ${c.weight})`).join(", ")
                            : "Nenhum candidato elegível no momento da decisão"
                        }
                      >
                        {entry.candidates.length}
                        {entry.ticket !== null && ` · nº ${entry.ticket}`}
                      </span>
                    </Td>
                    <Td className="text-right">
                      {entry.deal_id && (
                        <Link
                          href={`/negociacoes/${entry.deal_id}`}
                          className="text-xs font-medium text-primary-700 hover:underline"
                        >
                          Abrir lead
                        </Link>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
          <TableFooter>
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              {visiveis.length} de {entries.length} decisão(ões) exibida(s)
            </span>
            {entries.length >= pageSize && (
              <span>Mostrando as {pageSize} mais recentes.</span>
            )}
          </TableFooter>
        </>
      )}
    </Card>
  );
}
