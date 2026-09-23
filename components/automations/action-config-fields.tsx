"use client";

// Campos de configuração de cada tipo de ação da automação.
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ActionType } from "@/lib/features/automations/domain/rules";
import type { AutomationOptions } from "./automations-client";

type Config = Record<string, unknown>;

export function ActionConfigFields({
  type,
  config,
  onChange,
  options,
}: {
  type: ActionType;
  config: Config;
  onChange: (config: Config) => void;
  options: AutomationOptions;
}) {
  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });
  const str = (key: string) => (typeof config[key] === "string" ? (config[key] as string) : "");

  switch (type) {
    case "send_whatsapp":
      return (
        <div className="space-y-3">
          <Field label="Mensagem">
            <Textarea
              value={str("text")}
              onChange={(e) => set("text", e.target.value)}
              placeholder="Oi {{contato.nome}}, tudo bem? Vi que você avançou para {{etapa.nome}}…"
            />
          </Field>
          <p className="text-xs text-ink-faint">
            Variáveis: {"{{contato.nome}}"}, {"{{lead.titulo}}"}, {"{{lead.valor}}"}, {"{{etapa.nome}}"},{" "}
            {"{{responsavel.nome}}"}, {"{{empresa.nome}}"}.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Template da Meta (opcional)">
              <Input
                value={str("template_name")}
                onChange={(e) => set("template_name", e.target.value)}
                placeholder="Só para API oficial, fora da janela de 24h"
              />
            </Field>
            <Field label="Idioma do template">
              <Input value={str("template_language")} onChange={(e) => set("template_language", e.target.value)} placeholder="pt_BR" />
            </Field>
          </div>
        </div>
      );
    case "move_stage":
      return (
        <Field label="Etapa de destino">
          <Select value={str("stage_id")} onChange={(e) => set("stage_id", e.target.value)}>
            <option value="">Selecione…</option>
            {options.pipelines.map((p) => (
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
      );
    case "assign_owner":
      return (
        <Field label="Responsável">
          <Select value={str("profile_id")} onChange={(e) => set("profile_id", e.target.value)}>
            <option value="">Selecione…</option>
            {options.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "add_tag":
      return (
        <Field label="Tag">
          <Select value={str("tag_id")} onChange={(e) => set("tag_id", e.target.value)}>
            <option value="">Selecione…</option>
            {options.tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "create_task":
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Título da tarefa" className="sm:col-span-3">
            <Input value={str("title")} onChange={(e) => set("title", e.target.value)} placeholder="Ligar para {{contato.nome}}" />
          </Field>
          <Field label="Prazo (horas)">
            <Input
              type="number"
              min={0}
              value={config.due_in_hours === undefined ? "" : String(config.due_in_hours)}
              onChange={(e) => set("due_in_hours", e.target.value === "" ? undefined : Number(e.target.value))}
            />
          </Field>
          <Field label="Prioridade">
            <Select value={str("priority") || "medium"} onChange={(e) => set("priority", e.target.value)}>
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
            </Select>
          </Field>
        </div>
      );
    case "add_note":
      return (
        <Field label="Nota">
          <Textarea value={str("text")} onChange={(e) => set("text", e.target.value)} />
        </Field>
      );
    case "set_temperature":
      return (
        <Field label="Temperatura">
          <Select value={str("temperature")} onChange={(e) => set("temperature", e.target.value)}>
            <option value="">Selecione…</option>
            <option value="cold">Frio</option>
            <option value="warm">Morno</option>
            <option value="hot">Quente</option>
          </Select>
        </Field>
      );
    case "set_handling_mode":
      return (
        <Switch
          checked={config.mode === "ai"}
          onChange={(v) => set("mode", v ? "ai" : "human")}
          label={config.mode === "ai" ? "Passar a conversa para a IA" : "Passar a conversa para a equipe"}
        />
      );
    case "call_webhook":
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="URL (ex.: webhook do n8n)" className="sm:col-span-2">
            <Input type="url" value={str("url")} onChange={(e) => set("url", e.target.value)} placeholder="https://n8n.suaempresa.com/webhook/…" />
          </Field>
          <Field label="Segredo para assinatura (opcional)" className="sm:col-span-2">
            <Input value={str("secret")} onChange={(e) => set("secret", e.target.value)} placeholder="Gera o cabeçalho X-JID-Signature (HMAC-SHA256)" />
          </Field>
        </div>
      );
  }
}
