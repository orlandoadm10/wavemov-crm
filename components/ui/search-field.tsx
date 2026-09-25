"use client";

import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
import { Input } from "./input";

/**
 * Busca das barras de filtro (DESIGN_GUIDE, seção 11; print 3): 40px, borda
 * azul de 2px, lupa à esquerda, "x" para limpar e Esc limpa. Uma só no CRM —
 * antes havia nove cópias, só uma com o "x".
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Nome acessível; o placeholder some ao digitar e não serve de rótulo. */
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-primary" aria-hidden />
      <Input
        type="search"
        aria-label={label}
        className="h-10 rounded-xl border-2 border-primary/70 bg-card pr-10 pl-9 focus:border-primary focus:ring-0"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onChange("");
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar busca"
          className="absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Filtro fora do padrão: borda âmbar 60% + fundo âmbar 15% + texto âmbar (seção 11). */
export const ACTIVE_FILTER = "border-warning/60 bg-warning/15 text-warning-text hover:bg-warning/20";
/** Controle de barra de filtro: 40px, raio de 12px, fundo branco. */
export const FILTER_CONTROL = "h-10 rounded-xl bg-card";
