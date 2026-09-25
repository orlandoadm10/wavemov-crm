import { cn } from "@/lib/utils";
import Link from "next/link";

type Tone = "solid" | "outline" | "light";
type Size = "md" | "lg";

const tones: Record<Tone, string> = {
  solid:
    "bg-linear-to-br from-primary-600 to-primary-500 text-white shadow-sm shadow-primary-600/20 hover:from-primary-700 hover:to-primary-600 hover:-translate-y-0.5",
  outline:
    "bg-white text-primary-700 border border-primary-100 hover:border-primary-300 hover:bg-primary-50",
  light:
    "bg-white text-primary-800 shadow-panel hover:-translate-y-0.5 hover:shadow-lift",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
};

/**
 * CTA da landing: sempre um link real para `/login`.
 *
 * A referência usava `<button>` com `window.open`, o que tira o alvo do
 * teclado e do crawler. Aqui o destino é um `<Link>` de verdade — e a landing
 * tem um único destino, então a rota fica travada neste componente.
 *
 * Não deriva de `buttonClasses` (`components/ui/button.tsx`) porque a landing
 * usa outra linguagem: pílula, gradiente e altura maior que a escala do app.
 * O que o app define e vale em qualquer contexto — cor primária, anel de foco
 * e a sombra azul a 20% — foi mantido igual, de propósito.
 */
export function CtaLink({
  children,
  tone = "solid",
  size = "md",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  size?: Size;
  className?: string;
}) {
  return (
    <Link
      href="/login"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
        tones[tone],
        sizes[size],
        className
      )}
    >
      {children}
    </Link>
  );
}
