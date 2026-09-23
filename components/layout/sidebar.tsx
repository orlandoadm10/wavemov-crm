"use client";

import { useAttention } from "@/components/layout/attention-provider";
import { CountBadge } from "@/components/ui/count-badge";
import { ATTENTION_LABELS } from "@/lib/features/notifications/domain/attention";
import { cn } from "@/lib/utils";
import type { SessionContext } from "@/types";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Waves } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  isNavItemActive,
  visibleNavGroups,
  type NavBadge,
  type NavItem,
} from "./nav-links";

const CLOSED_GROUPS_KEY = "wavemov-sidebar-grupos-fechados";

/**
 * Conteúdo da navegação lateral — usado pela barra fixa do desktop e pela
 * gaveta do celular. Não decide permissão: `visibleNavGroups` resolve.
 */
export function SidebarContent({
  session,
  collapsed,
  onNavigate,
  onToggleCollapsed,
}: {
  session: SessionContext;
  collapsed: boolean;
  onNavigate?: () => void;
  /** Ausente na gaveta do celular: lá não existe modo trilho. */
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const groups = visibleNavGroups({
    isOrgAdmin: session.membership.role === "org_admin",
    isGlobalAdmin: session.profile.is_global_admin,
  });

  // Grupo fechado é preferência do navegador. Começa vazio (tudo aberto) no
  // servidor e na primeira pintura, e só depois do mount lê o que foi salvo —
  // assim servidor e cliente desenham a mesma coisa.
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CLOSED_GROUPS_KEY);
      if (saved) setClosedGroups(new Set(JSON.parse(saved) as string[]));
    } catch {
      // Storage bloqueado (aba privada): fica tudo aberto, que é o padrão.
    }
  }, []);

  function toggleGroup(id: string) {
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(CLOSED_GROUPS_KEY, JSON.stringify([...next]));
      } catch {
        // Continua valendo nesta sessão; só não sobrevive a um recarregamento.
      }
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={cn(
          "flex h-14 shrink-0 items-center gap-2.5 border-b border-line",
          collapsed ? "justify-center px-2" : "px-4"
        )}
        title={collapsed ? session.organization.name : undefined}
      >
        {session.organization.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.organization.logo_url}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white">
            <Waves className="h-4.5 w-4.5" />
          </span>
        )}
        {!collapsed && (
          <span className="truncate text-sm font-bold text-ink">{session.organization.name}</span>
        )}
      </Link>

      <nav aria-label="Navegação principal" className="flex-1 space-y-3 overflow-y-auto p-2">
        {groups.map((group) => {
          const headingId = `nav-grupo-${group.id}`;
          // No trilho não há onde desenhar cabeçalho nem seta: o grupo fica aberto.
          const open = collapsed || !group.label || !closedGroups.has(group.id);
          return (
            <div key={group.id} className="space-y-0.5">
              {group.label &&
                (collapsed ? (
                  <div aria-hidden className="mx-2 mb-1 border-t border-line" />
                ) : (
                  <h2 id={headingId}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between rounded-md px-3 py-1 text-[11px] font-semibold tracking-wide text-ink-faint uppercase transition-colors hover:text-ink-soft"
                    >
                      {group.label}
                      <ChevronDown
                        aria-hidden
                        className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")}
                      />
                    </button>
                  </h2>
                ))}
              {open && (
                <ul
                  className="space-y-0.5"
                  aria-labelledby={group.label && !collapsed ? headingId : undefined}
                  aria-label={group.label && collapsed ? group.label : undefined}
                >
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <SidebarLink
                        item={item}
                        active={isNavItemActive(item, pathname)}
                        collapsed={collapsed}
                        onNavigate={onNavigate}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {onToggleCollapsed && (
        <div className="shrink-0 border-t border-line p-2">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-ink-faint transition-colors hover:bg-slate-50 hover:text-ink",
              collapsed && "justify-center px-2"
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                Recolher menu
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg py-2 text-sm font-medium transition-colors",
        collapsed ? "justify-center px-2" : "px-3",
        active
          ? "bg-primary-50 text-primary-700"
          : "text-ink-soft hover:bg-slate-50 hover:text-ink"
      )}
    >
      <Icon
        aria-hidden
        className={cn("h-4 w-4 shrink-0", active ? "text-primary-600" : "text-ink-faint")}
      />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="flex-1 truncate">{item.label}</span>
      )}
      {item.badge && <NavCountBadge badge={item.badge} collapsed={collapsed} />}
    </Link>
  );
}

/**
 * Um badge por rota, e só nas três que têm trabalho esperando. Vermelho só
 * para o atraso — os outros dois são presença de trabalho, não dívida.
 */
function NavCountBadge({ badge, collapsed }: { badge: NavBadge; collapsed: boolean }) {
  const attention = useAttention();
  const content =
    badge === "overdueTasks" ? (
      <CountBadge
        value={attention.overdueTasks}
        label={ATTENTION_LABELS.overdueTasks(attention.overdueTasks ?? 0)}
        tone="rose"
      />
    ) : badge === "unreadConversations" ? (
      <CountBadge
        value={attention.unreadConversations}
        label={ATTENTION_LABELS.unread(
          attention.unreadConversations ?? 0,
          attention.unreadMessages ?? 0
        )}
      />
    ) : (
      <CountBadge
        value={attention.newLeads}
        label={ATTENTION_LABELS.newLeads(attention.newLeads ?? 0)}
      />
    );
  // No trilho de 64px o número vai para o canto do ícone.
  return collapsed ? <span className="absolute -top-0.5 right-0.5">{content}</span> : content;
}
