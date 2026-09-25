import { cn } from "@/lib/utils";
import { TINT_STRIP, TINT_SURFACE, type Tint } from "./tinted";

// Tabela responsiva padrão do CRM: header cinza, linhas com hover,
// vira scroll horizontal no mobile.
export function DataTable({
  className,
  tint,
  children,
}: {
  className?: string;
  /** Tabela de análise (print 6): painel tingido com faixa no topo. */
  tint?: Tint;
  children: React.ReactNode;
}) {
  if (tint) {
    return (
      <div className={cn("overflow-hidden rounded-2xl border bg-linear-to-br shadow-panel", TINT_SURFACE[tint], className)}>
        <div className={cn("h-1", TINT_STRIP[tint])} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-border bg-card shadow-panel", className)}>
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-border bg-muted/60 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {children}
      </tr>
    </thead>
  );
}

export function Th({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <th className={cn("px-5 py-3.5 whitespace-nowrap", className)}>{children}</th>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function Tr({
  className,
  onClick,
  children,
}: {
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors duration-150 hover:bg-secondary/50",
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </tr>
  );
}

export function Td({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <td className={cn("px-5 py-3.5 align-middle", className)}>{children}</td>;
}

export function TableFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-3 text-xs text-muted-foreground">
      {children}
    </div>
  );
}
