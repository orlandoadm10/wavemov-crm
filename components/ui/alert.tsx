import { cn } from "@/lib/utils";

/**
 * Aviso de página ou formulário. Um estilo só: antes havia quatro (pílula,
 * caixa com borda, cartão tracejado e `<p>` solto), e metade sem
 * `role="alert"` — o leitor de tela não anunciava o erro.
 */
export function Alert({
  tone = "error",
  className,
  children,
}: {
  tone?: "error" | "warning" | "success" | "info";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    error: "border-destructive/25 bg-destructive/10 text-destructive-text",
    warning: "border-warning/40 bg-warning/15 text-warning-text",
    success: "border-success/30 bg-success/10 text-success-text",
    info: "border-primary/20 bg-primary/8 text-primary",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-xl border px-3 py-2 text-sm", tones[tone], className)}
    >
      {children}
    </div>
  );
}
