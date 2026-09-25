"use client";

import { saveFieldMappingAction, type LeadSourceActionResult } from "@/app/(dashboard)/fontes/actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { MappingRowView, TargetOption } from "./types";

/** Valor do select para "deixe a sugestão automática decidir". */
const AUTO = "__auto";

function initialSelection(rows: MappingRowView[], saved: Record<string, string>) {
  return Object.fromEntries(rows.map((r) => [r.key, r.explicit ? (saved[r.key] ?? "") : AUTO]));
}

/**
 * "Campos recebidos": o que a fonte mandou e para onde cada campo vai.
 *
 * A lista vem das entregas reais — ninguém digita nome de campo. O padrão é
 * automático; o cliente só mexe quando a sugestão errar.
 */
export function FieldMappingCard({
  sourceId,
  rows,
  savedMapping,
  targets,
  formName,
}: {
  sourceId: string;
  rows: MappingRowView[];
  savedMapping: Record<string, string>;
  targets: TargetOption[];
  formName: string;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState(() => initialSelection(rows, savedMapping));
  const [feedback, setFeedback] = useState<LeadSourceActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Uma entrega nova ou um mapeamento salvo mudam a lista. A assinatura evita
  // apagar a edição em andamento a cada `router.refresh()`, que entrega
  // objetos novos com o mesmo conteúdo.
  const signature = JSON.stringify([rows.map((r) => [r.key, r.explicit]), savedMapping]);
  useEffect(() => {
    setSelection(initialSelection(rows, savedMapping));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` resume `rows` e `savedMapping`
  }, [signature]);

  const labelOf = useMemo(() => new Map(targets.map((t) => [t.fieldKey, t.label])), [targets]);
  const dirty = rows.some((r) => selection[r.key] !== initialSelection([r], savedMapping)[r.key]);

  function save() {
    // Mapeamentos de campos que não aparecem nas entregas recentes são
    // preservados: a origem pode mandá-los de novo amanhã.
    const next: Record<string, string> = { ...savedMapping };
    for (const row of rows) {
      const value = selection[row.key];
      if (value === AUTO) delete next[row.key];
      else next[row.key] = value;
    }
    setFeedback(null);
    startTransition(async () => {
      const result = await saveFieldMappingAction(sourceId, next);
      setFeedback(result);
      if (!result.error) router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title="Campos recebidos"
        subtitle={`Para onde vai cada campo no formulário "${formName}". O que não for ligado aparece nas informações do lead.`}
        action={
          rows.length > 0 && (
            <Button size="sm" onClick={save} loading={pending} disabled={!dirty}>
              Salvar campos
            </Button>
          )
        }
      />
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-faint">
          Os campos aparecem aqui depois da primeira entrega. Nome, e-mail e telefone são reconhecidos sozinhos.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => {
            const selectId = `map-${sourceId}-${row.key}`;
            const autoLabel =
              !row.explicit && row.target
                ? `Automático → ${labelOf.get(row.target) ?? row.target}`
                : "Automático";
            return (
              <li key={row.key} className="grid grid-cols-1 gap-2 px-5 py-3 sm:grid-cols-[1fr_16rem] sm:items-center">
                <div className="min-w-0">
                  <label htmlFor={selectId} className="block truncate text-sm font-medium text-ink">
                    {row.label}
                  </label>
                  <p className="truncate text-xs text-ink-faint">
                    Exemplo: <span className="text-ink-soft">{row.value}</span>
                  </p>
                </div>
                <Select
                  id={selectId}
                  value={selection[row.key] ?? AUTO}
                  onChange={(e) => setSelection((s) => ({ ...s, [row.key]: e.target.value }))}
                >
                  <option value={AUTO}>{autoLabel}</option>
                  <option value="">Só nas informações do lead</option>
                  {targets.map((t) => (
                    <option key={t.fieldKey} value={t.fieldKey}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </li>
            );
          })}
        </ul>
      )}
      {feedback && (
        <p
          role={feedback.error ? "alert" : "status"}
          className={
            feedback.error
              ? "m-5 mt-0 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
              : "m-5 mt-0 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          }
        >
          {feedback.error ?? feedback.success}
        </p>
      )}
    </Card>
  );
}
