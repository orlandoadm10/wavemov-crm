import { DASHBOARDS } from "@/components/landing/content";
import { Reveal } from "@/components/landing/reveal";
import { SectionHeading } from "@/components/landing/section-heading";

/**
 * Cards de dashboard da landing — mesma exceção de escala de ícone de
 * `features.tsx`.
 */
export function Dashboards() {
  return (
    <section
      id="dashboards"
      className="scroll-mt-24 border-b border-line bg-surface py-20 lg:py-28"
    >
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal>
          <SectionHeading
            label="Dashboards"
            title={DASHBOARDS.title}
            description={DASHBOARDS.description}
          />
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DASHBOARDS.cards.map((card, index) => (
            <Reveal key={card.title} delay={index * 80} className="h-full">
              <div className="h-full rounded-2xl border border-line bg-white p-7 shadow-(--shadow-card)">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-primary-600 to-primary-500 text-white shadow-md shadow-primary-600/20">
                  <card.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-base font-bold tracking-tight text-ink">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {card.description}
                </p>
                <Sparkline id={card.title} />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Sparkline decorativo: dá volume ao card sem prometer um dado real.
 *
 * SVG inline em vez de barras `div` porque a curva suave combina com o tom do
 * produto e não custa nenhuma dependência de gráfico nesta rota pública.
 */
function Sparkline({ id }: { id: string }) {
  // Um gradiente por card: `id` repetido no DOM faria os três SVGs
  // referenciarem o mesmo `<defs>`, que é HTML inválido.
  const gradientId = `sparkline-${id.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <svg
      viewBox="0 0 220 64"
      className="mt-6 h-16 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${LINE} L216,64 L0,64 Z`} fill={`url(#${gradientId})`} />
      <path
        d={LINE}
        fill="none"
        stroke="#2563eb"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const LINE =
  "M4,50 C26,50 32,34 54,34 C76,34 80,44 102,42 C126,40 130,24 154,26 C178,28 188,15 216,12";
