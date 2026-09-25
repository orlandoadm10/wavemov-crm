/**
 * Cabeçalho de página (DESIGN_GUIDE, seção 7; print 5): rótulo pequeno em
 * caixa alta acima do título — o grupo do menu, nunca "MÓDULO · COMERCIAL" —,
 * título em Space Grotesk e subtítulo. Texto e ações em grade
 * `minmax(0, 1fr) + auto` para o título truncar em vez de empurrar as ações.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-0.5 text-[10px] font-semibold tracking-[0.2em] text-primary uppercase">{eyebrow}</p>
        )}
        <h1 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
