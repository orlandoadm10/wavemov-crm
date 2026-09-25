"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import type { LeadRow } from "@/types";
import { MessageCircle, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

// Tabela de leads recebidos. A filtragem é local: a página já entregou uma
// página curta de resultados, então não vale ida ao servidor a cada tecla.
export function LeadsReportTable({
  rows,
  formNames,
  truncated,
}: {
  rows: LeadRow[];
  formNames: string[];
  truncated?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (form && r.formName !== form) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.contactName?.toLowerCase().includes(q) ||
        r.formName?.toLowerCase().includes(q) ||
        r.responsibleName.toLowerCase().includes(q) ||
        r.whatsapp?.includes(q)
      );
    });
  }, [rows, query, form]);

  return (
    <Card tint="violet" className="overflow-hidden">
      <CardHeader
        tint="violet"
        title={
          <span className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-primary-500" />
            Leads recebidos
          </span>
        }
        subtitle={`${filtered.length} de ${rows.length} no período`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input
                className="h-10 w-56 rounded-xl border-2 border-primary/70 bg-card pl-9 text-xs focus:border-primary focus:ring-0"
                placeholder="Buscar lead, formulário ou responsável…"
                aria-label="Buscar leads"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {formNames.length > 0 && (
              <Select
                className="h-9 w-auto min-w-40 text-xs"
                aria-label="Filtrar por formulário"
                value={form}
                onChange={(e) => setForm(e.target.value)}
              >
                <option value="">Todos os formulários</option>
                {formNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          className="rounded-none border-0 bg-transparent"
          icon={<UserRound className="h-6 w-6" />}
          title="Nenhum lead encontrado"
          description="Ajuste a busca, o formulário ou o período para ver resultados."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-muted/50 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
                <th className="px-5 py-3.5 whitespace-nowrap">Data/Hora</th>
                <th className="px-5 py-3.5 whitespace-nowrap">Lead</th>
                <th className="px-5 py-3.5 whitespace-nowrap">WhatsApp</th>
                <th className="px-5 py-3.5 whitespace-nowrap">Origem</th>
                <th className="px-5 py-3.5 whitespace-nowrap">Etapa</th>
                <th className="px-5 py-3.5 whitespace-nowrap">Responsável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-primary-50/40">
                  <td className="px-5 py-3.5 whitespace-nowrap text-ink-soft">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/negociacoes/${r.id}`}
                      className="flex items-center gap-2.5 hover:text-primary-700"
                    >
                      <Avatar name={r.contactName ?? r.title} size="xs" />
                      <span className="max-w-40 truncate font-medium text-ink">
                        {r.contactName ?? r.title}
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {r.whatsapp ? (
                      <span className="flex items-center gap-1.5 text-ink-soft">
                        <MessageCircle className="h-3.5 w-3.5 text-success-text" />
                        +{r.whatsapp}
                      </span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="block max-w-44 truncate text-ink-soft">
                      {r.formName ?? r.source ?? "Direto"}
                    </span>
                    {r.pipelineName && (
                      <span className="block max-w-44 truncate text-xs text-ink-faint">
                        {r.pipelineName}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    {r.stageName ? (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-ink-soft"
                        style={
                          r.stageColor
                            ? { background: `${r.stageColor}14`, color: r.stageColor }
                            : undefined
                        }
                      >
                        {r.stageName}
                      </span>
                    ) : (
                      <Badge tone="slate">Sem etapa</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-ink-soft">
                    {r.responsibleName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {truncated && (
        <p className="border-t border-line px-5 py-3 text-xs text-ink-faint">
          Mostrando os 100 leads mais recentes do período. Reduza o intervalo para ver os
          anteriores.
        </p>
      )}
    </Card>
  );
}
