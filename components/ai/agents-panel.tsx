"use client";

import { deleteAgentAction } from "@/app/(dashboard)/ia/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/modal";
import type { AiAgent } from "@/types";
import { Bot, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AgentFormModal } from "./agent-form-modal";

export function AgentsPanel({ agents, defaultModel }: { agents: AiAgent[]; defaultModel: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AiAgent | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<AiAgent | null>(null);
  const [feedback, setFeedback] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmRemove() {
    if (!removing) return;
    startTransition(async () => {
      const result = await deleteAgentAction(removing.id);
      setFeedback(result);
      setRemoving(null);
      if (!result.error) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          O agente <strong>padrão</strong> e <strong>ativo</strong> assume as conversas novas. A equipe pode
          assumir ou devolver qualquer conversa pela tela de atendimento.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Criar agente
        </Button>
      </div>

      {feedback?.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">{feedback.error}</p>
      )}
      {feedback?.success && (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success-text">{feedback.success}</p>
      )}

      {agents.length === 0 ? (
        <EmptyState
          icon={<Bot className="h-6 w-6" />}
          title="Nenhum agente de IA"
          description="Crie um agente, escreva como ele deve atender e escolha o que ele pode fazer no CRM."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Criar agente
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="flex flex-col p-5 transition-shadow hover:shadow-lift">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 dark:bg-violet-400/15 text-violet-700 dark:text-violet-200">
                    <Bot className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{agent.name}</p>
                    <p className="truncate text-xs text-ink-faint">{agent.model}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={agent.is_active ? "green" : "slate"} dot>
                    {agent.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                  {agent.is_default && <Badge tone="blue">Padrão</Badge>}
                </div>
              </div>
              {agent.description && <p className="mt-3 line-clamp-2 text-sm text-ink-soft">{agent.description}</p>}
              <ul className="mt-3 space-y-1 text-xs text-ink-faint">
                <li>{agent.enabled_tools.length} ferramenta(s) do CRM liberada(s)</li>
                <li>{agent.use_knowledge_base ? "Consulta a base de conhecimento" : "Sem base de conhecimento"}</li>
                <li>
                  {agent.auto_reply_new_conversations ? "Assume conversas novas" : "Só atende quando a equipe passar a conversa"}
                </li>
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3">
                <Button variant="outline" size="sm" onClick={() => setEditing(agent)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRemoving(agent)} className="hover:bg-destructive/10 hover:text-destructive-text">
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AgentFormModal
        open={creating || editing !== null}
        agent={editing}
        defaultModel={defaultModel}
        isFirstAgent={agents.length === 0}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={(message) => {
          setFeedback({ success: message });
          setCreating(false);
          setEditing(null);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        loading={pending}
        danger
        title="Excluir agente"
        description={`"${removing?.name ?? ""}" deixará de responder. As conversas que ele atendia continuam, mas passam a depender da equipe ou de outro agente.`}
        confirmLabel="Excluir"
      />
    </div>
  );
}
