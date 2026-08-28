"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { describeWriteError } from "@/lib/utils";
import type { DealTag } from "@/types";
import { Tags } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface Props {
  dealId: string;
  organizationId: string;
  tags: DealTag[];
  selectedTags: DealTag[];
  canEdit: boolean;
  compact?: boolean;
  onChange?: (tags: DealTag[]) => void;
  loadError?: string | null;
}

export function DealTagsSelector({
  dealId,
  organizationId,
  tags,
  selectedTags: serverSelected,
  canEdit,
  compact = false,
  onChange,
  loadError = null,
}: Props) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(serverSelected);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serverKey = `${organizationId}|${dealId}|${serverSelected
    .map((tag) => `${tag.id}:${tag.updated_at}`)
    .sort()
    .join(",")}`;
  useEffect(() => setSelected(serverSelected), [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeTags = useMemo(
    () => tags.filter((tag) => tag.is_active).sort(compareTags),
    [tags]
  );

  function openSelector() {
    setDraftIds(selected.filter((tag) => tag.is_active).map((tag) => tag.id));
    setError(null);
    setOpen(true);
  }

  function toggle(tagId: string) {
    setDraftIds((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]
    );
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const { error: writeError } = await supabase.rpc("set_deal_tags", {
      target_deal_id: dealId,
      tag_ids: draftIds,
    });
    if (writeError) {
      setSaving(false);
      setError(
        describeWriteError(
          writeError,
          "Não foi possível salvar as tags. Atualize a página e tente novamente."
        )
      );
      return;
    }

    // A RPC é security invoker: se o lead for transferido enquanto o modal
    // está aberto, o SELECT interno pode enxergar zero linhas sem produzir
    // erro. Confirma acesso e conjunto final antes de anunciar sucesso.
    const [{ data: dealRows, error: dealError }, { data: assignmentRows, error: assignmentError }] =
      await Promise.all([
        supabase
          .from("deals")
          .select("id")
          .eq("id", dealId)
          .eq("organization_id", organizationId),
        supabase
          .from("deal_tag_assignments")
          .select("tag_id")
          .eq("deal_id", dealId)
          .eq("organization_id", organizationId),
      ]);
    const persistedIds = (assignmentRows ?? []).map((row) => row.tag_id).sort();
    const requestedIds = [...draftIds].sort();
    if (
      dealError ||
      assignmentError ||
      (dealRows ?? []).length === 0 ||
      persistedIds.join(",") !== requestedIds.join(",")
    ) {
      setSaving(false);
      setError("As tags não foram confirmadas. O lead pode ter sido transferido; atualize a página.");
      return;
    }

    const next = activeTags.filter((tag) => draftIds.includes(tag.id));
    setSaving(false);
    setSelected(next);
    onChange?.(next);
    setOpen(false);
  }

  return (
    <div className={compact ? "mt-3" : "rounded-2xl border border-line bg-white p-4 shadow-(--shadow-card)"}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-faint uppercase">
          <Tags className="h-3.5 w-3.5" />
          Tags
        </p>
        {canEdit && !loadError && (
          <Button size="sm" variant="ghost" onClick={openSelector}>
            {selected.length > 0 ? "Editar tags" : "Adicionar tags"}
          </Button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {selected.length > 0 ? (
          selected.map((tag) => (
            <Badge key={tag.id} tone={tag.tone}>
              {tag.name}
            </Badge>
          ))
        ) : (
          <p className="text-xs text-ink-faint">Nenhuma tag aplicada.</p>
        )}
      </div>
      {loadError && (
        <p role="alert" className="mt-2 text-xs text-rose-700">{loadError}</p>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Selecionar tags" size="sm">
        {activeTags.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-5 text-center">
            <p className="text-sm font-semibold text-ink">Nenhuma tag ativa</p>
            <p className="mt-1 text-xs text-ink-faint">
              Peça a um administrador para criar uma tag no catálogo.
            </p>
          </div>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {selected.some((tag) => !tag.is_active) && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Tags inativas já aplicadas deixam de fazer parte do lead quando você salvar uma nova seleção.
              </p>
            )}
            {activeTags.map((tag) => (
              <label
                key={tag.id}
                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={draftIds.includes(tag.id)}
                  onChange={() => toggle(tag.id)}
                  className="h-4 w-4 rounded border-line text-primary-600 focus-visible:outline-2 focus-visible:outline-primary-500"
                />
                <Badge tone={tag.tone}>{tag.name}</Badge>
                {tag.category && (
                  <span className="ml-auto truncate text-xs text-ink-faint">{tag.category}</span>
                )}
              </label>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={activeTags.length === 0}>
            Salvar tags
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function compareTags(a: DealTag, b: DealTag) {
  return (a.category ?? "").localeCompare(b.category ?? "", "pt-BR") ||
    a.name.localeCompare(b.name, "pt-BR");
}
