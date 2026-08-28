import { AppPreview } from "@/components/landing/app-preview";
import { HERO } from "@/components/landing/content";
import { CtaLink } from "@/components/landing/cta-link";
import { ArrowRight, ShieldCheck } from "lucide-react";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Ambiência: halos azuis suaves e malha fina, sem competir com o texto. */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-primary-50/70 via-white to-white" />
      <div className="landing-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="pointer-events-none absolute -left-40 -top-40 -z-10 h-96 w-96 rounded-full bg-primary-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-24 -z-10 h-96 w-96 rounded-full bg-cyan-100/50 blur-3xl" />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pb-20 pt-12 lg:grid-cols-[1fr_1.02fr] lg:gap-14 lg:pb-28 lg:pt-20">
        <div>
          <div className="hero-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-white/80 px-3.5 py-1.5 text-[13px] font-semibold text-primary-700 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {HERO.eyebrow}
            </span>
          </div>

          <div className="hero-in" style={{ animationDelay: "60ms" }}>
            <h1 className="mt-6 text-[clamp(2.1rem,4.2vw,3.35rem)] font-bold leading-[1.06] tracking-tight text-ink">
              {HERO.titleStart}{" "}
              <span className="bg-linear-to-br from-primary-600 to-cyan-600 bg-clip-text text-transparent">
                {HERO.titleHighlight}
              </span>{" "}
              {HERO.titleEnd}
            </h1>
          </div>

          <div className="hero-in" style={{ animationDelay: "120ms" }}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
              {HERO.description}
            </p>
          </div>

          <div className="hero-in" style={{ animationDelay: "180ms" }}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <CtaLink size="lg">
                {HERO.cta}
                <ArrowRight className="h-4 w-4" />
              </CtaLink>
              <span className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-soft">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                Acesso exclusivo para clientes
              </span>
            </div>
          </div>

          <div className="hero-in" style={{ animationDelay: "240ms" }}>
            <ul className="mt-10 flex flex-wrap gap-2">
              {HERO.pills.map((pill) => (
                <li
                  key={pill}
                  className="rounded-full border border-line bg-white px-3.5 py-2 text-[13px] font-semibold text-ink-soft shadow-sm"
                >
                  {pill}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="hero-in lg:pl-4" style={{ animationDelay: "200ms" }}>
          <AppPreview />
        </div>
      </div>
    </section>
  );
}
