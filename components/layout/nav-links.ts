import {
  BarChart3,
  Building2,
  CheckSquare,
  Contact,
  FileText,
  Handshake,
  LayoutDashboard,
  MessageCircle,
  Settings,
  Users,
} from "lucide-react";

// `/tags` e `/distribuicao` NÃO estão aqui de propósito: são configurações do
// trabalho com negociações e vivem ao lado dos filtros de `/negociacoes`, onde
// a decisão acontece. Ambas continuam restritas a `org_admin`/admin global —
// a restrição mora na própria rota, não no menu.
export const NAV_ITEMS = [
  { href: "/admin", label: "Admin", icon: Settings, globalAdminOnly: true },
  { href: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { href: "/negociacoes", label: "Negociações", icon: Handshake },
  { href: "/atendimento", label: "Atendimento", icon: MessageCircle },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/empresas", label: "Empresas", icon: Building2 },
  { href: "/contatos", label: "Contatos", icon: Contact },
  { href: "/pessoas", label: "Pessoas", icon: Users },
  { href: "/formularios", label: "Formulários", icon: FileText },
] as const;
