import { CompanyStepForm } from "@/components/onboarding/company-step-form";
import { StepHeading } from "@/components/onboarding/step-actions";
import { getSessionContext } from "@/lib/services/session";

export const metadata = { title: "Configuração inicial — Empresa" };

export default async function OnboardingCompanyPage() {
  const { organization } = await getSessionContext();
  return (
    <div className="animate-fade-up">
      <StepHeading
        title="Boas-vindas! Vamos configurar seu CRM"
        description="São cinco passos rápidos. Nada aqui é definitivo: tudo pode ser ajustado depois pelo menu."
      />
      <CompanyStepForm
        defaults={{
          name: organization.name,
          segment: organization.segment ?? "",
          logoUrl: organization.logo_url ?? "",
        }}
      />
    </div>
  );
}
