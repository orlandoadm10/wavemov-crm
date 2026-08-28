import { MANAGEMENT } from "@/components/landing/content";
import { Reveal } from "@/components/landing/reveal";

/**
 * Bloco escuro de autoridade: a promessa de processo à esquerda, a jornada
 * numerada do lead à direita.
 */
export function Management() {
  return (
    <section
      id="gestao"
      className="relative scroll-mt-24 overflow-hidden bg-primary-900 py-20 lg:py-28"
    >
      <div className="landing-glow pointer-events-none absolute inset-0 opacity-70" />

      <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-5 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <Reveal>
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary-300">
            Gestão
          </span>
          <h2 className="mt-3 text-[clamp(1.75rem,3.4vw,2.5rem)] font-bold leading-tight tracking-tight text-white">
            {MANAGEMENT.title}
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-primary-200">
            {MANAGEMENT.description}
          </p>

          <dl className="mt-10 grid grid-cols-2 gap-3">
            {MANAGEMENT.metrics.map((metric) => (
              <div
                key={metric.value}
                className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
              >
                <dt className="text-lg font-bold tracking-tight text-white">
                  {metric.value}
                </dt>
                <dd className="mt-1 text-xs leading-relaxed text-primary-200">
                  {metric.label}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <ol className="relative space-y-3">
          {MANAGEMENT.steps.map((step, index) => (
            <li key={step.title}>
              <Reveal delay={index * 80}>
                {/* O hover vive aqui, e não no elemento do `Reveal`: um
                    `transition-colors` lá sobrescreveria a transição de
                    entrada do próprio `.reveal`. */}
                <div className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm transition-colors duration-300 hover:border-white/20 hover:bg-white/10">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-bold text-primary-800">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-base font-bold tracking-tight text-white">
                      {step.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-primary-200">
                      {step.description}
                    </p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
