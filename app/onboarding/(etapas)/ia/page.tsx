import { StepActions, StepHeading } from "@/components/onboarding/step-actions";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSetupFacts } from "@/lib/features/onboarding/infrastructure/onboarding-queries";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { Bot } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Configuração inicial — Agente de IA" };

const WHAT_IT_DOES = [
  "Responde o lead no WhatsApp na hora, a qualquer horário.",
  "Qualifica: pergunta o que você definir e salva as respostas no lead.",
  "Move o cartão no funil, cria tarefa e anota o que aconteceu.",
  "Passa a conversa para a equipe quando o lead pede um humano ou quando não sabe responder.",
];

export default async function OnboardingAiPage() {
  const { organization } = await getSessionContext();
  const supabase = await createClient();
  const facts = await getSetupFacts(supabase, organization.id);
  // Só a PRESENÇA da chave sai do servidor, nunca o valor.
  const hasProviderKey = Boolean(process.env.AI_API_KEY);

  return (
    <div className="animate-fade-up space-y-6">
      <StepHeading
        title="Agente de IA (opcional)"
        description="Um atendente automático que trabalha junto com a sua equipe. Dá para ligar agora ou quando quiser."
      />
      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">O que o agente faz</p>
            <p className="text-xs text-ink-faint">Você decide o que ele pode fazer, e pode desligá-lo a qualquer momento.</p>
          </div>
          {facts.activeAgents > 0 ? (
            <Badge tone="green" dot>
              {facts.activeAgents} agente(s) ativo(s)
            </Badge>
          ) : (
            <Badge tone="slate">Nenhum agente ativo</Badge>
          )}
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
          {WHAT_IT_DOES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {!hasProviderKey && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            A chave do provedor de IA ainda não foi configurada neste ambiente. O agente pode ser
            montado agora, mas só responde depois que a chave for cadastrada.
          </p>
        )}
        <Link href="/ia" className={buttonClasses({ variant: "secondary" })}>
          Configurar agente de IA
        </Link>
      </Card>
      <StepActions step="ia" continueLabel="Ir para o resumo" />
    </div>
  );
}
