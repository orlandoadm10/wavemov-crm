"use client";

import { Button } from "@/components/ui/button";
import { useAnchoredPosition } from "@/hooks/use-anchored-position";
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
import { createPortal } from "react-dom";

/** A partir daqui o painel é ancorado ao botão; abaixo, ocupa a largura da tela. */
const ANCHORED_MEDIA = "(min-width: 640px)";

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
  const [anchored, setAnchored] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const position = useAnchoredPosition(open && anchored, containerRef, panelRef);
  const appliedCount = countDealDateFilters(applied);

  // Fecha com Esc e com clique fora. As listas nativas dos <select> não
  // disparam `pointerdown` no documento, então escolher uma opção não fecha.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      containerRef.current?.querySelector("button")?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // O painel mora no fim do <body>: sem levar o foco até ele, o Tab saltaria
  // o painel inteiro. Espera ele ficar visível (medido) para focar.
  const visible = open && (!anchored || position !== null);
  useEffect(() => {
    if (visible) panelRef.current?.querySelector("select")?.focus({ preventScroll: true });
  }, [visible]);

  function toggle() {
    // Reabrir descarta o rascunho abandonado: o painel mostra o aplicado.
    if (!open) {
      setDraft(toDraft(applied));
      setErrors({});
      setAnchored(window.matchMedia(ANCHORED_MEDIA).matches);
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
      {/* Mesmo formato dos filtros da barra do pipeline (FilterMenu). */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          appliedCount > 0
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border bg-card text-foreground hover:border-primary/35 hover:bg-secondary/60"
        )}
      >
        <Filter className="h-3.5 w-3.5" aria-hidden />
        Mais filtros
        {appliedCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground tabular-nums">
            {appliedCount}
          </span>
        )}
      </button>

      {open &&
        createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Filtros de data"
          // Portal no `body`, posicionado pela tela: dentro da página o painel
          // era cortado pelo `overflow-x-clip` do <main> e ficava sob o menu
          // lateral. Celular: preso às laterais da tela. Desktop: ancorado ao
          // botão por `useAnchoredPosition`, invisível até ser medido.
          style={anchored ? (position ?? { top: 0, left: 0, visibility: "hidden" }) : undefined}
          className={cn(
            "z-40 overflow-y-auto rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-lift",
            anchored ? "fixed w-72" : "fixed inset-x-4 top-20 max-h-[calc(100dvh-6rem)]",
            (!anchored || position) && "animate-fade-up"
          )}
        >
          <p className="mb-4 text-xs font-semibold text-primary" aria-live="polite">
            Filtros aplicados: {appliedCount}
          </p>

          <div className="space-y-3">
            {DEAL_DATE_FILTERS.map(({ key, label }) => {
              const field = draft[key];
              const id = `filtro-${key}`;
              return (
                <div key={key}>
                  <Label htmlFor={id} className="text-foreground">
                    {label}
                  </Label>
                  <Select
                    id={id}
                    value={field.choice}
                    onChange={(e) => update(key, { choice: e.target.value as DraftField["choice"] })}
                    className={cn(!field.choice && "text-muted-foreground")}
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
                        className={cn("px-2", errors[key] && "border-destructive")}
                      />
                      <Input
                        type="date"
                        aria-label={`${label}: data final`}
                        value={field.to}
                        min={field.from || undefined}
                        onChange={(e) => update(key, { to: e.target.value })}
                        className={cn("px-2", errors[key] && "border-destructive")}
                      />
                    </div>
                  )}
                  {errors[key] && (
                    <p role="alert" className="mt-1 text-xs text-destructive-text">
                      {errors[key]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex gap-2 rounded-xl bg-muted/60 p-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={clear}>
              Limpar
            </Button>
            <Button type="button" className="flex-1" onClick={apply}>
              Aplicar
            </Button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
