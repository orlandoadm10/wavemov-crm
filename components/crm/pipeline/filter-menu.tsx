"use client";

import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
  /** Bolinha de cor à esquerda (etapa, temperatura). */
  color?: string;
}

/**
 * Filtro compacto da barra do pipeline (print-melhorias-deals): botão de 32px
 * com ícone, rótulo e seta, que abre a lista de opções. Fora do padrão ele
 * fica azul — o valor escolhido aparece no próprio botão e vira um chip
 * removível abaixo da barra.
 */
export function FilterMenu({
  icon: Icon,
  label,
  value,
  defaultValue,
  options,
  onChange,
  align = "left",
}: {
  icon: LucideIcon;
  /** Rótulo quando o filtro está no padrão ("Responsável"). */
  label: string;
  value: string;
  defaultValue: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  align?: "left" | "right";
}) {
  const active = value !== defaultValue;
  const current = options.find((o) => o.value === value);

  return (
    <Dropdown
      align={align}
      trigger={
        <button
          type="button"
          aria-label={`${label}: ${current?.label ?? label}`}
          className={cn(
            "inline-flex h-8 max-w-56 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-150",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            active
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-card text-foreground hover:border-primary/35 hover:bg-secondary/60"
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{active && current ? current.label : label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        </button>
      }
    >
      <div role="listbox" aria-label={label} className="max-h-80 overflow-y-auto">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                "focus-visible:outline-2 focus-visible:outline-ring",
                selected ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {option.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: option.color }} />}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
            </button>
          );
        })}
      </div>
    </Dropdown>
  );
}

/** Chip de filtro ativo, removível (seção 5 do prompt de design). */
export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full border border-primary/25 bg-primary/8 pr-1 pl-2.5 text-xs font-medium text-primary">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover filtro ${label}`}
        className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-primary/15"
      >
        <span aria-hidden className="text-sm leading-none">×</span>
      </button>
    </span>
  );
}
