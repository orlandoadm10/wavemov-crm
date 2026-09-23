import { FinishOnboardingButton } from "@/components/onboarding/finish-onboarding-button";
import { StepHeading } from "@/components/onboarding/step-actions";
import { Card } from "@/components/ui/card";
import {
  ONBOARDING_STEPS,
  parseOnboardingProgress,
} from "@/lib/features/onboarding/domain/steps";
import { getSetupFacts } from "@/lib/features/onboarding/infrastructure/onboarding-queries";
import { getSessionContext } from "@/lib/services/session";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { BarChart3, FileText, Plug, Shuffle, Workflow } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Configuração inicial — Resumo" };

// O assistente não termina numa tela vazia: quem acabou de configurar precisa
// saber que estas peças existem — quase ninguém volta para explorar o menu.
const WHAT_ELSE = [
  { href: "/formularios", icon: FileText, title: "Formulários de captura", text: "Página pública ou integração com n8n: cada envio vira lead no funil." },
  { href: "/distribuicao", icon: Shuffle, title: "Distribuição automática", text: "Divide os leads novos entre os vendedores, por fila e peso." },
  { href: "/automacoes", icon: Workflow, title: "Automações e follow-up", text: "Quando algo acontece, o CRM age: mensagem, tarefa, etapa, tag." },
  { href: "/relatorios/carteira", icon: BarChart3, title: "Carteira de leads", text: "Quem está esperando resposta da equipe, do mais urgente ao menos." },
  { href: "/integracoes", icon: Plug, title: "Integrações e API", text: "Tokens da API, servidor MCP e conexão com outros sistemas." },
];

export default async function OnboardingFinishPage() {
  const { organization } = await getSessionContext();
  const supabase = await createClient();
  const progress = parseOnboardingProgress(organization.onboarding_steps);
  const facts = await getSetupFacts(supabase, organization.id);

  // O resumo confere o que EXISTE, não só o que foi clicado: WhatsApp pulado
  // mas conectado por outro caminho aparece como pronto.
  const doneInFact: Record<string, boolean> = {
    equipe: facts.activeMembers > 1,
    whatsapp: facts.whatsappStatus === "connected",
    ia: facts.activeAgents > 0,
  };
  const alreadyOnboarded = Boolean(organization.onboarded_at);

  return (
    <div className="animate-fade-up space-y-6">
      <StepHeading
        title={alreadyOnboarded ? "Resumo da configuração" : "Tudo pronto para começar"}
        description="O que ficou para depois continua disponível em Organização → Configuração inicial."
      />

      <Card className="p-6">
        <ul className="space-y-3">
          {ONBOARDING_STEPS.map((step) => {
            const done = progress[step.slug] === "done" || doneInFact[step.slug];
            const skipped = !done && progress[step.slug] === "skipped";
            return (
              <li key={step.slug} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className={cn("h-2.5 w-2.5 shrink-0 rounded-full", done ? "bg-emerald-500" : "bg-slate-300")}
                  />
                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium", done ? "text-ink" : "text-ink-soft")}>{step.label}</p>
                    <p className="truncate text-xs text-ink-faint">{step.summary}</p>
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-3 text-xs">
                  <span className={done ? "text-emerald-700" : "text-ink-faint"}>
                    {done ? "Pronto" : skipped ? "Você pulou" : "Ainda não"}
                  </span>
                  {!done && (
                    <Link
                      href={`/onboarding/${step.slug}`}
                      className="font-medium text-primary-600 hover:text-primary-700"
                    >
                      Fazer agora
                    </Link>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <section aria-labelledby="o-que-mais" className="space-y-3">
        <div>
          <h2 id="o-que-mais" className="text-sm font-semibold text-ink">O que mais tem aqui</h2>
          <p className="text-xs text-ink-faint">Nada disso precisa ser feito agora — é só para saber que existe.</p>
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {WHAT_ELSE.map(({ href, icon: Icon, title, text }) => (
            <li key={href} className="rounded-xl border border-line bg-white p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Icon aria-hidden className="h-4 w-4 text-primary-600" />
                {title}
              </p>
              <p className="mt-1 text-xs text-ink-faint">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <FinishOnboardingButton label={alreadyOnboarded ? "Voltar ao CRM" : "Começar a usar o CRM"} />
    </div>
  );
}
