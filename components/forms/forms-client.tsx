"use client";


import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { describeWriteError, formatDateTime, fullName, slugify } from "@/lib/utils";
import { EXTERNAL_ID_PATTERN } from "@/lib/validations";
import type { Form, FormField, Pipeline, Profile } from "@/types";
import {
  ArrowDown,
  ArrowUp,
  Check,
  FileText,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface DraftField {
  id?: string;
  label: string;
  field_key: string;
  field_type: FormField["field_type"];
  is_required: boolean;
  options: string[];
}

const DEFAULT_FIELDS: DraftField[] = [
  { label: "Nome", field_key: "name", field_type: "text", is_required: true, options: [] },
  { label: "E-mail", field_key: "email", field_type: "email", is_required: false, options: [] },
  { label: "WhatsApp", field_key: "phone", field_type: "phone", is_required: true, options: [] },
];

/**
 * Erros de escrita do formulário, traduzidos.
 *
 * O `external_id` é único na base INTEIRA, então a colisão pode ser com o
 * formulário de outra empresa. A mensagem diz apenas que o identificador está
 * ocupado — nunca por quem: a resposta crua do PostgREST cita o índice e, com
 * ela, quem tentasse adivinhar identificadores descobriria quais já existem
 * fora da própria conta.
 */
function describeFormWriteError(err: unknown, fallback: string) {
  const code = (err as { code?: string } | null)?.code;
  const details = `${(err as { message?: string } | null)?.message ?? ""}${
    (err as { details?: string } | null)?.details ?? ""
  }`;
  if (code === "23505" && details.includes("forms_external_id_key")) {
    if (err) console.error(fallback, err);
    return "Esse identificador de integração já está em uso. Escolha outro.";
  }
  if (code === "23514" && details.includes("forms_external_id_format")) {
    if (err) console.error(fallback, err);
    return "Identificador de integração inválido: use de 3 a 64 caracteres — letras, números, hífen ou sublinhado.";
  }
  return describeWriteError(err, fallback);
}

export function FormsClient({
  organizationId,
  forms,
  pipelines,
  members,
}: {
  organizationId: string;
  forms: Form[];
  pipelines: Pipeline[];
  members: Profile[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Form | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Estado do formulário em edição
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [externalId, setExternalId] = useState("");
  const [fields, setFields] = useState<DraftField[]>(DEFAULT_FIELDS);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return forms;
    return forms.filter((f) => f.name.toLowerCase().includes(q));
  }, [forms, search]);

  const selectedPipeline = pipelines.find((p) => p.id === pipelineId);
  const stageOptions = (selectedPipeline?.stages ?? [])
    .filter((s) => !s.is_won_stage && !s.is_lost_stage)
    .sort((a, b) => a.order_index - b.order_index);

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setPipelineId(pipelines[0]?.id ?? "");
    setStageId("");
    setResponsibleId("");
    setExternalId("");
    setFields(DEFAULT_FIELDS.map((f) => ({ ...f })));
    setError(null);
    setModalOpen(true);
  }

  function openEdit(form: Form) {
    setEditing(form);
    setName(form.name);
    setDescription(form.description ?? "");
    setPipelineId(form.pipeline_id ?? pipelines[0]?.id ?? "");
    setStageId(form.stage_id ?? "");
    setResponsibleId(form.default_responsible_id ?? "");
    setExternalId(form.external_id ?? "");
    setFields(
      (form.fields ?? [])
        .sort((a, b) => a.order_index - b.order_index)
        .map((f) => ({
          id: f.id,
          label: f.label,
          field_key: f.field_key,
          field_type: f.field_type,
          is_required: f.is_required,
          options: f.options ?? [],
        }))
    );
    setError(null);
    setModalOpen(true);
  }

  function updateField(index: number, patch: Partial<DraftField>) {
    setFields((prev) =>
      prev.map((f, i) =>
        i === index
          ? {
              ...f,
              ...patch,
              ...(patch.label !== undefined && !f.id
                ? { field_key: slugify(patch.label) || f.field_key }
                : {}),
            }
          : f
      )
    );
  }

  function moveField(index: number, dir: -1 | 1) {
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setError(null);
    if (name.trim().length < 2) return setError("Informe o nome do formulário.");
    if (!pipelineId) return setError("Selecione o funil de destino.");
    if (fields.length === 0) return setError("Adicione ao menos um campo.");

    const trimmedExternalId = externalId.trim();
    if (trimmedExternalId && !EXTERNAL_ID_PATTERN.test(trimmedExternalId)) {
      return setError(
        "Identificador de integração inválido: use de 3 a 64 caracteres — letras, números, hífen ou sublinhado."
      );
    }
    setSaving(true);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      pipeline_id: pipelineId,
      stage_id: stageId || stageOptions[0]?.id || null,
      default_responsible_id: responsibleId || null,
      external_id: trimmedExternalId || null,
    };

    let formId = editing?.id;
    if (editing) {
      // `.eq("organization_id")` além do id, e `.select()` para confirmar a
      // linha: sob RLS um update que não atinge nada volta sem erro, e sem a
      // conferência a tela anunciaria "salvo" sobre uma escrita recusada.
      const { data: updated, error: err } = await supabase
        .from("forms")
        .update(payload)
        .eq("id", editing.id)
        .eq("organization_id", organizationId)
        .select("id")
        .maybeSingle();
      if (err || !updated) {
        setSaving(false);
        return setError(describeFormWriteError(err, "Não foi possível salvar o formulário."));
      }
    } else {
      const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 8)}`;
      const { data: created, error: err } = await supabase
        .from("forms")
        .insert({ ...payload, organization_id: organizationId, slug })
        .select("id")
        .single();
      if (err || !created) {
        setSaving(false);
        return setError(describeFormWriteError(err, "Não foi possível criar o formulário."));
      }
      formId = created.id;
    }

    // Recria os campos (estratégia simples e segura)
    if (formId) {
      await supabase.from("form_fields").delete().eq("form_id", formId);
      const { error: fieldsError } = await supabase.from("form_fields").insert(
        fields.map((f, i) => ({
          form_id: formId,
          label: f.label,
          field_key: f.field_key || slugify(f.label) || `campo_${i}`,
          field_type: f.field_type,
          is_required: f.is_required,
          options: f.options,
          order_index: i,
        }))
      );
      if (fieldsError) {
        setSaving(false);
        router.refresh();
        return setError(
          describeWriteError(
            fieldsError,
            "Os campos foram removidos e não puderam ser regravados — o formulário está sem campos agora. Salve novamente antes de divulgar o link."
          )
        );
      }
    }

    setSaving(false);
    setModalOpen(false);
    router.refresh();
  }

  // `is_active` passou a decidir se um fluxo do n8n entrega ou recebe 404
  // (migration 0014): desativar em silêncio, sem conferir a linha, deixaria o
  // operador convencido de que cortou uma integração que segue recebendo.
  async function toggleActive(form: Form) {
    const { data, error: err } = await supabase
      .from("forms")
      .update({ is_active: !form.is_active })
      .eq("id", form.id)
      .eq("organization_id", organizationId)
      .select("id")
      .maybeSingle();
    if (err || !data) {
      setError(
        describeFormWriteError(
          err,
          `Não foi possível ${form.is_active ? "desativar" : "ativar"} o formulário.`
        )
      );
      return;
    }
    setError(null);
    router.refresh();
  }

  async function copyLink(form: Form) {
    const url = `${window.location.origin}/f/${form.slug}`;
    await navigator.clipboard.writeText(url);
    setCopied(form.id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-3 shadow-(--shadow-card)">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            className="pl-9"
            placeholder="Buscar formulário…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo formulário
        </Button>
      </div>

      {/* O erro do modal é desenhado dentro dele; este banner cobre as ações
          da lista (ativar/desativar), que acontecem com o modal fechado e
          antes só falhavam em silêncio. */}
      {error && !modalOpen && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="Nenhum formulário criado"
          description="Crie formulários públicos de captura — cada envio vira contato + negociação no funil."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Criar formulário
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((form) => {
            const pipeline = pipelines.find((p) => p.id === form.pipeline_id);
            const stage = pipeline?.stages?.find((s) => s.id === form.stage_id);
            return (
              <div
                key={form.id}
                className="flex flex-col rounded-2xl border border-line bg-white p-5 shadow-(--shadow-card) transition-shadow hover:shadow-(--shadow-pop)"
              >
                <div className="mb-3 flex items-center justify-between">
                  <button onClick={() => toggleActive(form)}>
                    <Badge tone={form.is_active ? "green" : "slate"} dot>
                      {form.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </button>
                  <span className="text-xs text-ink-faint">
                    {(form.fields ?? []).length} campos
                  </span>
                </div>

                <h3 className="text-sm font-bold text-ink">{form.name}</h3>
                {form.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-ink-faint">{form.description}</p>
                )}

                <dl className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-ink-faint">Criado em</dt>
                    <dd className="font-medium text-ink">{formatDateTime(form.created_at)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-faint">Funil</dt>
                    <dd className="font-medium text-ink">{pipeline?.name ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-faint">Etapa</dt>
                    <dd className="font-medium text-ink">{stage?.name ?? "Primeira etapa"}</dd>
                  </div>
                  {form.external_id && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-faint">Integração</dt>
                      <dd className="min-w-0 truncate font-mono font-medium text-ink" title={form.external_id}>
                        {form.external_id}
                      </dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4">
                  <Button size="sm" onClick={() => copyLink(form)}>
                    {copied === form.id ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Copiado!
                      </>
                    ) : (
                      <>
                        <Link2 className="h-3.5 w-3.5" /> Link
                      </>
                    )}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(form)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de criação/edição com construtor de campos */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar formulário" : "Novo formulário"}
        subtitle="Cada envio cria um contato e uma negociação no funil escolhido"
        size="xl"
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <Field label="Nome do formulário">
              <Input
                placeholder="Ex.: Simulador Plano de Saúde"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Descrição (aparece na página pública)">
              <Input
                placeholder="Preencha e receba uma cotação"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Funil destino">
                <Select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Etapa destino">
                <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
                  <option value="">Primeira etapa</option>
                  {stageOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Responsável padrão">
              <Select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
                <option value="">Sem responsável</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {fullName(m)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Identificador de integração (opcional)">
              <Input
                placeholder="ex.: meta-lead-ads"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                aria-label="Identificador de integração"
                aria-describedby="external-id-hint"
              />
            </Field>
            <p id="external-id-hint" className="-mt-2 text-xs text-ink-faint">
              Preencha para receber leads deste formulário por um fluxo do n8n. É o valor
              que vai em <code className="rounded bg-slate-100 px-1">form_external_id</code>.
              Cole o id da origem <b>exatamente como ele é</b> — maiúsculas e minúsculas
              contam, e trocar a caixa faz o n8n receber 404. Letras, números, hífen ou
              sublinhado. Deixe vazio se o formulário só for usado pela página pública.
            </p>
          </div>

          {/* Construtor de campos */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-soft">Campos do formulário</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setFields((prev) => [
                    ...prev,
                    { label: "", field_key: "", field_type: "text", is_required: false, options: [] },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" /> Campo
              </Button>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-line bg-slate-50/60 p-3">
              {fields.map((f, i) => (
                <div key={i} className="rounded-xl border border-line bg-white p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-8 flex-1 text-xs"
                      placeholder="Rótulo do campo"
                      value={f.label}
                      onChange={(e) => updateField(i, { label: e.target.value })}
                    />
                    <Select
                      className="h-8 w-28 text-xs"
                      value={f.field_type}
                      onChange={(e) =>
                        updateField(i, { field_type: e.target.value as DraftField["field_type"] })
                      }
                    >
                      <option value="text">Texto</option>
                      <option value="email">E-mail</option>
                      <option value="phone">Telefone</option>
                      <option value="number">Número</option>
                      <option value="textarea">Texto longo</option>
                      <option value="select">Seleção</option>
                    </Select>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary-600"
                        checked={f.is_required}
                        onChange={(e) => updateField(i, { is_required: e.target.checked })}
                      />
                      Obrigatório
                    </label>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => moveField(i, -1)}
                        className="rounded p-1 text-ink-faint hover:bg-slate-100"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveField(i, 1)}
                        className="rounded p-1 text-ink-faint hover:bg-slate-100"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setFields((prev) => prev.filter((_, j) => j !== i))}
                        className="rounded p-1 text-ink-faint hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {f.field_type === "select" && (
                    <Input
                      className="mt-2 h-8 text-xs"
                      placeholder="Opções separadas por vírgula"
                      value={f.options.join(", ")}
                      onChange={(e) =>
                        updateField(i, {
                          options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean),
                        })
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setModalOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            {editing ? "Salvar formulário" : "Criar formulário"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
