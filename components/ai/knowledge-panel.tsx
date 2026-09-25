"use client";

import {
  deleteKnowledgeDocumentAction,
  reindexKnowledgeDocumentAction,
  saveKnowledgeDocumentAction,
} from "@/app/(dashboard)/ia/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { DataTable } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import type { AiAgent, KnowledgeDocument } from "@/types";
import { BookOpen, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const STATUS: Record<KnowledgeDocument["status"], { tone: "green" | "amber" | "blue" | "red"; label: string }> = {
  ready: { tone: "green", label: "Pronto" },
  pending: { tone: "amber", label: "Na fila" },
  indexing: { tone: "blue", label: "Indexando" },
  error: { tone: "red", label: "Erro" },
};

type Draft = {
  title: string;
  content: string;
  source_type: KnowledgeDocument["source_type"];
  source_url: string;
  agent_id: string;
};

const EMPTY: Draft = { title: "", content: "", source_type: "text", source_url: "", agent_id: "" };

export function KnowledgePanel({
  documents,
  agents,
  embeddingsReady,
}: {
  documents: KnowledgeDocument[];
  agents: AiAgent[];
  embeddingsReady: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<KnowledgeDocument | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [removing, setRemoving] = useState<KnowledgeDocument | null>(null);
  const [feedback, setFeedback] = useState<{ error?: string; success?: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Enquanto houver material na fila, a lista se atualiza sozinha.
  const indexing = documents.some((d) => d.status === "pending" || d.status === "indexing");
  useEffect(() => {
    if (!indexing) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [indexing, router]);

  function openForm(doc: KnowledgeDocument | null) {
    setEditing(doc);
    setFormError(null);
    setDraft(
      doc
        ? {
            title: doc.title,
            content: doc.content,
            source_type: doc.source_type,
            source_url: doc.source_url ?? "",
            agent_id: doc.agent_id ?? "",
          }
        : EMPTY
    );
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await saveKnowledgeDocumentAction(editing?.id ?? null, {
        title: draft.title,
        content: draft.content,
        source_type: draft.source_type,
        source_url: draft.source_url.trim() || null,
        agent_id: draft.agent_id || null,
      });
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setFeedback(result);
      setOpen(false);
      router.refresh();
    });
  }

  function run(action: () => Promise<{ error?: string; success?: string }>) {
    startTransition(async () => {
      const result = await action();
      setFeedback(result);
      if (!result.error) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          Preços, políticas, produtos e perguntas frequentes. O agente consulta este material antes de responder.
        </p>
        <Button onClick={() => openForm(null)}>
          <Plus className="h-4 w-4" /> Adicionar material
        </Button>
      </div>

      {!embeddingsReady && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-text">
          A chave de embeddings não está configurada no servidor (<code>AI_EMBEDDING_API_KEY</code> ou{" "}
          <code>AI_API_KEY</code>). O material é salvo, mas a indexação falha até ela existir.
        </p>
      )}
      {feedback?.error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">{feedback.error}</p>}
      {feedback?.success && (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success-text">{feedback.success}</p>
      )}

      {documents.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title="Base de conhecimento vazia"
          description="Cole aqui o que o agente precisa saber para responder sem inventar: tabela de preços, horários, políticas, FAQ."
          action={
            <Button onClick={() => openForm(null)}>
              <Plus className="h-4 w-4" /> Adicionar material
            </Button>
          }
        />
      ) : (
        <DataTable>
          <thead className="bg-muted/50 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
            <tr>
              <th className="px-5 py-3.5">Material</th>
              <th className="px-5 py-3.5">Agente</th>
              <th className="px-5 py-3.5">Situação</th>
              <th className="px-5 py-3.5">Atualizado</th>
              <th className="px-5 py-3.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {documents.map((doc) => (
              <tr key={doc.id} className="transition-colors hover:bg-primary-50/40">
                <td className="px-5 py-3.5">
                  <p className="font-medium text-ink">{doc.title}</p>
                  <p className="text-xs text-ink-faint">
                    {doc.content.length.toLocaleString("pt-BR")} caracteres · {doc.chunk_count} trecho(s)
                  </p>
                </td>
                <td className="px-5 py-3.5 text-ink-soft">
                  {agents.find((a) => a.id === doc.agent_id)?.name ?? "Todos"}
                </td>
                <td className="px-5 py-3.5">
                  <Badge tone={STATUS[doc.status].tone} dot>
                    {STATUS[doc.status].label}
                  </Badge>
                  {doc.error && <p className="mt-1 max-w-xs text-xs text-destructive-text">{doc.error}</p>}
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap text-ink-soft">{formatDateTime(doc.updated_at)}</td>
                <td className="px-5 py-3.5">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openForm(doc)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Reindexar"
                      disabled={pending}
                      onClick={() => run(() => reindexKnowledgeDocumentAction(doc.id))}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Excluir"
                      className="hover:bg-destructive/10 hover:text-destructive-text"
                      onClick={() => setRemoving(doc)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={editing ? "Editar material" : "Adicionar material"}
        subtitle="Texto que o agente pode consultar"
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Título" className="sm:col-span-2">
              <Input
                data-autofocus
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Ex.: Tabela de preços 2026"
                required
              />
            </Field>
            <Field label="Tipo">
              <Select
                value={draft.source_type}
                onChange={(e) => setDraft({ ...draft, source_type: e.target.value as Draft["source_type"] })}
              >
                <option value="text">Texto</option>
                <option value="faq">Perguntas frequentes</option>
                <option value="url">Conteúdo de página</option>
              </Select>
            </Field>
            <Field label="Usado por">
              <Select value={draft.agent_id} onChange={(e) => setDraft({ ...draft, agent_id: e.target.value })}>
                <option value="">Todos os agentes</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            {draft.source_type === "url" && (
              <Field label="Endereço de origem (referência)" className="sm:col-span-2">
                <Input
                  type="url"
                  value={draft.source_url}
                  onChange={(e) => setDraft({ ...draft, source_url: e.target.value })}
                  placeholder="https://"
                />
              </Field>
            )}
            <Field label="Conteúdo" className="sm:col-span-2">
              <Textarea
                className="min-h-64"
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                placeholder={"Pergunta: Qual o horário de atendimento?\nResposta: Segunda a sexta, das 9h às 18h.\n\nPergunta: …"}
                required
              />
            </Field>
          </div>
          {formError && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">{formError}</p>}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={pending}>
              Salvar e indexar
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          const doc = removing;
          setRemoving(null);
          if (doc) run(() => deleteKnowledgeDocumentAction(doc.id));
        }}
        danger
        title="Excluir material"
        description={`"${removing?.title ?? ""}" deixa de ser consultado pelos agentes.`}
        confirmLabel="Excluir"
      />
    </div>
  );
}
