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
  size = "md",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Nome acessível; o placeholder some ao digitar e não serve de rótulo. */
  label: string;
  /** `sm` (32px, borda fina) para barras compactas como a do pipeline. */
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <Search
        className={cn(
          "pointer-events-none absolute top-1/2 left-3 -translate-y-1/2",
          size === "sm" ? "h-3.5 w-3.5 text-muted-foreground" : "h-4 w-4 text-primary"
        )}
        aria-hidden
      />
      <Input
        type="search"
        aria-label={label}
        className={cn(
          "bg-card pr-10 pl-9",
          size === "sm"
            ? "h-8 rounded-lg text-xs focus:border-ring focus:ring-1 focus:ring-ring"
            : "h-10 rounded-xl border-2 border-primary/70 focus:border-primary focus:ring-0"
        )}
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
          className={cn(
            "absolute top-1/2 right-0.5 flex -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
            size === "sm" ? "h-7 w-7" : "right-1 h-8 w-8"
          )}
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
