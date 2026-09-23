"use client";

import { UserMenu } from "@/components/layout/user-menu";
import { cn } from "@/lib/utils";
import type { SessionContext } from "@/types";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SIDEBAR_COLLAPSED_COOKIE } from "./nav-links";
import { SidebarContent } from "./sidebar";

/**
 * Casca do app autenticado: barra lateral (desktop), gaveta (celular) e uma
 * barra superior fina só com o que é da pessoa — conta e empresa.
 *
 * O estado "recolhido" vem do COOKIE lido no servidor (`initialCollapsed`):
 * guardar só no navegador faria o servidor desenhar a barra aberta e o cliente
 * recolhê-la depois da hidratação — um salto de 176px em toda navegação dura.
 */
export function AppShell({
  session,
  initialCollapsed,
  children,
}: {
  session: SessionContext;
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen w-full">
      {/* `sticky`, não `fixed`: a barra ocupa lugar na linha e o conteúdo fica
          com exatamente o que sobra — não há margem compensatória para
          discordar da largura dela. */}
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-screen shrink-0 border-r border-line bg-white transition-[width] duration-200 lg:block",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <SidebarContent
          session={session}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="animate-fade-up absolute inset-y-0 left-0 w-72 max-w-[calc(100vw-3rem)] bg-white shadow-(--shadow-pop)">
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 rounded-lg p-1.5 text-ink-soft hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              session={session}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* `min-w-0` deixa a coluna encolher: sem ele, uma tabela larga empurra
          a página inteira para o lado em vez de rolar dentro da própria caixa. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-white/90 px-4 backdrop-blur">
          <button
            type="button"
            className="rounded-lg p-2 text-ink-soft hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={mobileOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate text-sm font-bold text-ink lg:hidden">
            {session.organization.name}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <UserMenu session={session} />
          </div>
        </header>
        {/* `overflow-x-clip`, não `hidden`: corta o que passar da largura sem
            virar contêiner de rolagem (que quebraria o `sticky` do topo). É a
            rede de segurança — o que rola de lado de propósito (Kanban) tem a
            própria caixa com `overflow-x-auto`. */}
        <main className="mx-auto w-full max-w-[1600px] flex-1 overflow-x-clip px-4 py-4 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
