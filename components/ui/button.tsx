import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/25",
  secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
  // "Fundo da página, borda do campo, hover azul-claro" (DESIGN_GUIDE, seção 18).
  outline:
    "bg-background text-foreground border border-input hover:bg-secondary hover:text-secondary-foreground",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm shadow-destructive/25",
  success: "bg-success text-success-foreground hover:bg-success/90 shadow-sm shadow-success/25",
};

const sizes: Record<Size, string> = {
  // Interface compacta: 32 / 36 / 40 px (DESIGN_GUIDE, seção 18).
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-10 px-5 text-sm gap-2",
  icon: "h-9 w-9 shrink-0",
};

// Classes do botão isoladas para que um <Link> possa ter a mesma aparência
// sem aninhar <button> dentro de <a> (HTML inválido e ruim para teclado).
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: Variant;
  size?: Size;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-colors duration-150 [&_svg]:shrink-0",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={buttonClasses({ variant, size, className })}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";
