"use client";

import { decideStepAction } from "@/app/onboarding/actions";
import { Button, buttonClasses } from "@/components/ui/button";
import {
  stepBefore,
  type OnboardingStepSlug,
} from "@/lib/features/onboarding/domain/steps";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

/**
 * Rodapé de um passo sem formulário próprio (equipe, WhatsApp, IA): voltar,
 * pular e continuar. "Pular" fica gravado como escolha — o resumo final diz
 * "você pulou", e não "feito".
 */
export function StepActions({
  step,
  continueLabel = "Continuar",
}: {
  step: OnboardingStepSlug;
  continueLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(decideStepAction, null);
  const previous = stepBefore(step);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="step" value={step} />
      {state?.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {previous ? (
          <Link href={`/onboarding/${previous}`} className={buttonClasses({ variant: "ghost" })}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="decision" value="skipped" variant="outline" disabled={pending}>
            Pular por enquanto
          </Button>
          <Button type="submit" name="decision" value="done" loading={pending}>
            {continueLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Só o "pular", para passos cujo formulário principal já tem o próprio envio. */
export function SkipStepButton({ step, label }: { step: OnboardingStepSlug; label: string }) {
  const [state, formAction, pending] = useActionState(decideStepAction, null);
  return (
    <form action={formAction} className="text-center">
      <input type="hidden" name="step" value={step} />
      <input type="hidden" name="decision" value="skipped" />
      <button
        type="submit"
        disabled={pending}
        className="text-sm text-ink-soft underline underline-offset-2 hover:text-ink disabled:opacity-50"
      >
        {label}
      </button>
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-destructive-text">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** Cabeçalho padrão de cada passo. */
export function StepHeading({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-1 text-sm text-ink-soft">{description}</p>
    </header>
  );
}
