// ============================================================
// Assistente de configuração inicial — os passos e o progresso.
//
// Uma lista só decide a ordem, os rótulos do indicador e o resumo final. No
// DeskcommCRM eram três listas independentes que divergiam, e o indicador
// mostrava passo que a instalação nunca oferecia.
//
// O progresso é o que a pessoa DECIDIU (`organizations.onboarding_steps`,
// 0030): "done" ou "skipped". "Pulado" é escolha; "pendente" é o que ela não
// chegou a ver — o resumo final diz as duas coisas de modo diferente.
// ============================================================

export const ONBOARDING_STEPS = [
  { slug: "empresa", label: "Empresa", summary: "Nome, segmento e logo da empresa" },
  { slug: "funil", label: "Funil", summary: "Etapas do funil de vendas" },
  { slug: "equipe", label: "Equipe", summary: "Pessoas que vão usar o CRM" },
  { slug: "whatsapp", label: "WhatsApp", summary: "Número conectado ao atendimento" },
  { slug: "ia", label: "Agente de IA", summary: "Atendimento automático com IA" },
] as const;

export type OnboardingStepSlug = (typeof ONBOARDING_STEPS)[number]["slug"];
export type StepDecision = "done" | "skipped";
export type OnboardingProgress = Partial<Record<OnboardingStepSlug, StepDecision>>;

const SLUGS = new Set<string>(ONBOARDING_STEPS.map((s) => s.slug));

export function isOnboardingStep(value: string): value is OnboardingStepSlug {
  return SLUGS.has(value);
}

/**
 * O jsonb vem do banco e pode ter qualquer coisa — chave velha de um passo que
 * deixou de existir, valor digitado à mão no painel. Só passa o que o
 * assistente conhece.
 */
export function parseOnboardingProgress(raw: unknown): OnboardingProgress {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const progress: OnboardingProgress = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isOnboardingStep(key) && (value === "done" || value === "skipped")) {
      progress[key] = value;
    }
  }
  return progress;
}

/** Primeiro passo sem decisão, ou `null` quando todos foram feitos ou pulados. */
export function nextPendingStep(progress: OnboardingProgress): OnboardingStepSlug | null {
  return ONBOARDING_STEPS.find((s) => !progress[s.slug])?.slug ?? null;
}

export function stepAfter(slug: OnboardingStepSlug): OnboardingStepSlug | null {
  const index = ONBOARDING_STEPS.findIndex((s) => s.slug === slug);
  return ONBOARDING_STEPS[index + 1]?.slug ?? null;
}

export function stepBefore(slug: OnboardingStepSlug): OnboardingStepSlug | null {
  const index = ONBOARDING_STEPS.findIndex((s) => s.slug === slug);
  return index > 0 ? ONBOARDING_STEPS[index - 1].slug : null;
}

/**
 * Quem cai no assistente ao entrar no CRM.
 *
 * - `onboardedAt === undefined` significa que a coluna não existe (a 0030 ainda
 *   não foi aplicada): vale como configurada. O assistente é conveniência;
 *   prender a empresa inteira fora do CRM por falta de migration seria pior
 *   que não oferecê-lo.
 * - Só o `org_admin` MEMBRO é levado. Vendedor não tem o que configurar, e o
 *   admin global que entra numa empresa cliente está visitando, não montando.
 */
export function needsOnboarding(input: {
  onboardedAt: string | null | undefined;
  isOrgAdminMember: boolean;
}): boolean {
  return input.onboardedAt === null && input.isOrgAdminMember;
}
