/**
 * Âncoras das seções da landing.
 *
 * Vive fora de `content.ts` porque `site-header.tsx` é um Client Component:
 * importar o módulo de conteúdo — que carrega os ícones Lucide de recursos e
 * dashboards — arrastaria esses ícones para o bundle do cliente sem
 * necessidade.
 */
export const NAV_LINKS = [
  { href: "#recursos", label: "Recursos" },
  { href: "#gestao", label: "Gestão" },
  { href: "#dashboards", label: "Dashboards" },
] as const;
