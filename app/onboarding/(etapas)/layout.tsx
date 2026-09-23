import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";
import { BrandLogo } from "@/components/ui/brand-logo";
import { parseOnboardingProgress } from "@/lib/features/onboarding/domain/steps";
import { getSessionContext } from "@/lib/services/session";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Moldura do assistente de configuração inicial: marca, empresa, indicador de
 * passos e uma saída. Só org_admin/admin global configura — o vendedor que
 * digitar a URL volta para o CRM.
 */
export default async function OnboardingStepsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  const canManage =
    session.membership.role === "org_admin" || session.profile.is_global_admin;
  if (!canManage) redirect("/dashboard");

  const progress = parseOnboardingProgress(session.organization.onboarding_steps);
  // Empresa já configurada revisitando o assistente: a saída é o CRM, sem
  // passar pelo resumo. Na primeira vez, a saída é o resumo — é lá que se
  // conclui, e o CRM mandaria de volta para cá.
  const exitHref = session.organization.onboarded_at === null ? "/onboarding/concluir" : "/dashboard";

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo size={32} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-ink-faint">Configuração inicial</p>
              <p className="truncate text-sm font-semibold text-ink">{session.organization.name}</p>
            </div>
          </div>
          <Link
            href={exitHref}
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-slate-100 hover:text-ink"
          >
            {session.organization.onboarded_at === null ? "Terminar depois" : "Voltar ao CRM"}
          </Link>
        </div>
        <div className="mx-auto w-full max-w-3xl px-4 pb-3">
          <OnboardingStepper progress={progress} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
