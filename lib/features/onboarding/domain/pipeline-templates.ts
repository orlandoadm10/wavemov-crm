// ============================================================
// Modelos de funil por segmento, usados no passo "Funil" do assistente.
//
// Toda empresa nasce com o funil de corretora (`provision_organization_defaults`,
// 0004): "Cotação Enviada", "Aguardando Documento". A imobiliária que entrava
// no CRM lia isso sem nunca ter sido perguntada em que ramo estava — o mesmo
// defeito que o DeskcommCRM corrigiu no onboarding dele.
//
// A validação mora aqui e é repetida pela RPC `apply_onboarding_pipeline`
// (0030): a da tela explica o erro, a do banco garante a regra.
// ============================================================

export type StageKind = "open" | "won" | "lost";

export interface StageDraft {
  name: string;
  kind: StageKind;
}

export interface PipelineDraft {
  name: string;
  stages: StageDraft[];
}

export interface PipelineTemplate {
  id: string;
  label: string;
  /** Palavras que, no segmento digitado, apontam para este modelo. */
  keywords: string[];
  pipeline: PipelineDraft;
}

export const MIN_STAGES = 3;
export const MAX_STAGES = 15;
export const MAX_STAGE_NAME = 60;
export const MAX_PIPELINE_NAME = 80;

const won = (name = "Ganho"): StageDraft => ({ name, kind: "won" });
const lost = (name = "Perdido"): StageDraft => ({ name, kind: "lost" });
const open = (...names: string[]): StageDraft[] => names.map((name) => ({ name, kind: "open" }));

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: "corretora",
    label: "Corretora de seguros e planos",
    keywords: ["corretor", "seguro", "plano", "consorcio", "previdencia"],
    pipeline: {
      name: "Funil de Vendas",
      stages: [
        ...open(
          "Lead Novo",
          "Tentando Contato",
          "Contato Realizado",
          "Em Qualificação",
          "Aguardando Documento",
          "Cotação Enviada",
          "Follow-up"
        ),
        won(),
        lost(),
      ],
    },
  },
  {
    id: "imobiliaria",
    label: "Imobiliária",
    keywords: ["imob", "imovel", "imoveis", "corretagem", "aluguel", "loteamento"],
    pipeline: {
      name: "Funil de Imóveis",
      stages: [
        ...open("Lead Novo", "Primeiro Contato", "Perfil Definido", "Visita Agendada", "Proposta", "Documentação"),
        won("Contrato Assinado"),
        lost(),
      ],
    },
  },
  {
    id: "clinica",
    label: "Clínica e consultório",
    keywords: ["clinic", "consultorio", "odonto", "estetic", "medic", "fisio", "psico", "dentist"],
    pipeline: {
      name: "Funil de Pacientes",
      stages: [
        ...open("Novo Contato", "Em Atendimento", "Avaliação Agendada", "Orçamento Enviado", "Confirmação"),
        won("Paciente Fechado"),
        lost("Não Fechou"),
      ],
    },
  },
  {
    id: "educacao",
    label: "Escola, curso e infoproduto",
    keywords: ["escola", "curso", "educa", "faculdade", "treinamento", "mentoria", "infoproduto"],
    pipeline: {
      name: "Funil de Matrículas",
      stages: [
        ...open("Interessado", "Contato Feito", "Aula/Apresentação", "Proposta Enviada", "Negociação"),
        won("Matriculado"),
        lost(),
      ],
    },
  },
  {
    id: "servicos",
    label: "Serviços B2B e consultoria",
    keywords: ["servico", "consultoria", "b2b", "software", "saas", "agencia", "marketing", "contabil", "advoca"],
    pipeline: {
      name: "Funil Comercial",
      stages: [
        ...open("Lead Novo", "Qualificação", "Reunião Agendada", "Diagnóstico", "Proposta Enviada", "Negociação"),
        won(),
        lost(),
      ],
    },
  },
  {
    id: "varejo",
    label: "Loja e e-commerce",
    keywords: ["loja", "varejo", "ecommerce", "e-commerce", "moda", "roupa", "revenda", "delivery"],
    pipeline: {
      name: "Funil de Pedidos",
      stages: [
        ...open("Novo Contato", "Em Atendimento", "Orçamento", "Aguardando Pagamento"),
        won("Venda Concluída"),
        lost("Desistiu"),
      ],
    },
  },
  {
    id: "generico",
    label: "Outro segmento (funil genérico)",
    keywords: [],
    pipeline: {
      name: "Funil de Vendas",
      stages: [...open("Lead Novo", "Em Contato", "Qualificado", "Proposta", "Negociação"), won(), lost()],
    },
  },
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// "Corretor de imóveis" contém "corretor": o mais específico precisa ser
// testado antes. A ordem de exibição continua a do array.
const MATCH_PRIORITY = ["imobiliaria", "clinica", "educacao", "varejo", "corretora", "servicos"];

/** Sugere o modelo pelo segmento digitado; sem pista, o genérico. */
export function templateForSegment(segment: string | null | undefined): PipelineTemplate {
  const text = normalize(segment ?? "");
  if (text.trim()) {
    for (const id of MATCH_PRIORITY) {
      const template = PIPELINE_TEMPLATES.find((t) => t.id === id);
      if (template?.keywords.some((k) => text.includes(normalize(k)))) return template;
    }
  }
  return PIPELINE_TEMPLATES[PIPELINE_TEMPLATES.length - 1];
}

export type DraftValidation =
  | { ok: true; value: PipelineDraft }
  | { ok: false; error: string };

/**
 * Valida e ORDENA: etapas abertas na ordem recebida, depois o ganho, depois a
 * perda. Um funil cuja última coluna vem depois do fechamento não é lido como
 * funil — e as telas de relatório assumem essa ordem.
 */
export function validatePipelineDraft(input: unknown): DraftValidation {
  if (!input || typeof input !== "object") return { ok: false, error: "Funil inválido." };
  const raw = input as { name?: unknown; stages?: unknown };
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length < 2) return { ok: false, error: "Dê um nome ao funil." };
  if (name.length > MAX_PIPELINE_NAME) {
    return { ok: false, error: `O nome do funil pode ter até ${MAX_PIPELINE_NAME} caracteres.` };
  }
  if (!Array.isArray(raw.stages)) return { ok: false, error: "Funil sem etapas." };

  const stages: StageDraft[] = [];
  for (const item of raw.stages) {
    const stage = item as { name?: unknown; kind?: unknown };
    const stageName = typeof stage?.name === "string" ? stage.name.trim() : "";
    const kind = stage?.kind;
    if (kind !== "open" && kind !== "won" && kind !== "lost") {
      return { ok: false, error: "Etapa com tipo inválido." };
    }
    if (!stageName) return { ok: false, error: "Dê um nome a todas as etapas." };
    if (stageName.length > MAX_STAGE_NAME) {
      return { ok: false, error: `"${stageName.slice(0, 20)}…" passa de ${MAX_STAGE_NAME} caracteres.` };
    }
    stages.push({ name: stageName, kind });
  }

  if (stages.length < MIN_STAGES) return { ok: false, error: `O funil precisa de pelo menos ${MIN_STAGES} etapas.` };
  if (stages.length > MAX_STAGES) return { ok: false, error: `O funil pode ter no máximo ${MAX_STAGES} etapas.` };

  const seen = new Set<string>();
  for (const s of stages) {
    const key = normalize(s.name);
    if (seen.has(key)) return { ok: false, error: `A etapa "${s.name}" aparece duas vezes.` };
    seen.add(key);
  }

  const opens = stages.filter((s) => s.kind === "open");
  const wins = stages.filter((s) => s.kind === "won");
  const losses = stages.filter((s) => s.kind === "lost");
  if (opens.length === 0) return { ok: false, error: "O funil precisa de pelo menos uma etapa em andamento." };
  if (wins.length !== 1) return { ok: false, error: "O funil precisa de exatamente uma etapa de ganho." };
  if (losses.length !== 1) return { ok: false, error: "O funil precisa de exatamente uma etapa de perda." };

  return { ok: true, value: { name, stages: [...opens, wins[0], losses[0]] } };
}

const OPEN_COLORS = ["#2563eb", "#3b82f6", "#6366f1", "#8b5cf6", "#06b6d4", "#0ea5e9", "#f59e0b", "#eab308", "#64748b"];

/** Cor da etapa pela posição: ganho verde, perda vermelha, abertas na paleta. */
export function stageColor(stage: StageDraft, openIndex: number): string {
  if (stage.kind === "won") return "#10b981";
  if (stage.kind === "lost") return "#ef4444";
  return OPEN_COLORS[openIndex % OPEN_COLORS.length];
}
