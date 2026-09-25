"use client";

import { createLeadSourceAction } from "@/app/(dashboard)/fontes/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PROVIDERS, type LeadSourceProvider } from "@/lib/features/lead-sources/domain/providers";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import type { DestinationFormOption, MemberOption, PipelineOption } from "./types";

type DestinationMode = "new" | "existing";

/**
 * Passo 1 da conexão: nome e para onde os leads vão. O passo 2 (URL, teste
 * ao vivo e campos) é a página da fonte, para onde a tela segue ao criar.
 *
 * O padrão é "destino novo" com o funil padrão: quem não sabe o que é um
 * formulário de destino só precisa escolher o funil.
 */
export function ConnectSourceModal({
  provider,
  onClose,
  destinationForms,
  pipelines,
  members,
}: {
  provider: LeadSourceProvider | null;
  onClose: () => void;
  destinationForms: DestinationFormOption[];
  pipelines: PipelineOption[];
  members: MemberOption[];
}) {
  const router = useRouter();
  const ids = { name: useId(), pipeline: useId(), stage: useId(), responsible: useId(), form: useId() };
  const defaultPipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];

  const [name, setName] = useState("");
  const [mode, setMode] = useState<DestinationMode>("new");
  const [pipelineId, setPipelineId] = useState(defaultPipeline?.id ?? "");
  const [stageId, setStageId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [formId, setFormId] = useState(destinationForms[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Cada abertura começa limpa: a origem pode ter mudado entre uma e outra.
  useEffect(() => {
    if (!provider) return;
    setName("");
    setMode("new");
    setPipelineId(defaultPipeline?.id ?? "");
    setStageId("");
    setResponsibleId("");
    setFormId(destinationForms[0]?.id ?? "");
    setError(null);
  }, [provider, defaultPipeline?.id, destinationForms]);

  const stages = pipelines.find((p) => p.id === pipelineId)?.stages ?? [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!provider) return;
    setError(null);
    startTransition(async () => {
      const result = await createLeadSourceAction({
        name,
        provider,
        destination:
          mode === "existing" ? { mode, formId } : { mode, pipelineId, stageId, responsibleId },
      });
      if (result.error || !result.sourceId) {
        setError(result.error ?? "Não foi possível criar a conexão.");
        return;
      }
      router.push(`/fontes/${result.sourceId}`);
    });
  }

  const label = provider ? PROVIDERS[provider].label : "";

  return (
    <Modal open={!!provider} onClose={onClose} title={`Conectar ${label}`} subtitle="Passo 1 de 2 · para onde vão os leads">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <Label htmlFor={ids.name}>Nome da conexão</Label>
          <Input
            id={ids.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={provider === "typeform" ? "Ex.: Typeform Plano Saúde" : "Ex.: Formulário do site"}
            autoFocus
            required
            minLength={2}
            maxLength={80}
          />
          <p className="mt-1 text-xs text-ink-faint">Aparece no card do lead como origem.</p>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-ink-soft">Destino dos leads</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                ["new", "Escolher funil e etapa", "Recomendado"],
                ["existing", "Usar um formulário existente", "Mesmos campos e regras dele"],
              ] as const
            ).map(([value, title, hint]) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors",
                  mode === value ? "border-primary-400 bg-primary-50/50" : "border-line hover:border-primary-300",
                  value === "existing" && destinationForms.length === 0 && "cursor-not-allowed opacity-50"
                )}
              >
                <input
                  type="radio"
                  name="destino"
                  value={value}
                  checked={mode === value}
                  disabled={value === "existing" && destinationForms.length === 0}
                  onChange={() => setMode(value)}
                  className="mt-0.5 accent-primary-600"
                />
                <span>
                  <span className="block font-medium text-ink">{title}</span>
                  <span className="block text-xs text-ink-faint">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {mode === "new" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor={ids.pipeline}>Funil</Label>
              <Select
                id={ids.pipeline}
                value={pipelineId}
                onChange={(e) => {
                  setPipelineId(e.target.value);
                  setStageId("");
                }}
                required
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isDefault ? " (padrão)" : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={ids.stage}>Etapa de entrada</Label>
              <Select id={ids.stage} value={stageId} onChange={(e) => setStageId(e.target.value)}>
                <option value="">Primeira etapa do funil</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={ids.responsible}>Responsável</Label>
              <Select id={ids.responsible} value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
                <option value="">Regras de distribuição</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : (
          <div>
            <Label htmlFor={ids.form}>Formulário</Label>
            <Select id={ids.form} value={formId} onChange={(e) => setFormId(e.target.value)} required>
              {destinationForms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.pipelineName ? ` → ${f.pipelineName}` : ""}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-ink-faint">
              Funil, etapa, responsável e campos passam a ser os deste formulário.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending} disabled={mode === "new" && !pipelineId}>
            Criar e gerar a URL
          </Button>
        </div>
      </form>
    </Modal>
  );
}
