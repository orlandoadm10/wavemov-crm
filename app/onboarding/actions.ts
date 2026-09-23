"use server";

import { validatePipelineDraft } from "@/lib/features/onboarding/domain/pipeline-templates";
import {
  isOnboardingStep,
  stepAfter,
  type OnboardingStepSlug,
} from "@/lib/features/onboarding/domain/steps";
import {
  markOnboarded,
  saveStepDecision,
} from "@/lib/features/onboarding/infrastructure/onboarding-queries";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type OnboardingActionState = { error?: string } | null;

// A organização é SEMPRE a da sessão, nunca um campo do formulário. A RLS de
// `organizations` (0003) e a RPC da 0030 recusam quem não é org_admin; a
// guarda aqui só troca o erro cru por uma frase.
async function adminContext() {
  const session = await getSessionContext();
  const canManage =
    session.membership.role === "org_admin" || session.profile.is_global_admin;
  return { session, canManage, supabase: await createClient() };
}

function nextHref(step: OnboardingStepSlug) {
  const next = stepAfter(step);
  return next ? `/onboarding/${next}` : "/onboarding/concluir";
}

export async function saveCompanyAction(
  _prev: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const { session, canManage, supabase } = await adminContext();
  if (!canManage) return { error: "Somente administradores configuram a empresa." };

  const name = String(formData.get("name") ?? "").trim();
  const segment = String(formData.get("segment") ?? "").trim();
  const logoUrl = String(formData.get("logo_url") ?? "").trim();
  if (name.length < 2 || name.length > 120) return { error: "Informe o nome da empresa (2 a 120 caracteres)." };
  if (segment.length > 120) return { error: "Segmento muito longo." };
  if (logoUrl && !/^https:\/\/\S+$/i.test(logoUrl)) {
    return { error: "O logo precisa ser um endereço https://." };
  }

  const { data, error } = await supabase
    .from("organizations")
    .update({ name, segment: segment || null, logo_url: logoUrl || null })
    .eq("id", session.organization.id)
    .select("id");
  if (error) return { error: "Não foi possível salvar os dados da empresa." };
  if (!data?.length) return { error: "Sem permissão para editar esta empresa." };

  const saved = await saveStepDecision(supabase, session.organization.id, "empresa", "done");
  if (!saved.ok) return { error: saved.error };

  revalidatePath("/", "layout");
  redirect(nextHref("empresa"));
}

export async function applyPipelineAction(
  _prev: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const { session, canManage, supabase } = await adminContext();
  if (!canManage) return { error: "Somente administradores configuram o funil." };

  let draft: unknown;
  try {
    draft = JSON.parse(String(formData.get("pipeline") ?? ""));
  } catch {
    return { error: "Funil inválido." };
  }
  const validation = validatePipelineDraft(draft);
  if (!validation.ok) return { error: validation.error };

  const { error } = await supabase.rpc("apply_onboarding_pipeline", {
    org_id: session.organization.id,
    pipeline_name: validation.value.name,
    stages: validation.value.stages,
  });
  if (error) {
    // As mensagens da RPC são escritas para a pessoa (P0001/42501); qualquer
    // outra coisa não sai crua.
    const legivel = error.code === "P0001" || error.code === "42501";
    return { error: legivel ? error.message : "Não foi possível aplicar o funil. Tente novamente." };
  }

  const saved = await saveStepDecision(supabase, session.organization.id, "funil", "done");
  if (!saved.ok) return { error: saved.error };

  revalidatePath("/", "layout");
  redirect(nextHref("funil"));
}

/** Avança um passo que não tem formulário próprio: "Continuar" ou "Pular". */
export async function decideStepAction(
  _prev: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const { session, canManage, supabase } = await adminContext();
  if (!canManage) return { error: "Somente administradores configuram a empresa." };

  const step = String(formData.get("step") ?? "");
  const decision = formData.get("decision") === "skipped" ? "skipped" : "done";
  if (!isOnboardingStep(step)) return { error: "Passo desconhecido." };

  const saved = await saveStepDecision(supabase, session.organization.id, step, decision);
  if (!saved.ok) return { error: saved.error };

  redirect(nextHref(step));
}

export async function finishOnboardingAction(
  _prev: OnboardingActionState,
  _formData: FormData
): Promise<OnboardingActionState> {
  const { session, canManage, supabase } = await adminContext();
  if (!canManage) return { error: "Somente administradores concluem a configuração." };

  const saved = await markOnboarded(supabase, session.organization.id);
  if (!saved.ok) return { error: saved.error };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
