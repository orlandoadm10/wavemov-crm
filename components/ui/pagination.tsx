"use client";

// ============================================================
// Barra de paginação.
//
// Extraída de `/contatos` ao ganhar o segundo consumidor. Ela carrega uma
// REGRA, não só estilo:
//
//   **O total sempre aparece, mesmo quando há uma página só.**
//
// É o total que prova que a lista está completa. A ausência dessa informação
// foi exatamente o que fez o `limit(1000)` de `/contatos` truncar em silêncio
// por meses — a tela parecia inteira. Disciplina assim precisa morar num
// componente, não na memória de quem escreve a próxima tela.
// ============================================================
import { Button } from "@/components/ui/button";
import { totalPages as calcTotalPages } from "@/lib/utils/pagination";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  total,
  page,
  perPage,
  onPageChange,
  singular,
  plural,
  ariaLabel = "Paginação",
}: {
  /** Total que casa com os filtros — nunca o tamanho da página. */
  total: number;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  /** "contato" / "contatos", "lead" / "leads". */
  singular: string;
  plural: string;
  ariaLabel?: string;
}) {
  const paginas = calcTotalPages(total, perPage);
  const primeiro = total === 0 ? 0 : (page - 1) * perPage + 1;
  const ultimo = Math.min(page * perPage, total);

  return (
    <nav
      aria-label={ariaLabel}
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-panel"
    >
      {/* `aria-live` aqui e não no botão: quem navega por teclado precisa ouvir
          onde chegou, e uma região só evita duas falas concorrentes. */}
      <p className="text-sm text-ink-soft" aria-live="polite">
        <span className="font-medium tabular-nums text-ink">
          {primeiro}–{ultimo}
        </span>{" "}
        de <span className="font-medium tabular-nums text-ink">{total}</span>{" "}
        {total === 1 ? singular : plural}
      </p>
      {paginas > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <span className="text-sm tabular-nums text-ink-soft">
            {page} / {paginas}
          </span>
          <Button
            variant="outline"
            disabled={page >= paginas}
            onClick={() => onPageChange(page + 1)}
            aria-label="Próxima página"
          >
            Próxima
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </nav>
  );
}
