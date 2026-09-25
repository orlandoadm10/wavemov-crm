import { FEATURES } from "@/components/landing/content";
import { Reveal } from "@/components/landing/reveal";
import { SectionHeading } from "@/components/landing/section-heading";

/**
 * Grade de recursos.
 *
 * Os ícones vão a 20px dentro de um bloco de 44px, acima dos 16px que o
 * DESIGN_GUIDE fixa para botões e navegação: é escala de landing, não de
 * densidade operacional do app. Exceção deliberada e restrita a esta rota.
 */
export function Features() {
  return (
    <section id="recursos" className="scroll-mt-24 border-t border-line bg-white py-20 lg:py-28">
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal>
          <SectionHeading
            label="Recursos"
            title="Um CRM completo para a rotina comercial da sua empresa"
            description="Todos os recursos essenciais para organizar leads, acompanhar negociações e manter sua equipe alinhada."
          />
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 60} className="h-full">
              <div className="group h-full rounded-2xl border border-line bg-white p-6 shadow-panel transition-all duration-300 hover:-translate-y-1 hover:border-primary-200 hover:shadow-lift">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 transition-colors duration-300 group-hover:bg-primary-600 group-hover:text-white">
                  <feature.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-base font-bold tracking-tight text-ink">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {feature.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
