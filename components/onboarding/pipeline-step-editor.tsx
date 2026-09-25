"use client";

import { applyPipelineAction } from "@/app/onboarding/actions";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import {
  MAX_STAGES,
  MIN_STAGES,
  PIPELINE_TEMPLATES,
  stageColor,
  validatePipelineDraft,
  type PipelineDraft,
} from "@/lib/features/onboarding/domain/pipeline-templates";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

/**
 * O funil proposto, editável antes de existir. O que se grava é o que está na
 * tela: a proposta viaja inteira no envio, e servidor e banco revalidam.
 */
export function PipelineStepEditor({
  suggestedTemplateId,
  currentPipeline,
}: {
  suggestedTemplateId: string;
  currentPipeline: PipelineDraft | null;
}) {
  const [state, formAction, pending] = useActionState(applyPipelineAction, null);
  const [templateId, setTemplateId] = useState(suggestedTemplateId);
  const [draft, setDraft] = useState<PipelineDraft>(
    () => PIPELINE_TEMPLATES.find((t) => t.id === suggestedTemplateId)?.pipeline ?? PIPELINE_TEMPLATES[0].pipeline
  );

  const openStages = draft.stages.filter((s) => s.kind === "open");
  const closing = draft.stages.filter((s) => s.kind !== "open");
  const validation = validatePipelineDraft(draft);

  function chooseTemplate(id: string) {
    const template = PIPELINE_TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    setTemplateId(id);
    setDraft(template.pipeline);
  }

  function setStages(nextOpen: typeof openStages) {
    setDraft((d) => ({ ...d, stages: [...nextOpen, ...d.stages.filter((s) => s.kind !== "open")] }));
  }

  function renameStage(index: number, name: string) {
    setDraft((d) => ({ ...d, stages: d.stages.map((s, i) => (i === index ? { ...s, name } : s)) }));
  }

  function moveOpen(index: number, delta: -1 | 1) {
    const next = [...openStages];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setStages(next);
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="pipeline" value={JSON.stringify(draft)} />

      <section aria-labelledby="modelos-titulo">
        <h2 id="modelos-titulo" className="mb-2 text-sm font-semibold text-ink">
          Comece por um modelo
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PIPELINE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => chooseTemplate(t.id)}
              aria-pressed={templateId === t.id}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                templateId === t.id
                  ? "border-primary-300 bg-primary-50"
                  : "border-line bg-card hover:border-primary-200"
              )}
            >
              <span className="block text-sm font-semibold text-ink">
                {t.label}
                {t.id === suggestedTemplateId && (
                  <span className="ml-2 text-xs font-medium text-primary-700">sugerido</span>
                )}
              </span>
              <span className="mt-1 line-clamp-2 block text-xs text-ink-faint">
                {t.pipeline.stages.map((s) => s.name).join(" → ")}
              </span>
            </button>
          ))}
        </div>
      </section>

      <Card className="space-y-4 p-6">
        <div>
          <Label htmlFor="pipeline-name">Nome do funil</Label>
          <Input
            id="pipeline-name"
            value={draft.name}
            maxLength={80}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-soft">Etapas em andamento</p>
          <ol className="space-y-2">
            {openStages.map((stage, index) => (
              <li key={index} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: stageColor(stage, index) }}
                />
                <Input
                  aria-label={`Nome da etapa ${index + 1}`}
                  value={stage.name}
                  maxLength={60}
                  onChange={(e) => renameStage(index, e.target.value)}
                />
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Subir ${stage.name || "etapa"}`}
                    disabled={index === 0}
                    onClick={() => moveOpen(index, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Descer ${stage.name || "etapa"}`}
                    disabled={index === openStages.length - 1}
                    onClick={() => moveOpen(index, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${stage.name || "etapa"}`}
                    disabled={openStages.length <= 1 || draft.stages.length <= MIN_STAGES}
                    onClick={() => setStages(openStages.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={draft.stages.length >= MAX_STAGES}
            onClick={() => setStages([...openStages, { name: "", kind: "open" }])}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar etapa
          </Button>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-soft">Fechamento</p>
          <p className="mb-2 text-xs text-ink-faint">
            Toda negociação termina em ganho ou perda. Os nomes podem mudar; as duas etapas são obrigatórias.
          </p>
          <ul className="space-y-2">
            {closing.map((stage, i) => {
              const index = openStages.length + i;
              return (
                <li key={stage.kind} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: stageColor(stage, 0) }}
                  />
                  <Input
                    aria-label={stage.kind === "won" ? "Nome da etapa de ganho" : "Nome da etapa de perda"}
                    value={stage.name}
                    maxLength={60}
                    onChange={(e) => renameStage(index, e.target.value)}
                  />
                </li>
              );
            })}
          </ul>
        </div>

        {currentPipeline && (
          <details className="rounded-lg border border-line bg-muted/50 p-3 text-xs text-ink-soft">
            <summary className="cursor-pointer font-medium">Funil atual ({currentPipeline.name})</summary>
            <p className="mt-2">{currentPipeline.stages.map((s) => s.name).join(" → ")}</p>
            <p className="mt-1 text-ink-faint">Ao continuar, estas etapas são substituídas pelas de cima.</p>
          </details>
        )}

        {!validation.ok && (
          <p className="text-xs text-warning-text">{validation.error}</p>
        )}
        {state?.error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">
            {state.error}
          </p>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/onboarding/empresa" className={buttonClasses({ variant: "ghost" })}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
        <Button type="submit" loading={pending} disabled={!validation.ok}>
          Usar este funil
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
