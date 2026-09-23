import { PipelineStepEditor } from "@/components/onboarding/pipeline-step-editor";
import { SkipStepButton, StepActions, StepHeading } from "@/components/onboarding/step-actions";
import { Card } from "@/components/ui/card";
import { templateForSegment } from "@/lib/features/onboarding/domain/pipeline-templates";
import { getDefaultPipelineSnapshot } from "@/lib/features/onboarding/infrastructure/onboarding-queries";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const metadata = { title: "Configuração inicial — Funil" };

export default async function OnboardingPipelinePage() {
  const { organization } = await getSessionContext();
  const supabase = await createClient();
  const pipeline = await getDefaultPipelineSnapshot(supabase, organization.id);

  const heading = (
    <StepHeading
      title="As etapas do seu funil"
      description="Cada lead vira um cartão que anda por essas colunas no Kanban de Negociações. Escolha o modelo mais próximo do seu negócio e ajuste os nomes."
    />
  );

  // Funil em uso não é trocado por aqui: a etapa de um lead não pode sumir.
  // A tela de Funis sabe mover leads e editar etapa a etapa.
  const locked = !pipeline || pipeline.dealCount > 0 || pipeline.formCount > 0;
  if (locked) {
    return (
      <div className="animate-fade-up">
        {heading}
        <Card className="mb-6 space-y-2 p-6 text-sm text-ink-soft">
          <p className="font-semibold text-ink">
            {pipeline ? `Seu funil "${pipeline.name}" já está em uso.` : "Não encontramos o funil padrão."}
          </p>
          {pipeline && (
            <p>{pipeline.stages.map((s) => s.name).join(" → ")}</p>
          )}
          <p>
            Como ele já tem negociações ou formulários, as etapas são ajustadas em{" "}
            <Link href="/funis" className="font-medium text-primary-600 hover:text-primary-700">
              Funis e etapas
            </Link>
            , que move os leads com segurança.
          </p>
        </Card>
        <StepActions step="funil" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-6">
      {heading}
      <PipelineStepEditor
        suggestedTemplateId={templateForSegment(organization.segment).id}
        currentPipeline={{ name: pipeline.name, stages: pipeline.stages }}
      />
      <SkipStepButton step="funil" label="Manter o funil atual e seguir" />
    </div>
  );
}
