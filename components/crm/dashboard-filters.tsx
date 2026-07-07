"use client";

import { Select } from "@/components/ui/input";
import type { Pipeline, Profile } from "@/types";
import { fullName } from "@/lib/utils";
import { SlidersHorizontal } from "lucide-react";
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
      <span className="mr-1 hidden items-center gap-1.5 text-xs font-medium text-ink-faint sm:flex">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filtros
      </span>
      <Select
        className="h-9 w-auto min-w-36 text-xs"
        value={params.get("periodo") ?? "90"}
        onChange={(e) => setParam("periodo", e.target.value)}
      >
        <option value="7">Últimos 7 dias</option>
        <option value="30">Últimos 30 dias</option>
        <option value="90">Últimos 90 dias</option>
        <option value="180">Últimos 6 meses</option>
        <option value="365">Último ano</option>
      </Select>
      <Select
        className="h-9 w-auto min-w-36 text-xs"
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
        className="h-9 w-auto min-w-36 text-xs"
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
