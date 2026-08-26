"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency } from "@/lib/utils";
import type { Pipeline, PipelineStage, PipelineStageStats } from "@/types";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  Filter,
  Plus,
  Trash2,
  TrendingDown,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface Props {
  pipelines: Pipeline[];
  activePipeline: Pipeline | null;
  stats: PipelineStageStats[];
  canEdit: boolean;
  canDelete: boolean;
}

const STAGE_COLORS = [
  "#1e40af",
  "#2563eb",
  "#3b82f6",
  "#60a5fa",
  "#06b6d4",
  "#10b981",
  "#059669",
];

export function PipelineStagesClient({
  pipelines,
  activePipeline,
  stats,
  canEdit,
  canDelete,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const supabase = createClient();

  const serverStages = useMemo(
    () => [...(activePipeline?.stages ?? [])].sort((a, b) => a.order_index - b.order_index),
    [activePipeline]
  );

  const [stages, setStages] = useState<PipelineStage[]>(serverStages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Ressincroniza quando o servidor devolve outro funil ou dados atualizados
  const serverKey = serverStages.map((s) => `${s.id}:${s.order_index}:${s.name}`).join(",");
  useEffect(() => setStages(serverStages), [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const statsByStage = useMemo(
    () => new Map(stats.map((s) => [s.stage_id, s])),
    [stats]
  );

  const flow = useMemo(() => {
    const rows = stages.map((stage) => ({
      stage,
      total: Number(statsByStage.get(stage.id)?.deals_total ?? 0),
      open: Number(statsByStage.get(stage.id)?.deals_open ?? 0),
      value: Number(statsByStage.get(stage.id)?.value_open ?? 0),
    }));
    const max = Math.max(1, ...rows.map((r) => r.total));
    return rows.map((row, i) => {
      const prev = i > 0 ? rows[i - 1].total : null;
      return {
        ...row,
        share: (row.total / max) * 100,
        // Retenção = quanto do volume da etapa anterior chegou até aqui
        retention: prev && prev > 0 ? Math.round((row.total / prev) * 100) : null,
      };
    });
  }, [stages, statsByStage]);

  function selectPipeline(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("funil", id);
    router.replace(`${pathname}?${next.toString()}`);
  }

  function flash(id: string) {
    setSavedId(id);
    setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 1500);
  }

  async function renameStage(stage: PipelineStage, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === stage.name) return;
    setError(null);
    const { error: err } = await supabase
      .from("pipeline_stages")
      .update({ name: trimmed })
      .eq("id", stage.id);
    if (err) {
      setError("Não foi possível renomear a etapa.");
      setStages(serverStages);
      return;
    }
    flash(stage.id);
    router.refresh();
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;

    const reordered = [...stages];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    // Normaliza para 0..n-1: os índices vindos do banco podem ter buracos
    // (0, 10, 20…), e persistir só as duas trocadas deixaria a ordem errada.
    const withOrder = reordered.map((s, i) => ({ ...s, order_index: i }));
    setStages(withOrder);
    setBusy(true);
    setError(null);

    // Grava apenas as etapas cujo índice realmente mudou
    const previousIndex = new Map(stages.map((s) => [s.id, s.order_index]));
    const changed = withOrder.filter((s) => previousIndex.get(s.id) !== s.order_index);
    const results = await Promise.all(
      changed.map((s) =>
        supabase.from("pipeline_stages").update({ order_index: s.order_index }).eq("id", s.id)
      )
    );
    setBusy(false);

    if (results.some((r) => r.error)) {
      setError("Não foi possível reordenar as etapas.");
      setStages(serverStages);
      return;
    }
    router.refresh();
  }

  async function addStage() {
    if (!activePipeline) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("pipeline_stages").insert({
      pipeline_id: activePipeline.id,
      name: "Nova etapa",
      order_index: stages.length,
      color: STAGE_COLORS[stages.length % STAGE_COLORS.length],
    });
    setBusy(false);
    if (err) {
      setError("Não foi possível criar a etapa.");
      return;
    }
    router.refresh();
  }

  async function removeStage(stage: PipelineStage) {
    const total = Number(statsByStage.get(stage.id)?.deals_total ?? 0);
    if (total > 0) {
      setError(
        `"${stage.name}" tem ${total} negociação(ões). Mova-as para outra etapa antes de excluir.`
      );
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("pipeline_stages").delete().eq("id", stage.id);
    setBusy(false);
    if (err) {
      setError("Não foi possível excluir a etapa. Verifique suas permissões.");
      return;
    }
    router.refresh();
  }

  async function toggleOutcome(stage: PipelineStage, field: "is_won_stage" | "is_lost_stage") {
    const next = !stage[field];
    const patch =
      field === "is_won_stage"
        ? { is_won_stage: next, is_lost_stage: next ? false : stage.is_lost_stage }
        : { is_lost_stage: next, is_won_stage: next ? false : stage.is_won_stage };

    setStages((prev) => prev.map((s) => (s.id === stage.id ? { ...s, ...patch } : s)));
    const { error: err } = await supabase
      .from("pipeline_stages")
      .update(patch)
      .eq("id", stage.id);
    if (err) {
      setError("Não foi possível alterar o tipo da etapa.");
      setStages(serverStages);
      return;
    }
    flash(stage.id);
    router.refresh();
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      setError("O navegador bloqueou a cópia. Selecione o ID manualmente.");
    }
  }

  if (!activePipeline) {
    return (
      <EmptyState
        icon={<Filter className="h-6 w-6" />}
        title="Nenhum funil cadastrado"
        description="O funil padrão é criado junto com a empresa. Fale com o administrador se ele não aparecer aqui."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Etapas do funil"
        subtitle={`${stages.length} etapa(s) · ${activePipeline.name}`}
        actions={
          <>
            {pipelines.length > 1 && (
              <Select
                className="h-10 w-auto min-w-44 text-sm"
                aria-label="Funil"
                value={activePipeline.id}
                onChange={(e) => selectPipeline(e.target.value)}
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
            {canEdit && (
              <Button onClick={addStage} loading={busy}>
                <Plus className="h-4 w-4" />
                Nova etapa
              </Button>
            )}
          </>
        }
      />

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {/* Fluxo do funil — volume e retenção entre etapas */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
            Fluxo do funil
          </h2>
          <span className="text-xs text-ink-faint">barra = volume relativo de negociações</span>
        </div>

        {flow.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">
            Este funil ainda não tem etapas.
          </p>
        ) : (
          <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
            {flow.map((item, i) => (
              <div key={item.stage.id} className="flex items-stretch gap-1">
                <div
                  className="flex w-[168px] shrink-0 flex-col rounded-xl border border-line p-3.5"
                  style={{ borderTop: `3px solid ${item.stage.color}` }}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: item.stage.color }}
                    />
                    <span className="text-sm font-semibold text-ink">{item.stage.name}</span>
                  </div>
                  <p className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold tracking-tight text-ink">
                      {item.total}
                    </span>
                    <span className="text-xs text-ink-faint">negócios</span>
                  </p>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${Math.max(item.share, item.total > 0 ? 6 : 0)}%`,
                        background: item.stage.color,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-ink-faint">
                    {formatCurrency(item.value)} em aberto
                  </p>
                  {item.retention !== null && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-faint">
                      <TrendingDown className="h-3 w-3" />
                      {item.retention}% retido
                    </p>
                  )}
                </div>
                {i < flow.length - 1 && (
                  <span className="flex items-center text-ink-faint" aria-hidden="true">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Editor das etapas */}
      <Card className="mt-4 overflow-hidden">
        <div className="hidden grid-cols-[64px_1fr_220px_140px_56px] gap-4 border-b border-line bg-slate-50/80 px-5 py-3.5 text-[11px] font-semibold tracking-wide text-ink-faint uppercase lg:grid">
          <span>Ordem</span>
          <span>Etapa</span>
          <span>ID</span>
          <span>Tipo</span>
          <span className="text-right">Excluir</span>
        </div>

        <ul className="divide-y divide-line">
          {stages.map((stage, index) => (
            <li
              key={stage.id}
              className="grid grid-cols-1 items-center gap-3 px-5 py-3.5 lg:grid-cols-[64px_1fr_220px_140px_56px] lg:gap-4"
            >
              {/* Ordem */}
              <div className="flex items-center gap-1.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-sm font-semibold text-ink-soft">
                  {index + 1}
                </span>
                {canEdit && (
                  <span className="flex flex-col">
                    <button
                      type="button"
                      aria-label={`Mover ${stage.name} para cima`}
                      disabled={index === 0 || busy}
                      onClick={() => move(index, -1)}
                      className="rounded p-0.5 text-ink-faint hover:bg-slate-100 hover:text-ink disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Mover ${stage.name} para baixo`}
                      disabled={index === stages.length - 1 || busy}
                      onClick={() => move(index, 1)}
                      className="rounded p-0.5 text-ink-faint hover:bg-slate-100 hover:text-ink disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>

              {/* Nome */}
              <div className="flex items-center gap-2">
                <Input
                  // remonta quando o servidor devolve outro nome (ex.: falha ao salvar)
                  key={`${stage.id}:${stage.name}`}
                  aria-label={`Nome da etapa ${index + 1}`}
                  defaultValue={stage.name}
                  disabled={!canEdit}
                  onBlur={(e) => renameStage(stage, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                {savedId === stage.id && (
                  <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Salvo" />
                )}
              </div>

              {/* ID */}
              <button
                type="button"
                onClick={() => copyId(stage.id)}
                title={stage.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs text-ink-soft transition-colors hover:border-primary-300 hover:text-primary-700"
              >
                <span className="truncate font-mono">{stage.id}</span>
                {copiedId === stage.id ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                )}
              </button>

              {/* Tipo (ganho / perdido / intermediária) */}
              <div className="flex flex-wrap items-center gap-1.5">
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleOutcome(stage, "is_won_stage")}
                      aria-pressed={stage.is_won_stage}
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors",
                        stage.is_won_stage
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                          : "bg-white text-ink-faint ring-line hover:text-emerald-700"
                      )}
                    >
                      Ganho
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleOutcome(stage, "is_lost_stage")}
                      aria-pressed={stage.is_lost_stage}
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors",
                        stage.is_lost_stage
                          ? "bg-rose-50 text-rose-700 ring-rose-100"
                          : "bg-white text-ink-faint ring-line hover:text-rose-700"
                      )}
                    >
                      Perdido
                    </button>
                  </>
                ) : (
                  <Badge tone={stage.is_won_stage ? "green" : stage.is_lost_stage ? "red" : "slate"}>
                    {stage.is_won_stage ? "Ganho" : stage.is_lost_stage ? "Perdido" : "Intermediária"}
                  </Badge>
                )}
              </div>

              {/* Excluir */}
              <div className="flex justify-start lg:justify-end">
                {canDelete && (
                  <button
                    type="button"
                    aria-label={`Excluir etapa ${stage.name}`}
                    disabled={busy}
                    onClick={() => removeStage(stage)}
                    className="rounded-lg p-2 text-ink-faint transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {stages.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-ink-faint">
            Nenhuma etapa. Crie a primeira em &ldquo;Nova etapa&rdquo;.
          </p>
        )}
      </Card>

      <p className="mt-3 text-xs text-ink-faint">
        Marcar uma etapa como <strong>Ganho</strong> ou <strong>Perdido</strong> faz o Kanban
        fechar a negociação automaticamente quando um card for movido para ela.
      </p>
    </>
  );
}
