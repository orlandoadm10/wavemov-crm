"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import { cn, describeWriteError, formatCurrency } from "@/lib/utils";
import type { Pipeline, PipelineStage, PipelineStageStats } from "@/types";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  Filter,
  Pencil,
  Plus,
  Star,
  Trash2,
  TrendingDown,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface Props {
  organizationId: string;
  pipelines: Pipeline[];
  activePipeline: Pipeline | null;
  stats: PipelineStageStats[];
  canEdit: boolean;
  canDelete: boolean;
}

/** Retorno de `pipeline_delete_blockers` (migration 0012). */
interface DeleteBlockers {
  deals_count: number;
  forms_count: number;
  is_default: boolean;
  is_last_pipeline: boolean;
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
  organizationId,
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
  const [settingDefault, setSettingDefault] = useState(false);

  // CRUD de funis
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [withDefaultStages, setWithDefaultStages] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [renameDescription, setRenameDescription] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [blockers, setBlockers] = useState<DeleteBlockers | null>(null);
  const [checkingBlockers, setCheckingBlockers] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Ressincroniza quando o servidor devolve outro funil ou dados atualizados.
  // O id do funil entra na chave porque dois funis sem etapa nenhuma geram a
  // mesma lista vazia — sem ele, alternar entre eles não dispararia o efeito.
  const serverKey = [
    activePipeline?.id ?? "",
    ...serverStages.map((s) => `${s.id}:${s.order_index}:${s.name}`),
  ].join(",");
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

  /**
   * Define o funil ativo como padrão da organização.
   *
   * Passa pela RPC `set_default_pipeline` (migration 0012) em vez de um update
   * direto: o trigger do banco recusa mexer em `is_default` por fora, porque
   * dois updates soltos deixariam a empresa com dois padrões ou nenhum.
   */
  async function makeDefault() {
    if (!activePipeline || activePipeline.is_default) return;
    setSettingDefault(true);
    setError(null);
    const { error: err } = await supabase.rpc("set_default_pipeline", {
      target_pipeline_id: activePipeline.id,
    });
    setSettingDefault(false);
    if (err) {
      setError(
        describeWriteError(
          err,
          "Não foi possível tornar este o funil padrão. Só o administrador da empresa pode fazer isso."
        )
      );
      return;
    }
    router.refresh();
  }

  /**
   * Cria um funil com etapas mínimas numa transação só, pela RPC
   * `create_pipeline` (0012). Nunca por `insert` direto: `deals.stage_id` é
   * obrigatório, e um funil sem etapa aberta nasceria inutilizável.
   *
   * Quem decide o padrão é o banco — a empresa sem nenhum funil ganha o
   * primeiro como padrão, e um funil adicional nunca toma o posto.
   */
  async function createPipeline() {
    const nome = newName.trim();
    // O Enter no campo não passa pelo Button, então não herda o `disabled`
    // dele: sem esta guarda, segurar a tecla cria um funil por repetição.
    if (!nome || creating) return;
    setCreating(true);
    setCreateError(null);

    const { data, error: err } = await supabase.rpc("create_pipeline", {
      org_id: organizationId,
      pipeline_name: nome,
      pipeline_description: newDescription.trim() || null,
      with_default_stages: withDefaultStages,
    });
    setCreating(false);

    if (err || !data) {
      setCreateError(
        describeWriteError(
          err,
          "Não foi possível criar o funil. Só o administrador da empresa pode criar funis."
        )
      );
      return;
    }

    setCreateOpen(false);
    setNewName("");
    setNewDescription("");
    setWithDefaultStages(true);
    // `selectPipeline` navega para uma URL nova numa rota force-dynamic, o que
    // já refaz a busca no servidor: um `router.refresh()` aqui seria um
    // segundo round-trip resolvido contra a URL antiga.
    selectPipeline(String(data)); // abre o funil recém-criado
  }

  async function renamePipeline() {
    if (!activePipeline) return;
    const nome = renameName.trim();
    if (!nome || renaming) return;
    setRenaming(true);
    setRenameError(null);

    const { data, error: err } = await supabase
      .from("pipelines")
      .update({ name: nome, description: renameDescription.trim() || null })
      .eq("id", activePipeline.id)
      .eq("organization_id", organizationId)
      .select("id");
    setRenaming(false);

    // Zero linhas = a policy recusou (a 0012 exige org_admin). Sem conferir, a
    // tela fecharia o modal anunciando um "salvo" que não aconteceu.
    if (err || (data ?? []).length === 0) {
      setRenameError(
        describeWriteError(
          err,
          "Não foi possível renomear o funil. Só o administrador da empresa pode alterá-lo."
        )
      );
      return;
    }
    setRenameOpen(false);
    router.refresh();
  }

  /**
   * Consulta o que impede a exclusão ANTES de tentar excluir, para explicar o
   * vínculo em português em vez de traduzir um erro de chave estrangeira.
   */
  async function carregarImpedimentos() {
    if (!activePipeline) return;
    setBlockers(null);
    setCheckingBlockers(true);

    const { data, error: err } = await supabase.rpc("pipeline_delete_blockers", {
      target_pipeline_id: activePipeline.id,
    });
    setCheckingBlockers(false);

    const linha = (data as DeleteBlockers[] | null)?.[0];
    if (err || !linha) {
      setDeleteError(
        describeWriteError(err, "Não foi possível verificar os vínculos deste funil.")
      );
      return;
    }
    // `bigint` pode chegar como string dependendo do transporte; o `Number()`
    // aqui é o que garante que as comparações adiante sejam numéricas.
    setBlockers({
      deals_count: Number(linha.deals_count),
      forms_count: Number(linha.forms_count),
      is_default: linha.is_default,
      is_last_pipeline: linha.is_last_pipeline,
    });
  }

  async function openDelete() {
    if (!activePipeline) return;
    setDeleteOpen(true);
    setDeleteError(null);
    await carregarImpedimentos();
  }

  async function confirmDelete() {
    if (!activePipeline) return;
    setDeleting(true);
    setDeleteError(null);

    const { error: err } = await supabase.rpc("delete_pipeline", {
      target_pipeline_id: activePipeline.id,
    });
    setDeleting(false);

    if (err) {
      // A consulta de impedimentos é de alguns segundos atrás: um lead pode ter
      // caído neste funil nesse intervalo. Recarrega para a lista mostrar o
      // motivo real, em vez de continuar dizendo que estava tudo livre.
      setDeleteError(
        describeWriteError(err, "Não foi possível excluir o funil. Verifique os vínculos abaixo.")
      );
      await carregarImpedimentos();
      return;
    }
    setDeleteOpen(false);
    // Sai do funil que deixou de existir: manter `?funil=<id>` na URL deixaria
    // a tela pedindo um funil apagado depois do refresh.
    const outro = pipelines.find((p) => p.id !== activePipeline.id);
    if (outro) selectPipeline(outro.id);
    else router.replace(pathname);
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

  // Cada impedimento vira uma frase em português. O banco recusaria de todo
  // jeito (FKs `restrict` e triggers da 0012), mas erro de chave estrangeira
  // não é mensagem para o usuário — e explicar antes evita o clique inútil.
  const impedimentos = useMemo(() => {
    if (!blockers || !activePipeline) return [];
    const lista: { texto: string; href?: string; acao?: string }[] = [];
    if (blockers.is_last_pipeline) {
      lista.push({ texto: "É o único funil da empresa. Crie outro antes de excluir este." });
    } else if (blockers.is_default) {
      lista.push({
        texto: "É o funil padrão. Abra outro funil e use “Tornar padrão” antes de excluir este.",
      });
    }
    if (blockers.deals_count > 0) {
      lista.push({
        texto: `${blockers.deals_count} negociação(ões) estão neste funil. Mova-as para outro funil antes.`,
        // `status=todas` de propósito: a contagem do banco inclui ganhas,
        // perdidas e arquivadas, e o Kanban abre filtrado em "abertas" — sem
        // isto o admin acha o quadro vazio e conclui que a tela está mentindo.
        href: `/negociacoes?funil=${activePipeline.id}&status=todas`,
        acao: "Ver negociações",
      });
    }
    if (blockers.forms_count > 0) {
      lista.push({
        texto: `${blockers.forms_count} formulário(s) enviam leads para este funil. Aponte-os para outro funil antes.`,
        href: "/formularios",
        acao: "Ver formulários",
      });
    }
    return lista;
  }, [blockers, activePipeline]);

  const createButton = canEdit ? (
    <Button
      onClick={() => {
        setCreateError(null);
        setCreateOpen(true);
      }}
    >
      <Plus className="h-4 w-4" />
      Novo funil
    </Button>
  ) : null;

  // Os modais moram fora dos dois `return` porque o de criação também precisa
  // existir no estado vazio — é lá que criar o primeiro funil é indispensável.
  const pipelineModals = (
    <>
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo funil"
        subtitle="O funil organiza as etapas por onde os leads passam."
        size="sm"
      >
        <div className="space-y-4">
          <Field label="Nome" error={createError ?? undefined}>
            <Input
              data-autofocus
              aria-label="Nome do funil"
              maxLength={60}
              disabled={creating}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex.: Funil de Parcerias"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) createPipeline();
              }}
            />
          </Field>
          <Field label="Descrição (opcional)">
            <Textarea
              aria-label="Descrição do funil"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Para que serve este funil"
            />
          </Field>
          <div>
            <Switch
              checked={withDefaultStages}
              onChange={setWithDefaultStages}
              label="Começar com etapas padrão"
            />
            <p className="mt-1.5 text-xs text-ink-faint">
              {withDefaultStages
                ? "Cria Lead Novo, Ganho e Perdido. Você renomeia e acrescenta etapas depois."
                : "Cria só a etapa Lead Novo — um funil precisa de ao menos uma etapa aberta para receber leads."}
            </p>
          </div>
          {pipelines.length >= 10 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-100">
              Esta empresa já tem {pipelines.length} funis. Muitos funis costumam ser etapas
              disfarçadas: confira se o caso não cabe numa etapa do funil existente.
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setCreateOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={createPipeline} disabled={!newName.trim()} loading={creating}>
            Criar funil
          </Button>
        </div>
      </Modal>

      <Modal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Renomear funil"
        size="sm"
      >
        <div className="space-y-4">
          <Field label="Nome" error={renameError ?? undefined}>
            <Input
              data-autofocus
              aria-label="Nome do funil"
              maxLength={60}
              disabled={renaming}
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameName.trim()) renamePipeline();
              }}
            />
          </Field>
          <Field label="Descrição (opcional)">
            <Textarea
              aria-label="Descrição do funil"
              value={renameDescription}
              onChange={(e) => setRenameDescription(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRenameOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={renamePipeline} disabled={!renameName.trim()} loading={renaming}>
            Salvar
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Excluir funil"
        subtitle={activePipeline?.name}
        size="sm"
      >
        {checkingBlockers ? (
          <div className="space-y-2" aria-busy aria-label="Verificando vínculos">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : impedimentos.length > 0 ? (
          <>
            <p className="text-sm text-ink-soft">
              Este funil não pode ser excluído agora:
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
              {impedimentos.map((motivo) => (
                <li key={motivo.texto} className="flex gap-2">
                  <span aria-hidden className="text-ink-faint">
                    •
                  </span>
                  <span>
                    {motivo.texto}
                    {motivo.href && (
                      <>
                        {" "}
                        <Link
                          href={motivo.href}
                          className="font-medium text-primary-700 hover:underline"
                        >
                          {motivo.acao}
                        </Link>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : blockers ? (
          <p className="text-sm text-ink-soft">
            As etapas deste funil também serão excluídas. Nenhuma negociação ou formulário
            está vinculado a ele. Esta ação não pode ser desfeita.
          </p>
        ) : null}
        {deleteError && (
          <p role="alert" className="mt-3 text-xs text-rose-600">
            {deleteError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleteOpen(false)}>
            {impedimentos.length > 0 ? "Fechar" : "Cancelar"}
          </Button>
          {blockers && impedimentos.length === 0 && (
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>
              Excluir funil
            </Button>
          )}
        </div>
      </Modal>
    </>
  );

  if (!activePipeline) {
    return (
      <>
        {/* A ação fica só no EmptyState: repetida no cabeçalho, viram dois
            botões idênticos a um palmo de distância. */}
        <PageHeader title="Etapas do funil" />
        <EmptyState
          icon={<Filter className="h-6 w-6" />}
          title="Nenhum funil cadastrado"
          description={
            canEdit
              ? "Crie o primeiro funil da empresa. Ele nasce como padrão e passa a receber os leads que chegam pelo WhatsApp."
              : "O funil padrão é criado junto com a empresa. Fale com o administrador se ele não aparecer aqui."
          }
          action={createButton}
        />
        {pipelineModals}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Etapas do funil"
        subtitle={
          canEdit
            ? `${stages.length} etapa(s) · ${activePipeline.name}`
            : `${stages.length} etapa(s) · ${activePipeline.name} — a estrutura do funil é administrada pelo admin da empresa`
        }
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
                    {p.is_default ? " (padrão)" : ""}
                  </option>
                ))}
              </Select>
            )}
            {activePipeline.is_default ? (
              <Badge tone="blue">Funil padrão</Badge>
            ) : (
              canEdit && (
                <Button variant="outline" onClick={makeDefault} loading={settingDefault}>
                  <Star className="h-4 w-4" />
                  Tornar padrão
                </Button>
              )
            )}
            {canEdit && (
              <Button
                variant="outline"
                aria-label="Renomear funil"
                onClick={() => {
                  setRenameName(activePipeline.name);
                  setRenameDescription(activePipeline.description ?? "");
                  setRenameError(null);
                  setRenameOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
                Renomear
              </Button>
            )}
            {canDelete && (
              <Button variant="outline" aria-label="Excluir funil" onClick={openDelete}>
                <Trash2 className="h-4 w-4 text-rose-500" />
                Excluir
              </Button>
            )}
            {createButton}
            {canEdit && (
              <Button onClick={addStage} loading={busy}>
                <Plus className="h-4 w-4" />
                Nova etapa
              </Button>
            )}
          </>
        }
      />

      {activePipeline.is_default && (
        <p className="mb-4 text-xs text-ink-faint">
          Leads sem escolha explícita de funil — os que chegam pelo WhatsApp e os criados no
          atendimento — entram neste funil.
        </p>
      )}

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

      {pipelineModals}
    </>
  );
}
