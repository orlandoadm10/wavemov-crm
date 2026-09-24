"use client";

import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import {
  countDealDateFilters,
  DEAL_DATE_FILTERS,
  type DealDateFilterKey,
  type DealDateFilters,
} from "@/lib/features/deal-filters/domain/deal-filters";
import { cn } from "@/lib/utils";
import {
  customRangeError,
  DATE_RANGE_PRESETS,
  type DateRangePreset,
  type DateRangeValue,
} from "@/lib/utils/period";
import { Filter } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Rascunho de um filtro enquanto o painel está aberto. */
interface DraftField {
  choice: "" | DateRangePreset | "personalizado";
  from: string;
  to: string;
}

type Draft = Record<DealDateFilterKey, DraftField>;

function toDraft(applied: DealDateFilters): Draft {
  const draft = {} as Draft;
  for (const { key } of DEAL_DATE_FILTERS) {
    const value = applied[key];
    draft[key] =
      !value
        ? { choice: "", from: "", to: "" }
        : value.kind === "preset"
          ? { choice: value.preset, from: "", to: "" }
          : { choice: "personalizado", from: value.from, to: value.to };
  }
  return draft;
}

/**
 * Painel de filtros de data do Kanban.
 *
 * O que se escolhe aqui é RASCUNHO: nada vai ao servidor até "Aplicar". O
 * contador mostra o que está aplicado de fato — o que o servidor aceitou e
 * devolveu na URL —, não o que está sendo escolhido.
 */
export function DealFiltersPanel({
  applied,
  onApply,
  onClear,
}: {
  applied: DealDateFilters;
  onApply: (filters: DealDateFilters) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(applied));
  const [errors, setErrors] = useState<Partial<Record<DealDateFilterKey, string>>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const appliedCount = countDealDateFilters(applied);

  // Fecha com Esc e com clique fora. As listas nativas dos <select> não
  // disparam `pointerdown` no documento, então escolher uma opção não fecha.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  function toggle() {
    // Reabrir descarta o rascunho abandonado: o painel mostra o aplicado.
    if (!open) {
      setDraft(toDraft(applied));
      setErrors({});
    }
    setOpen((v) => !v);
  }

  function update(key: DealDateFilterKey, patch: Partial<DraftField>) {
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function apply() {
    const next: DealDateFilters = {};
    const nextErrors: Partial<Record<DealDateFilterKey, string>> = {};
    for (const { key } of DEAL_DATE_FILTERS) {
      const field = draft[key];
      if (!field.choice) continue;
      if (field.choice === "personalizado") {
        const error = customRangeError(field.from, field.to);
        if (error) nextErrors[key] = error;
        else next[key] = { kind: "custom", from: field.from, to: field.to } satisfies DateRangeValue;
      } else {
        next[key] = { kind: "preset", preset: field.choice };
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onApply(next);
    setOpen(false);
  }

  function clear() {
    setDraft(toDraft({}));
    setErrors({});
    onClear();
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant={appliedCount > 0 ? "secondary" : "outline"}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Filter className="h-4 w-4" />
        Filtros
        {appliedCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white tabular-nums">
            {appliedCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Filtros de data"
          className={cn(
            "animate-fade-up z-40 overflow-y-auto rounded-2xl border border-line bg-slate-50 p-4 shadow-(--shadow-pop)",
            // Celular: preso às laterais da tela, nunca cortado. Desktop:
            // ancorado à ESQUERDA do botão e crescendo para a direita. Ancorado
            // à direita, o painel (288px) passava da borda esquerda do <main>
            // quando o botão ficava perto dela, e o `overflow-x-clip` do <main>
            // o cortava rente ao menu lateral. À direita do botão sempre há
            // Arquivados e Etapas, mais largos que o que o painel excede.
            "fixed inset-x-4 top-20 max-h-[calc(100dvh-6rem)]",
            "sm:absolute sm:inset-x-auto sm:top-full sm:left-0 sm:mt-2 sm:w-72 sm:max-h-[calc(100dvh-12rem)]"
          )}
        >
          <p className="mb-4 text-xs font-semibold text-primary-700" aria-live="polite">
            Filtros aplicados: {appliedCount}
          </p>

          <div className="space-y-3">
            {DEAL_DATE_FILTERS.map(({ key, label }) => {
              const field = draft[key];
              const id = `filtro-${key}`;
              return (
                <div key={key}>
                  <Label htmlFor={id} className="text-ink">
                    {label}
                  </Label>
                  <Select
                    id={id}
                    value={field.choice}
                    onChange={(e) => update(key, { choice: e.target.value as DraftField["choice"] })}
                    className={cn(!field.choice && "text-ink-faint")}
                  >
                    <option value="">Selecionar</option>
                    {DATE_RANGE_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                  {field.choice === "personalizado" && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        aria-label={`${label}: data inicial`}
                        value={field.from}
                        max={field.to || undefined}
                        onChange={(e) => update(key, { from: e.target.value })}
                        className={cn("px-2", errors[key] && "border-rose-400")}
                      />
                      <Input
                        type="date"
                        aria-label={`${label}: data final`}
                        value={field.to}
                        min={field.from || undefined}
                        onChange={(e) => update(key, { to: e.target.value })}
                        className={cn("px-2", errors[key] && "border-rose-400")}
                      />
                    </div>
                  )}
                  {errors[key] && (
                    <p role="alert" className="mt-1 text-xs text-rose-600">
                      {errors[key]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex gap-2 rounded-xl bg-white p-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={clear}>
              Limpar
            </Button>
            <Button type="button" className="flex-1" onClick={apply}>
              Aplicar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
