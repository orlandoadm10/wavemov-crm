import {
  BarChart3,
  Bot,
  Building2,
  CheckSquare,
  Contact,
  FileText,
  Handshake,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  Plug,
  Rocket,
  Settings,
  Shuffle,
  Smartphone,
  Tag,
  Trophy,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";

// ============================================================
// Catálogo do menu lateral, agrupado por objetivo.
//
// O menu superior comportava ~10 itens e por isso Tags, Distribuição,
// Integrações e as telas de relatório viviam escondidas atrás de botões em
// outras telas. Com a barra lateral elas voltam a ter endereço — e a restrição
// de acesso continua morando na PRÓPRIA ROTA: esconder aqui é só para não
// levar ninguém a um beco, nunca a proteção.
//
// Quem pode ver:
// - `orgAdmin`: org_admin ou admin global (as rotas redirecionam os demais);
// - `globalAdmin`: somente admin global.
// ============================================================

export type NavAccess = "all" | "orgAdmin" | "globalAdmin";

/** Rotas que exibem indicador de atenção (ver `attention-provider`). */
export type NavBadge = "overdueTasks" | "unreadConversations" | "newLeads";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  access?: NavAccess;
  badge?: NavBadge;
  /** Casamento exato: `/relatorios` não pode acender em `/relatorios/carteira`. */
  exact?: boolean;
}

export interface NavGroup {
  id: string;
  /** Grupo sem rótulo é o topo do menu (uso diário, sem cabeçalho). */
  label: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "inicio",
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/tarefas", label: "Tarefas", icon: CheckSquare, badge: "overdueTasks" },
    ],
  },
  {
    id: "vendas",
    label: "Vendas",
    items: [
      { href: "/negociacoes", label: "Negociações", icon: Handshake, badge: "newLeads" },
      { href: "/contatos", label: "Contatos", icon: Contact },
      { href: "/funis", label: "Funis e etapas", icon: ListChecks, access: "orgAdmin" },
      { href: "/tags", label: "Tags", icon: Tag, access: "orgAdmin" },
      { href: "/distribuicao", label: "Distribuição", icon: Shuffle, access: "orgAdmin" },
    ],
  },
  {
    id: "atendimento",
    label: "Atendimento",
    items: [
      {
        href: "/atendimento",
        label: "Conversas",
        icon: MessageCircle,
        badge: "unreadConversations",
        exact: true,
      },
      {
        href: "/atendimento/configuracoes",
        label: "WhatsApp",
        icon: Smartphone,
        access: "orgAdmin",
      },
    ],
  },
  {
    id: "captacao",
    label: "Captação",
    items: [{ href: "/formularios", label: "Formulários", icon: FileText }],
  },
  {
    id: "analise",
    label: "Análise",
    items: [
      { href: "/relatorios", label: "Entrada de leads", icon: BarChart3, exact: true },
      { href: "/relatorios/carteira", label: "Carteira", icon: Wallet },
      { href: "/relatorios/vendedores", label: "Por vendedor", icon: Trophy },
    ],
  },
  {
    id: "inteligencia",
    label: "Inteligência",
    items: [
      { href: "/ia", label: "Agentes de IA", icon: Bot, access: "orgAdmin" },
      { href: "/automacoes", label: "Automações", icon: Workflow, access: "orgAdmin" },
      { href: "/integracoes", label: "Integrações e API", icon: Plug, access: "orgAdmin" },
    ],
  },
  {
    id: "organizacao",
    label: "Organização",
    items: [
      { href: "/pessoas", label: "Pessoas", icon: Users },
      { href: "/empresas", label: "Empresas", icon: Building2 },
      { href: "/onboarding/empresa", label: "Configuração inicial", icon: Rocket, access: "orgAdmin" },
      { href: "/admin", label: "Admin global", icon: Settings, access: "globalAdmin" },
    ],
  },
];

export function canSeeNavItem(
  item: NavItem,
  viewer: { isOrgAdmin: boolean; isGlobalAdmin: boolean }
): boolean {
  if (item.access === "globalAdmin") return viewer.isGlobalAdmin;
  if (item.access === "orgAdmin") return viewer.isOrgAdmin || viewer.isGlobalAdmin;
  return true;
}

/** Grupos com os itens que este papel vê; grupo vazio some. */
export function visibleNavGroups(viewer: { isOrgAdmin: boolean; isGlobalAdmin: boolean }) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeNavItem(item, viewer)),
  })).filter((group) => group.items.length > 0);
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export const SIDEBAR_COLLAPSED_COOKIE = "wavemov-sidebar-collapsed";
