import { cn } from "@/lib/utils";
import { forwardRef } from "react";

const base =
  // 36px, raio de 6px, borda azul translúcida e anel de 1px no foco (seção 18).
  "w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-ink-faint transition-colors duration-150 focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none disabled:bg-muted disabled:text-muted-foreground";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(base, "h-9", className)} {...props} />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, "min-h-24 py-2.5", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(base, "h-9 appearance-none pr-8", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-[13px] font-medium text-ink-soft", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  error,
  children,
  className,
}: {
  label?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      {children}
      {error && <p className="mt-1 text-xs text-destructive-text">{error}</p>}
    </div>
  );
}
