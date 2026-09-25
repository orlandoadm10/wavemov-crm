"use client";

import { Select } from "@/components/ui/input";
import type { Pipeline, Profile } from "@/types";
import { cn, fullName } from "@/lib/utils";

/** Seletores brancos, 40px, raio de 12px (print 5). */
const FILTER = "h-10 w-auto min-w-44 rounded-xl bg-card text-sm";
import { CalendarDays } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function DashboardFilters({
  pipelines,
  members,
}: {
  pipelines: Pipeline[];
  members: Profile[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Select
          aria-label="Período"
          className={cn(FILTER, "pl-9")}
          value={params.get("periodo") ?? "90"}
          onChange={(e) => setParam("periodo", e.target.value)}
        >
        <option value="7">Últimos 7 dias</option>
        <option value="30">Últimos 30 dias</option>
        <option value="90">Últimos 90 dias</option>
        <option value="180">Últimos 6 meses</option>
        <option value="365">Último ano</option>
        </Select>
      </div>
      <Select
        aria-label="Funil"
        className={FILTER}
        value={params.get("funil") ?? ""}
        onChange={(e) => setParam("funil", e.target.value)}
      >
        <option value="">Todos os funis</option>
        {pipelines.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Responsável"
        className={FILTER}
        value={params.get("responsavel") ?? ""}
        onChange={(e) => setParam("responsavel", e.target.value)}
      >
        <option value="">Todos os responsáveis</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {fullName(m)}
          </option>
        ))}
      </Select>
    </div>
  );
}
