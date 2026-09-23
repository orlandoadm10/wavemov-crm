"use client";

import { saveRuleAction } from "@/app/(dashboard)/automacoes/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import {
  ACTION_LABELS,
  CONDITION_FIELDS,
  TRIGGER_LABELS,
  type ActionType,
  type ConditionOp,
  type TriggerEvent,
} from "@/lib/features/automations/domain/rules";
import type { AutomationAction, AutomationCondition, AutomationRule } from "@/types";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { ActionConfigFields } from "./action-config-fields";
import type { AutomationOptions } from "./automations-client";

interface Draft {
  name: string;
  description: string;
  is_active: boolean;
  trigger_event: TriggerEvent;
  trigger_config: Record<string, unknown>;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

const EMPTY: Draft = {
  name: "",
  description: "",
  is_active: true,
  trigger_event: "deal.stage_changed",
  trigger_config: {},
  conditions: [],
  actions: [{ type: "send_whatsapp", config: {} }],
};

const STAGE_TRIGGERS: TriggerEvent[] = ["deal.created", "deal.stage_changed", "deal.won", "deal.lost"];

export function RuleFormModal({
  open,
  rule,
  options,
  onClose,
  onSaved,
}: {
  open: boolean;
  rule: AutomationRule | null;
  options: AutomationOptions;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDraft(
      rule
        ? {
            name: rule.name,
            description: rule.description ?? "",
            is_active: rule.is_active,
            trigger_event: rule.trigger_event,
            trigger_config: rule.trigger_config ?? {},
            conditions: rule.conditions ?? [],
            actions: rule.actions ?? [],
          }
        : EMPTY
    );
  }, [open, rule]);

  const cfg = draft.trigger_config;
  const setCfg = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, trigger_config: { ...d.trigger_config, [key]: value } }));
  const isFollowUp = draft.trigger_event === "conversation.no_reply";

  function updateAction(index: number, action: AutomationAction) {
    setDraft((d) => ({ ...d, actions: d.actions.map((a, i) => (i === index ? action : a)) }));
  }
  function moveAction(index: number, delta: number) {
    setDraft((d) => {
      const next = [...d.actions];
      const target = index + delta;
      if (target < 0 || target >= next.length) return d;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, actions: next };
    });
  }
  function updateCondition(index: number, patch: Partial<AutomationCondition>) {
    setDraft((d) => ({ ...d, conditions: d.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveRuleAction(rule?.id ?? null, {
        ...draft,
        description: draft.description.trim() || null,
      });
      if (result.error) setError(result.error);
      else onSaved(result.success ?? "Automação salva.");
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={rule ? "Editar automação" : "Criar automação"}
      subtitle="Gatilho → condições → ações, na ordem"
    >
      <form onSubmit={submit} className="space-y-6">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome">
            <Input
              data-autofocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Ex.: Boas-vindas ao entrar em Proposta"
              required
            />
          </Field>
          <div className="flex items-end pb-2">
            <Switch checked={draft.is_active} onChange={(v) => setDraft({ ...draft, is_active: v })} label="Automação ativa" />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-slate-50/60 p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">1. Quando</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Gatilho" className="sm:col-span-3">
              <Select
                value={draft.trigger_event}
                onChange={(e) =>
                  setDraft({ ...draft, trigger_event: e.target.value as TriggerEvent, trigger_config: {} })
                }
              >
                {(Object.keys(TRIGGER_LABELS) as TriggerEvent[]).map((t) => (
                  <option key={t} value={t}>
                    {TRIGGER_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>

            {STAGE_TRIGGERS.includes(draft.trigger_event) && (
              <>
                <Field label="Funil">
                  <Select value={String(cfg.pipeline_id ?? "")} onChange={(e) => setCfg("pipeline_id", e.target.value)}>
                    <option value="">Qualquer funil</option>
                    {options.pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {draft.trigger_event === "deal.stage_changed" && (
                  <Field label="Entrou na etapa">
                    <Select value={String(cfg.stage_id ?? "")} onChange={(e) => setCfg("stage_id", e.target.value)}>
                      <option value="">Qualquer etapa</option>
                      {options.pipelines
                        .filter((p) => !cfg.pipeline_id || p.id === cfg.pipeline_id)
                        .map((p) => (
                          <optgroup key={p.id} label={p.name}>
                            {p.stages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                    </Select>
                  </Field>
                )}
              </>
            )}

            {isFollowUp ? (
              <>
                <Field label="Horas sem resposta">
                  <Input type="number" min={1} value={String(cfg.hours ?? 24)} onChange={(e) => setCfg("hours", Number(e.target.value))} />
                </Field>
                <Field label="Passo da régua">
                  <Input type="number" min={1} max={10} value={String(cfg.step ?? 1)} onChange={(e) => setCfg("step", Number(e.target.value))} />
                </Field>
                <div className="flex items-end pb-2">
                  <Switch checked={cfg.only_ai === true} onChange={(v) => setCfg("only_ai", v)} label="Só conversas da IA" />
                </div>
                <p className="text-xs text-ink-faint sm:col-span-3">
                  O passo 1 dispara quando a última mensagem foi nossa e o lead ficou em silêncio pelas horas indicadas. Crie
                  o passo 2, 3… para uma régua: cada passo conta a partir do anterior e a régua recomeça quando o lead responde.
                </p>
              </>
            ) : (
              <Field label="Esperar antes de agir (min)">
                <Input
                  type="number"
                  min={0}
                  value={String(cfg.delay_minutes ?? 0)}
                  onChange={(e) => setCfg("delay_minutes", Number(e.target.value))}
                />
              </Field>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">2. Se (opcional)</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={draft.conditions.length >= 10}
              onClick={() =>
                setDraft({ ...draft, conditions: [...draft.conditions, { field: "deal.source", op: "eq", value: "" }] })
              }
            >
              <Plus className="h-3.5 w-3.5" /> Condição
            </Button>
          </div>
          {draft.conditions.length === 0 ? (
            <p className="text-xs text-ink-faint">Sem condições: a automação vale para todo evento do gatilho.</p>
          ) : (
            <div className="space-y-2">
              {draft.conditions.map((c, i) => (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_140px_1fr_auto]">
                  <Select aria-label="Campo" value={c.field} onChange={(e) => updateCondition(i, { field: e.target.value })}>
                    {CONDITION_FIELDS.map((f) => (
                      <option key={f.field} value={f.field}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                  <Select aria-label="Operador" value={c.op} onChange={(e) => updateCondition(i, { op: e.target.value as ConditionOp })}>
                    <option value="eq">é igual a</option>
                    <option value="neq">é diferente de</option>
                    <option value="contains">contém</option>
                  </Select>
                  <Input aria-label="Valor" value={c.value} onChange={(e) => updateCondition(i, { value: e.target.value })} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover condição"
                    onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">3. Então</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={draft.actions.length >= 10}
              onClick={() => setDraft({ ...draft, actions: [...draft.actions, { type: "add_note", config: {} }] })}
            >
              <Plus className="h-3.5 w-3.5" /> Ação
            </Button>
          </div>
          <div className="space-y-3">
            {draft.actions.map((action, i) => (
              <div key={i} className="rounded-xl border border-line bg-white p-3">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">
                    {i + 1}
                  </span>
                  <Select
                    aria-label="Tipo de ação"
                    value={action.type}
                    onChange={(e) => updateAction(i, { type: e.target.value, config: {} })}
                  >
                    {(Object.keys(ACTION_LABELS) as ActionType[]).map((t) => (
                      <option key={t} value={t}>
                        {ACTION_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                  <Button type="button" variant="ghost" size="icon" aria-label="Subir" onClick={() => moveAction(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Descer"
                    onClick={() => moveAction(i, 1)}
                    disabled={i === draft.actions.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover ação"
                    onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <ActionConfigFields
                  type={action.type as ActionType}
                  config={action.config}
                  onChange={(config) => updateAction(i, { ...action, config })}
                  options={options}
                />
              </div>
            ))}
          </div>
        </section>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Salvar automação
          </Button>
        </div>
      </form>
    </Modal>
  );
}
