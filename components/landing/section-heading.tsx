import { cn } from "@/lib/utils";

/** Cabeçalho de seção: rótulo, título e apoio, centralizados. */
export function SectionHeading({
  label,
  title,
  description,
  tone = "light",
}: {
  label: string;
  title: string;
  description: string;
  tone?: "light" | "dark";
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span
        className={cn(
          "text-xs font-bold uppercase tracking-[0.18em]",
          tone === "dark" ? "text-primary-300" : "text-primary-600"
        )}
      >
        {label}
      </span>
      <h2
        className={cn(
          "mt-3 text-[clamp(1.75rem,3.4vw,2.5rem)] font-bold leading-tight tracking-tight",
          tone === "dark" ? "text-white" : "text-ink"
        )}
      >
        {title}
      </h2>
      <p
        className={cn(
          "mt-4 text-base leading-relaxed",
          tone === "dark" ? "text-primary-200" : "text-ink-soft"
        )}
      >
        {description}
      </p>
    </div>
  );
}
