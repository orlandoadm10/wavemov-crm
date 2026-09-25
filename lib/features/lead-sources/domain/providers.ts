/**
 * Catálogo das origens que uma fonte de lead pode ter — sem framework, para
 * ser lido pela rota, pelas actions e pela tela.
 *
 * `available: false` aparece na galeria como "em breve", mas não pode ser
 * criado: a action recusa, não só a tela.
 */
export type LeadSourceProvider = "typeform" | "webhook" | "meta_lead_ads";

export interface ProviderInfo {
  id: LeadSourceProvider;
  label: string;
  /** Uma frase para o cartão da galeria. */
  description: string;
  available: boolean;
}

export const PROVIDERS: Record<LeadSourceProvider, ProviderInfo> = {
  typeform: {
    id: "typeform",
    label: "Typeform",
    description: "Cada resposta do Typeform vira um lead no funil, com as perguntas e respostas no card.",
    available: true,
  },
  webhook: {
    id: "webhook",
    label: "Site ou outro sistema",
    description:
      "Qualquer ferramenta que envie um webhook (HTTP POST): Elementor, WordPress, RD Station, Make, Zapier, n8n…",
    available: true,
  },
  meta_lead_ads: {
    id: "meta_lead_ads",
    label: "Facebook e Instagram Lead Ads",
    description: "Conexão direta com a página do Facebook: os formulários dos anúncios entram sozinhos.",
    available: false,
  },
};

export function isLeadSourceProvider(value: unknown): value is LeadSourceProvider {
  return typeof value === "string" && value in PROVIDERS;
}

/** O que vai em `deals.source`: o lead mostra de onde veio. */
export function dealSourceLabel(provider: LeadSourceProvider, sourceName: string): string {
  return `${PROVIDERS[provider].label}: ${sourceName}`;
}
