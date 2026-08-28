import { FINAL_CTA } from "@/components/landing/content";
import { CtaLink } from "@/components/landing/cta-link";
import { Reveal } from "@/components/landing/reveal";
import { ArrowRight } from "lucide-react";

export function FinalCta() {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="mx-auto w-full max-w-6xl px-5">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl bg-primary-900 px-6 py-16 text-center sm:px-14">
            <div className="landing-glow-cta pointer-events-none absolute inset-0" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-bold leading-tight tracking-tight text-white">
                {FINAL_CTA.title}
              </h2>
              <p className="mt-5 text-base leading-relaxed text-primary-200">
                {FINAL_CTA.description}
              </p>
              <div className="mt-9 flex justify-center">
                <CtaLink tone="light" size="lg">
                  {FINAL_CTA.cta}
                  <ArrowRight className="h-4 w-4" />
                </CtaLink>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
