"use client";

import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

const GAP = 6;
const VIEWPORT_MARGIN = 8;

/**
 * Posição `fixed` de um elemento flutuante (menu, painel) presa ao gatilho.
 *
 * O flutuante vai para o `body` num portal e é posicionado aqui pela tela, não
 * pelo contêiner: dentro da página ele herdaria o corte de quem tem
 * `overflow` (o `<main>`, a `Table`) e a pilha de `z-index` do pai — foi assim
 * que o painel de filtros ficou sob o menu lateral. Abre abaixo do gatilho;
 * para cima quando só lá cabe; nunca passa das bordas da tela, e `maxHeight`
 * limita a altura ao espaço disponível (o flutuante deve rolar por dentro).
 * Acompanha rolagem e redimensionamento.
 *
 * Devolve `null` enquanto não mediu: renderize invisível até lá, para o
 * flutuante não piscar no canto da tela.
 */
export function useAnchoredPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  floatingRef: RefObject<HTMLElement | null>,
  align: "left" | "right" = "left"
): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const measure = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const floating = floatingRef.current;
    if (!anchor || !floating) return;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    // `scrollHeight`: a altura do conteúdo, não a já limitada por `maxHeight`.
    const height = floating.scrollHeight + (floating.offsetHeight - floating.clientHeight);
    const width = floating.offsetWidth;

    const spaceBelow = viewportHeight - anchor.bottom - GAP - VIEWPORT_MARGIN;
    const spaceAbove = anchor.top - GAP - VIEWPORT_MARGIN;
    const openUp = height > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(openUp ? spaceAbove : spaceBelow, 120);
    const top = openUp
      ? Math.max(VIEWPORT_MARGIN, anchor.top - GAP - Math.min(height, maxHeight))
      : anchor.bottom + GAP;

    const preferredLeft = align === "right" ? anchor.right - width : anchor.left;
    const maxLeft = viewportWidth - width - VIEWPORT_MARGIN;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, maxLeft));

    setStyle((prev) =>
      prev && prev.top === top && prev.left === left && prev.maxHeight === maxHeight
        ? prev
        : { top, left, maxHeight }
    );
  }, [anchorRef, floatingRef, align]);

  // Antes da pintura: o flutuante aparece já no lugar.
  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    measure();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    // O conteúdo muda de altura com o flutuante aberto (ex.: "Personalizado"
    // revela as datas no painel de filtros).
    const resize = new ResizeObserver(schedule);
    if (floatingRef.current) resize.observe(floatingRef.current);
    return () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [open, measure]);

  return style;
}
