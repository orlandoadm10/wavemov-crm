import { CreateOrganizationForm } from "@/components/onboarding/create-organization-form";
import {
  needsOnboarding,
  nextPendingStep,
  parseOnboardingProgress,
} from "@/lib/features/onboarding/domain/steps";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Porta de entrada do onboarding. Duas situações:
 *
 * - sem empresa: cria a primeira (é para cá que `getSessionContext` manda). Não
 *   pode chamar `getSessionContext` antes de saber disso — ela redirecionaria
 *   de volta para esta mesma rota;
 * - com empresa ainda não configurada: segue para o primeiro passo pendente.
 */
export default async function OnboardingIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_global_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/login");

  const { count } = await supabase
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id)
    .eq("is_active", true);

  if (!count && !profile.is_global_admin) return <CreateOrganizationForm />;

  const session = await getSessionContext();
  const pending = needsOnboarding({
    onboardedAt: session.organization.onboarded_at,
    isOrgAdminMember:
      session.membership.role === "org_admin" || session.profile.is_global_admin,
  });
  if (!pending) redirect("/dashboard");

  const next = nextPendingStep(parseOnboardingProgress(session.organization.onboarding_steps));
  redirect(next ? `/onboarding/${next}` : "/onboarding/concluir");
}
