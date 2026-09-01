"use client";

// ============================================================
// Sub-navegação dos relatórios.
//
// O `PageHeader` de `/relatorios` carregava o filtro de período MAIS um botão
// por sub-relatório. Eram quatro; com a carteira viraram cinco, e essa fileira
// quebra em 375px. Cada rota nova pioraria o problema, e a alternativa —
// esconder relatórios — só faz o último virar o que ninguém encontra.
//
// Uma linha de pills resolve os dois: cabe o crescimento, rola na horizontal no
// celular sem empurrar o resto da página, e dá a cada relatório um lugar
// visível a partir de qualquer um dos outros.
//
// Client Component porque precisa de `usePathname` para marcar o item ativo.
// Não importa nada de `content`/ícones pesados: são cinco links de texto.
// ============================================================
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const RELATORIOS = [
  { href: "/relatorios", label: "Entrada de leads" },
  { href: "/relatorios/carteira", label: "Carteira" },
  { href: "/relatorios/vendedores", label: "Por vendedor" },
  { href: "/relatorios/tags", label: "Por tags" },
  { href: "/relatorios/ultimo-lead", label: "Último lead" },
] as const;

export function ReportNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Relatórios"
      // `overflow-x-auto` com `-mx-1 px-1`: a rolagem não corta o anel de foco
      // do primeiro e do último item.
      className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1"
    >
      {RELATORIOS.map((r) => {
        // Igualdade exata, não `startsWith`: `/relatorios` é prefixo de todos
        // os outros e ficaria permanentemente ativo.
        const ativo = pathname === r.href;
        return (
          <Link
            key={r.href}
            href={r.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              ativo
                ? "bg-primary-50 text-primary-700 ring-1 ring-primary-100"
                : "text-ink-soft hover:bg-slate-50 hover:text-ink"
            )}
          >
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}
