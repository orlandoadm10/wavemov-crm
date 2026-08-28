/**
 * Copy da landing page pública, em um só lugar.
 *
 * Os textos vêm da landing de referência (`referenciasdev/landpage-crm`) e são
 * conteúdo, não apresentação: manter aqui evita que ajustar uma frase obrigue a
 * abrir um componente de layout, e mantém as seções finas.
 */
import {
  BarChart3,
  Building2,
  CheckSquare,
  ClipboardList,
  Headphones,
  KanbanSquare,
  MessageCircle,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

export const HERO = {
  eyebrow: "Plataforma inclusa para clientes JID Mídia",
  titleStart: "Organize seus leads e acompanhe cada",
  titleHighlight: "negociação",
  titleEnd: "com clareza.",
  description:
    "O CRM da JID Mídia reúne negociações, tarefas, contatos, empresas, formulários, atendimentos e integração com WhatsApp em um único ambiente para sua equipe trabalhar com mais controle e produtividade.",
  cta: "Acessar minha plataforma",
  pills: [
    "Kanban comercial",
    "Tarefas e follow-up",
    "Formulários inteligentes",
    "WhatsApp integrado",
  ],
} as const;

type Feature = { icon: LucideIcon; title: string; description: string };

export const FEATURES: Feature[] = [
  {
    icon: KanbanSquare,
    title: "Kanban de negociações",
    description:
      "Organize oportunidades por etapas, acompanhe valores, responsáveis e status de cada lead de forma visual.",
  },
  {
    icon: CheckSquare,
    title: "Tarefas e acompanhamento",
    description:
      "Crie atividades, controle pendências e garanta que nenhum contato importante fique sem retorno.",
  },
  {
    icon: Headphones,
    title: "Atendimentos centralizados",
    description:
      "Tenha mais organização nos atendimentos da equipe, com histórico e informações comerciais em um só lugar.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp integrado",
    description:
      "Use o WhatsApp como canal conectado ao processo comercial, sem transformar o CRM em apenas uma caixa de mensagens.",
  },
  {
    icon: Building2,
    title: "Empresas, pessoas e contatos",
    description:
      "Cadastre informações importantes e relacione contatos, empresas e negociações com mais inteligência.",
  },
  {
    icon: ClipboardList,
    title: "Formulários inteligentes",
    description:
      "Capture dados de novos leads por formulários e leve essas informações diretamente para a operação comercial.",
  },
];

export const MANAGEMENT = {
  title: "Mais controle para vender com processo, não com improviso.",
  description:
    "A plataforma ajuda sua empresa a transformar contatos soltos em uma jornada comercial organizada, com responsáveis, etapas, tarefas e histórico de relacionamento.",
  metrics: [
    { value: "+ leads", label: "organizados por etapa" },
    { value: "+ foco", label: "tarefas claras para a equipe" },
    { value: "+ visão", label: "dados e acompanhamento" },
    { value: "+ ritmo", label: "follow-up consistente" },
  ],
  steps: [
    {
      title: "O lead entra no CRM",
      description:
        "As oportunidades podem ser organizadas a partir de formulários, cadastros e canais conectados à operação.",
    },
    {
      title: "A equipe acompanha pelo Kanban",
      description:
        "Cada negociação fica posicionada na etapa correta, com responsável, status e informações importantes.",
    },
    {
      title: "As tarefas mantêm o processo vivo",
      description:
        "Follow-ups, pendências e ações comerciais ficam visíveis para melhorar a rotina da equipe.",
    },
    {
      title: "Os dados orientam a decisão",
      description:
        "Dashboards e indicadores ajudam a entender resultados, gargalos e oportunidades de melhoria.",
    },
  ],
} as const;

export const DASHBOARDS = {
  title: "Dashboards para acompanhar o que realmente importa",
  description:
    "Visualize indicadores da operação comercial e acompanhe desempenho com mais clareza, velocidade e precisão.",
  cards: [
    {
      icon: BarChart3,
      title: "Leads e oportunidades",
      description:
        "Monitore volume de leads, negociações em aberto, oportunidades ganhas e contatos em andamento.",
    },
    {
      icon: Users,
      title: "Performance da equipe",
      description:
        "Acompanhe responsáveis, produtividade e movimentações para entender melhor a rotina comercial.",
    },
    {
      icon: Target,
      title: "Visão estratégica",
      description:
        "Identifique gargalos do funil, melhore acompanhamentos e tome decisões com base em dados.",
    },
  ] satisfies Feature[],
} as const;

export const FINAL_CTA = {
  title: "Seu CRM já está disponível dentro do ecossistema JID Mídia.",
  description:
    "Acesse a plataforma, organize seus leads e acompanhe toda a operação comercial da sua empresa em um ambiente moderno, completo e integrado.",
  cta: "Acessar CRM agora",
} as const;

export const FOOTER = {
  primary: "CRM JID Mídia — Plataforma para clientes JID.",
  secondary:
    "Organização comercial, atendimento e acompanhamento em um só lugar.",
} as const;
