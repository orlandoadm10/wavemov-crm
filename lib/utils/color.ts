/**
 * Texto legível sobre uma cor escolhida pelo usuário (cor da etapa do funil).
 *
 * Branco fixo sobre âmbar, amarelo ou ciano dá ~2:1. Escolhe branco ou o azul
 * escuro da marca pelo contraste WCAG contra a cor de fundo. Cor inválida ou
 * não hexadecimal (ex.: `var(--primary)`) fica com branco, que é o caso do
 * azul padrão.
 */
const LIGHT = "#ffffff";
/** `--foreground` do tema claro (oklch 0.22 0.05 262). */
export const DARK_TEXT = "#141c33";

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const full = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Branco enquanto der ao menos 3:1 (mínimo para texto em negrito de
 * interface) — o azul, o violeta e o rosa das etapas seguem brancos, como no
 * print. Abaixo disso (âmbar, amarelo, ciano, verde), o azul escuro.
 */
const MIN_WHITE_CONTRAST = 3;

export function textOnColor(background: string | null | undefined): string {
  const l = background ? luminance(background) : null;
  if (l === null) return LIGHT;
  return 1.05 / (l + 0.05) >= MIN_WHITE_CONTRAST ? LIGHT : DARK_TEXT;
}
