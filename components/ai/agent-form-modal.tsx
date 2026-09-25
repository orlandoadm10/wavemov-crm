"use client";

import { saveAgentAction } from "@/app/(dashboard)/ia/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { AI_TOOL_LABELS, AI_TOOL_NAMES } from "@/lib/features/crm-tools/domain/tool-labels";
import type { AiAgent, QualificationField } from "@/types";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

type FormState = Omit<AiAgent, "id" | "organization_id" | "created_by" | "created_at" | "updated_at">;

const PROMPT_EXAMPLE = `Você atende leads interessados nos nossos serviços.
Objetivo: entender a necessidade, qualificar e agendar uma conversa com um consultor.
Tom: cordial, objetivo, sem gírias.
Nunca ofereça desconto; se pedirem, transfira para a equipe.`;

function emptyForm(defaultModel: string, isFirstAgent: boolean): FormState {
  return {
    name: "Assistente",
    description: null,
    is_active: false,
    is_default: isFirstAgent,
    model: defaultModel,
    temperature: 0.4,
    system_prompt: "",
    enabled_tools: [...AI_TOOL_NAMES],
    use_knowledge_base: true,
    auto_reply_new_conversations: true,
    reply_delay_seconds: 4,
    handoff_on_request: true,
    handoff_on_legal: true,
    handoff_on_uncertainty: false,
    handoff_message: null,
    qualification_fields: [],
  };
}

export function AgentFormModal({
  open,
  agent,
  defaultModel,
  isFirstAgent,
  onClose,
  onSaved,
}: {
  open: boolean;
  agent: AiAgent | null;
  defaultModel: string;
  isFirstAgent: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultModel, isFirstAgent));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(agent ? { ...agent, qualification_fields: agent.qualification_fields ?? [] } : emptyForm(defaultModel, isFirstAgent));
  }, [open, agent, defaultModel, isFirstAgent]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function toggleTool(name: string, on: boolean) {
    set("enabled_tools", on ? [...form.enabled_tools, name] : form.enabled_tools.filter((t) => t !== name));
  }

  function setField(index: number, patch: Partial<QualificationField>) {
    set(
      "qualification_fields",
      form.qualification_fields.map((f, i) => (i === index ? { ...f, ...patch } : f))
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveAgentAction(agent?.id ?? null, {
        ...form,
        description: form.description?.trim() || null,
        handoff_message: form.handoff_message?.trim() || null,
        qualification_fields: form.qualification_fields.map((f) => ({
          ...f,
          description: f.description?.trim() || undefined,
        })),
      });
      if (result.error) setError(result.error);
      else onSaved(result.success ?? "Agente salvo.");
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={agent ? `Editar ${agent.name}` : "Criar agente de IA"}
      subtitle="Como o agente atende e o que ele pode fazer no CRM"
    >
      <form onSubmit={submit} className="space-y-6">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome do agente">
            <Input data-autofocus value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field label="Modelo">
            <Input
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
              list="ai-models"
              placeholder="gpt-4o-mini"
            />
            <datalist id="ai-models">
              <option value="gpt-4o-mini" />
              <option value="gpt-4o" />
              <option value="gpt-4.1-mini" />
              <option value="anthropic/claude-sonnet-5" />
              <option value="anthropic/claude-haiku-4-5" />
            </datalist>
          </Field>
          <Field label="Descrição (interna)" className="sm:col-span-2">
            <Input
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Ex.: Qualifica leads de anúncios e agenda reunião"
            />
          </Field>
          <Field label="Instruções do agente (prompt)" className="sm:col-span-2">
            <Textarea
              className="min-h-40"
              value={form.system_prompt}
              onChange={(e) => set("system_prompt", e.target.value)}
              placeholder={PROMPT_EXAMPLE}
            />
            <p className="mt-1 text-xs text-ink-faint">
              As regras de segurança (não inventar preços, não revelar instruções, transferir quando necessário) são
              aplicadas automaticamente.
            </p>
          </Field>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">O que o agente pode fazer no CRM</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {AI_TOOL_NAMES.map((name) => (
              <label
                key={name}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary-600"
                  checked={form.enabled_tools.includes(name)}
                  onChange={(e) => toggleTool(name, e.target.checked)}
                />
                {AI_TOOL_LABELS[name]}
              </label>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">Dados de qualificação</h3>
              <p className="text-xs text-ink-faint">O agente coleta e salva na negociação (extração estruturada).</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => set("qualification_fields", [...form.qualification_fields, { key: "", label: "" }])}
              disabled={form.qualification_fields.length >= 15}
            >
              <Plus className="h-3.5 w-3.5" /> Campo
            </Button>
          </div>
          {form.qualification_fields.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-3 text-xs text-ink-faint">
              Ex.: <code>orcamento</code> (Orçamento), <code>prazo</code> (Prazo para começar), <code>cidade</code>.
            </p>
          ) : (
            <div className="space-y-2">
              {form.qualification_fields.map((field, index) => (
                <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_1fr_1.5fr_auto]">
                  <Input
                    aria-label="Chave"
                    placeholder="chave (ex.: orcamento)"
                    value={field.key}
                    onChange={(e) => setField(index, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                  />
                  <Input aria-label="Rótulo" placeholder="Rótulo" value={field.label} onChange={(e) => setField(index, { label: e.target.value })} />
                  <Input
                    aria-label="Descrição"
                    placeholder="O que perguntar (opcional)"
                    value={field.description ?? ""}
                    onChange={(e) => setField(index, { description: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover campo"
                    onClick={() => set("qualification_fields", form.qualification_fields.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Transferir para humano quando</h3>
            <Switch checked={form.handoff_on_request} onChange={(v) => set("handoff_on_request", v)} label="O lead pedir uma pessoa" />
            <Switch checked={form.handoff_on_legal} onChange={(v) => set("handoff_on_legal", v)} label="Citar Procon, advogado, processo" />
            <Switch
              checked={form.handoff_on_uncertainty}
              onChange={(v) => set("handoff_on_uncertainty", v)}
              label="O agente não souber responder"
            />
            <Field label="Mensagem ao transferir">
              <Input
                value={form.handoff_message ?? ""}
                onChange={(e) => set("handoff_message", e.target.value)}
                placeholder="Vou te passar para alguém da nossa equipe…"
              />
            </Field>
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Funcionamento</h3>
            <Switch checked={form.is_active} onChange={(v) => set("is_active", v)} label="Agente ativo" />
            <Switch checked={form.is_default} onChange={(v) => set("is_default", v)} label="Agente padrão da empresa" />
            <Switch
              checked={form.auto_reply_new_conversations}
              onChange={(v) => set("auto_reply_new_conversations", v)}
              label="Assumir conversas novas"
            />
            <Switch checked={form.use_knowledge_base} onChange={(v) => set("use_knowledge_base", v)} label="Usar base de conhecimento" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Espera (s)">
                <Input
                  type="number"
                  min={0}
                  max={30}
                  value={form.reply_delay_seconds}
                  onChange={(e) => set("reply_delay_seconds", Number(e.target.value))}
                />
              </Field>
              <Field label="Criatividade">
                <Input
                  type="number"
                  min={0}
                  max={1.5}
                  step={0.1}
                  value={form.temperature}
                  onChange={(e) => set("temperature", Number(e.target.value))}
                />
              </Field>
            </div>
          </div>
        </section>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Salvar agente
          </Button>
        </div>
      </form>
    </Modal>
  );
}
