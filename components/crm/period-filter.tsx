"use client";

import { cn } from "@/lib/utils";
import { PERIOD_KEYS, PERIOD_LABELS, parsePeriod } from "@/lib/utils/period";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Seletor de período em pílulas (Hoje / 7 dias / 30 dias / Este mês).
// O valor vive na URL para que a página (Server Component) refaça a consulta.
export function PeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = parsePeriod(params.get("periodo") ?? undefined);

  function select(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set("periodo", key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div
      role="group"
      aria-label="Período"
      className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1"
    >
      {PERIOD_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => select(key)}
          aria-pressed={key === active}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            key === active
              ? "bg-primary text-primary-foreground"
              : "text-primary hover:bg-secondary"
          )}
        >
          {PERIOD_LABELS[key]}
        </button>
      ))}
    </div>
  );
}
