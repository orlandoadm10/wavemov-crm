"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { describeWriteError } from "@/lib/utils";
import type { DealTag, DealTagTone } from "@/types";
import { Archive, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface Props {
  organizationId: string;
  profileId: string;
  tags: DealTag[];
  loadError: string | null;
}

const TONES: { value: DealTagTone; label: string }[] = [
  { value: "blue", label: "Azul" },
  { value: "green", label: "Verde" },
  { value: "red", label: "Vermelho" },
  { value: "amber", label: "Amarelo" },
  { value: "slate", label: "Cinza" },
  { value: "violet", label: "Violeta" },
  { value: "cyan", label: "Ciano" },
  { value: "orange", label: "Laranja" },
];

const EMPTY_FORM = { name: "", category: "", tone: "slate" as DealTagTone };

export function TagsCatalogClient({ organizationId, profileId, tags: serverTags, loadError }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [tags, setTags] = useState(serverTags);
  const [editing, setEditing] = useState<DealTag | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DealTag | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  // O erro de nome só aparece depois que o campo foi tocado: abrir o modal de
  // criação já mostrando "Informe o nome da tag." em vermelho faz o primeiro
  // contato com o recurso parecer uma tela de erro.
  const [nameTouched, setNameTouched] = useState(false);

  const serverKey = serverTags.map((tag) => `${tag.id}:${tag.updated_at}`).join(",");
  useEffect(() => setTags(serverTags), [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(
    () => [...new Set(tags.map((tag) => tag.category).filter(Boolean) as string[])].sort(),
    [tags]
  );

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setNameTouched(false);
    setModalOpen(true);
  }

  function openEdit(tag: DealTag) {
    setEditing(tag);
    setForm({ name: tag.name, category: tag.category ?? "", tone: tag.tone });
    setError(null);
    setNameTouched(false);
    setModalOpen(true);
  }

  async function save() {
    const name = form.name.trim();
    if (!name || saving) return;
    setSaving(true);
    setError(null);
    const values = { name, category: form.category.trim() || null, tone: form.tone };

    const result = editing
      ? await supabase
          .from("deal_tags")
          .update(values)
          .eq("id", editing.id)
          .eq("organization_id", organizationId)
          .select("id")
      : await supabase
          .from("deal_tags")
          .insert({ ...values, organization_id: organizationId, created_by: profileId })
          .select("id");
    setSaving(false);

    if (result.error || (result.data ?? []).length === 0) {
      setError(
        describeWriteError(
          result.error,
          "Não foi possível salvar a tag. Use um nome único nesta empresa."
        )
      );
      return;
    }
    setModalOpen(false);
    router.refresh();
  }

  async function toggleActive(tag: DealTag) {
    if (togglingId) return;
    setTogglingId(tag.id);
    setError(null);
    const next = !tag.is_active;
    setTags((current) => current.map((item) => (item.id === tag.id ? { ...item, is_active: next } : item)));
    const { data, error: writeError } = await supabase
      .from("deal_tags")
      .update({ is_active: next })
      .eq("id", tag.id)
      .eq("organization_id", organizationId)
      .select("id");

    if (writeError || (data ?? []).length === 0) {
      setTogglingId(null);
      setTags((current) => current.map((item) => (item.id === tag.id ? tag : item)));
      setError(describeWriteError(writeError, "Não foi possível alterar o estado da tag."));
      return;
    }
    setTogglingId(null);
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    setError(null);
    const { error: writeError } = await supabase.rpc("delete_deal_tag", {
      target_tag_id: deleting.id,
    });
    setDeleteBusy(false);

    if (writeError) {
      setError(
        describeWriteError(
          writeError,
          "Não foi possível excluir a tag. Se ela já foi usada, desative-a para preservar o histórico."
        )
      );
      setDeleting(null);
      return;
    }
    setDeleting(null);
    router.refresh();
  }

  return (
    <>
      <PageHeader eyebrow="Vendas"
        title="Catálogo de tags"
        subtitle="Organize situações operacionais usadas pela equipe nas negociações"
        actions={!loadError ? (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Criar tag
          </Button>
        ) : undefined}
      />

      {(loadError || error) && (
        <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {loadError ?? error}
        </p>
      )}

      {loadError ? (
        <EmptyState
          icon={<Tags className="h-6 w-6" />}
          title="Não foi possível carregar as tags"
          description="Atualize a página antes de criar ou alterar o catálogo."
          action={<Button onClick={() => router.refresh()}>Tentar novamente</Button>}
        />
      ) : tags.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-6 w-6" />}
          title="Nenhuma tag cadastrada"
          description="Crie a primeira tag para a equipe identificar situações operacionais nos leads."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Criar tag
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tags.map((tag) => (
            <Card key={tag.id} className={!tag.is_active ? "opacity-70" : undefined}>
              <div className="flex items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tag.tone}>{tag.name}</Badge>
                    {!tag.is_active && <Badge tone="slate">Inativa</Badge>}
                  </div>
                  <p className="mt-2 text-xs text-ink-faint">{tag.category ?? "Sem categoria"}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(tag)} aria-label={`Editar ${tag.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => toggleActive(tag)}
                    aria-label={tag.is_active ? `Desativar ${tag.name}` : `Ativar ${tag.name}`}
                    loading={togglingId === tag.id}
                    disabled={Boolean(togglingId)}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleting(tag)} aria-label={`Excluir ${tag.name}`}>
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar tag" : "Criar tag"} size="sm">
        <div className="space-y-4">
          <Field
            label="Nome"
            error={nameTouched && !form.name.trim() ? "Informe o nome da tag." : undefined}
          >
            <Input
              value={form.name}
              maxLength={32}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              onBlur={() => setNameTouched(true)}
              placeholder="Ex.: Aguardando documento"
              data-autofocus
            />
          </Field>
          <Field label="Categoria (opcional)">
            <Input
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
              placeholder="Ex.: Pendências"
              list="tag-categories"
            />
            <datalist id="tag-categories">
              {categories.map((category) => <option key={category} value={category} />)}
            </datalist>
          </Field>
          <Field label="Cor">
            <Select value={form.tone} onChange={(event) => setForm((current) => ({ ...current, tone: event.target.value as DealTagTone }))}>
              {TONES.map((tone) => <option key={tone.value} value={tone.value}>{tone.label}</option>)}
            </Select>
          </Field>
          <div className="rounded-xl bg-slate-50 p-3">
            <span className="mr-2 text-xs text-ink-faint">Prévia</span>
            <Badge tone={form.tone}>{form.name.trim() || "Nome da tag"}</Badge>
          </div>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} loading={saving} disabled={!form.name.trim()}>Salvar tag</Button>
        </div>
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Excluir tag" size="sm">
        <p className="text-sm text-ink-soft">
          Excluir <strong className="text-ink">{deleting?.name}</strong>? Tags já aplicadas não podem ser excluídas; desative-as para preservar os relatórios.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancelar</Button>
          <Button variant="danger" onClick={confirmDelete} loading={deleteBusy}>Excluir tag</Button>
        </div>
      </Modal>
    </>
  );
}
