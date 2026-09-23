"use client";

import {
  ONBOARDING_STEPS,
  type OnboardingProgress,
} from "@/lib/features/onboarding/domain/steps";
import { cn } from "@/lib/utils";
import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Indicador de passos. O passo atual sai da rota; "feito" e "pulado" saem do
 * que foi gravado — estar adiante não torna verde um passo que foi pulado.
 */
export function OnboardingStepper({ progress }: { progress: OnboardingProgress }) {
  const pathname = usePathname() ?? "";

  return (
    <ol aria-label="Passos da configuração" className="flex w-full items-start gap-1">
      {ONBOARDING_STEPS.map((step, index) => {
        const active = pathname === `/onboarding/${step.slug}`;
        const decision = progress[step.slug];
        return (
          <li key={step.slug} className="flex-1">
            <Link
              href={`/onboarding/${step.slug}`}
              aria-current={active ? "step" : undefined}
              className="group flex flex-col items-center gap-1 rounded-lg py-1 text-center"
            >
              <span className="flex w-full items-center">
                <span
                  aria-hidden
                  className={cn("h-px flex-1", index === 0 ? "bg-transparent" : "bg-line")}
                />
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors",
                    active && "border-primary-600 bg-primary-600 text-white",
                    !active && decision === "done" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                    !active && decision === "skipped" && "border-line bg-slate-100 text-ink-faint",
                    !active && !decision && "border-line bg-white text-ink-faint group-hover:border-primary-300"
                  )}
                >
                  {!active && decision === "done" ? (
                    <Check aria-hidden className="h-3.5 w-3.5" />
                  ) : !active && decision === "skipped" ? (
                    <Minus aria-hidden className="h-3.5 w-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "h-px flex-1",
                    index === ONBOARDING_STEPS.length - 1 ? "bg-transparent" : "bg-line"
                  )}
                />
              </span>
              {/* Abaixo de `sm` o rótulo vira só leitura de tela: cinco rótulos em
                  375px ficam ilegíveis, e cada passo já tem o título por extenso. */}
              <span
                className={cn(
                  "sr-only text-xs sm:not-sr-only",
                  active ? "font-semibold text-ink" : "text-ink-faint"
                )}
              >
                {step.label}
                {decision === "done" ? " (feito)" : decision === "skipped" ? " (pulado)" : ""}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
