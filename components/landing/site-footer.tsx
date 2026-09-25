import { FOOTER } from "@/components/landing/content";
import { NAV_LINKS } from "@/components/landing/nav-links";
import { BrandLogo } from "@/components/ui/brand-logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <BrandLogo size={32} />
          <div className="leading-tight">
            <p className="text-sm font-bold text-ink">{FOOTER.primary}</p>
            <p className="text-xs text-ink-soft">{FOOTER.secondary}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <nav aria-label="Rodapé" className="flex flex-wrap gap-x-5 gap-y-2">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded text-xs font-medium text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                {link.label}
              </a>
            ))}
          </nav>
          {/* Sem o ano: `/` é prerenderizada, então `getFullYear()` congelaria
              no build e o rodapé mentiria a partir de 1º de janeiro. */}
          <span className="text-xs text-ink-soft">© JID Mídia</span>
        </div>
      </div>
    </footer>
  );
}
