"use client";

import { CtaLink } from "@/components/landing/cta-link";
import { NAV_LINKS } from "@/components/landing/nav-links";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/ui/brand-logo";
import { LogIn, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const ANCHOR_LINK =
  "rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-slate-100/80 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600";

/**
 * Header público: marca, âncoras das seções e o acesso ao CRM.
 *
 * É cliente por dois motivos concretos: a barra só ganha fundo e borda depois
 * do primeiro scroll, e o menu compacto precisa abrir e fechar no mobile. O
 * acesso ao CRM fica visível em toda largura — é o destino da página.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // O menu só existe abaixo de `md`. Ao passar do breakpoint ele some da tela,
  // mas o estado ficaria aberto: o header travaria com fundo e borda no topo e
  // o botão manteria `aria-expanded="true"` sem nada expandido.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 48rem)");
    const onChange = () => {
      if (desktop.matches) setMenuOpen(false);
    };
    onChange();
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  // Escape fecha o menu e devolve o foco ao botão que o abriu.
  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled || menuOpen
          ? "border-b border-line/80 bg-white/85 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <div className="mx-auto flex h-18 w-full max-w-6xl items-center justify-between gap-4 px-5">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600"
        >
          <BrandLogo size={36} priority />
          <span className="text-base font-bold tracking-tight text-ink">
            CRM <span className="text-primary-600">JID Mídia</span>
          </span>
        </Link>

        <nav aria-label="Seções" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={ANCHOR_LINK}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <CtaLink className="px-4 sm:px-5">
            <LogIn className="h-4 w-4" />
            <span className="sm:hidden">Entrar</span>
            <span className="hidden sm:inline">Acessar CRM</span>
          </CtaLink>
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="landing-menu"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-white text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="landing-menu"
          aria-label="Seções (menu)"
          className="border-t border-line bg-white/95 backdrop-blur-xl md:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col px-5 py-2">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={cn(ANCHOR_LINK, "px-2 py-3")}
              >
                {link.label}
              </a>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
