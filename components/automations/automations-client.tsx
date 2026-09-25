"use client";

import { deleteRuleAction, toggleRuleAction } from "@/app/(dashboard)/automacoes/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { DataTable } from "@/components/ui/table";
import { ACTION_LABELS, TRIGGER_LABELS, type ActionType, type TriggerEvent } from "@/lib/features/automations/domain/rules";
import { formatDateTime } from "@/lib/utils";
import type { AutomationRule, AutomationRun } from "@/types";
import { History, Pencil, Plus, Trash2, Workflow } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RuleFormModal } from "./rule-form-modal";

export interface AutomationOptions {
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  members: { id: string; name: string }[];
  tags: { id: string; name: string }[];
}

export type AutomationRunRow = AutomationRun & {
  rule: { name: string } | null;
  deal: { id: string; title: string } | null;
};

const RUN_STATUS: Record<AutomationRun["status"], { tone: "green" | "amber" | "red" | "slate"; label: string }> = {
  success: { tone: "green", label: "Executada" },
  partial: { tone: "amber", label: "Parcial" },
  failed: { tone: "red", label: "Falhou" },
  skipped: { tone: "slate", label: "Sem efeito" },
};

export function AutomationsClient({
  rules,
  runs,
  options,
}: {
  rules: AutomationRule[];
  runs: AutomationRunRow[];
  options: AutomationOptions;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<AutomationRule | null>(null);
  const [feedback, setFeedback] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string; success?: string }>) {
    startTransition(async () => {
      const result = await action();
      setFeedback(result);
      if (!result.error) router.refresh();
    });
  }

  const stageName = (id: unknown) =>
    options.pipelines.flatMap((p) => p.stages).find((s) => s.id === id)?.name ?? null;

  function triggerSummary(rule: AutomationRule) {
    const base = TRIGGER_LABELS[rule.trigger_event as TriggerEvent] ?? rule.trigger_event;
    const cfg = rule.trigger_config;
    if (rule.trigger_event === "conversation.no_reply") {
      return `${base}: ${cfg.hours ?? 24}h sem resposta (passo ${cfg.step ?? 1})`;
    }
    const stage = stageName(cfg.stage_id);
    const parts = [base, stage ? `→ ${stage}` : null, cfg.delay_minutes ? `após ${cfg.delay_minutes} min` : null];
    return parts.filter(Boolean).join(" ");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          Ex.: lead entrou em <em>Proposta</em> → enviar WhatsApp e criar tarefa; lead sem responder há 24h → follow-up.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Criar automação
        </Button>
      </div>

      {feedback?.error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive-text">{feedback.error}</p>}
      {feedback?.success && (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success-text">{feedback.success}</p>
      )}

      {rules.length === 0 ? (
        <EmptyState
          icon={<Workflow className="h-6 w-6" />}
          title="Nenhuma automação"
          description="Crie regras que reagem a mudanças de etapa, leads novos, mensagens recebidas e leads que pararam de responder."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Criar automação
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rules.map((rule) => (
            <Card key={rule.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{rule.name}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">{triggerSummary(rule)}</p>
                </div>
                <Switch
                  checked={rule.is_active}
                  disabled={pending}
                  onChange={(v) => run(() => toggleRuleAction(rule.id, v))}
                  label={rule.is_active ? "Ativa" : "Pausada"}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {rule.conditions.length > 0 && <Badge tone="violet">{rule.conditions.length} condição(ões)</Badge>}
                {rule.actions.map((action, i) => (
                  <Badge key={i} tone="blue">
                    {ACTION_LABELS[action.type as ActionType] ?? action.type}
                  </Badge>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                <p className="text-xs text-ink-faint">
                  {rule.run_count} execução(ões){rule.last_run_at ? ` · última ${formatDateTime(rule.last_run_at)}` : ""}
                </p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(rule)}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:bg-destructive/10 hover:text-destructive-text"
                    onClick={() => setRemoving(rule)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Excluir</span>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <section>
        <h2 className="font-sans mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <History className="h-4 w-4 text-ink-faint" /> Últimas execuções
        </h2>
        {runs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-card/60 px-6 py-8 text-center text-sm text-ink-faint">
            As execuções aparecem aqui assim que uma automação disparar.
          </p>
        ) : (
          <DataTable>
            <thead className="bg-muted/50 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
              <tr>
                <th className="px-5 py-3.5">Quando</th>
                <th className="px-5 py-3.5">Automação</th>
                <th className="px-5 py-3.5">Lead</th>
                <th className="px-5 py-3.5">Resultado</th>
                <th className="px-5 py-3.5">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((r) => (
                <tr key={r.id} className="align-top transition-colors hover:bg-primary-50/40">
                  <td className="px-5 py-3.5 whitespace-nowrap text-ink-soft">{formatDateTime(r.created_at)}</td>
                  <td className="px-5 py-3.5 text-ink">{r.rule?.name ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    {r.deal ? (
                      <Link href={`/negociacoes/${r.deal.id}`} className="text-primary-600 hover:text-primary-700">
                        {r.deal.title}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={RUN_STATUS[r.status].tone} dot>
                      {RUN_STATUS[r.status].label}
                    </Badge>
                  </td>
                  <td className="max-w-sm px-5 py-3.5 text-xs text-ink-soft">
                    {(r.results ?? []).map((res, i) => (
                      <p key={i} className={res.status === "failed" ? "text-destructive-text" : undefined}>
                        {ACTION_LABELS[res.type as ActionType] ?? res.type}: {res.status === "success" ? "ok" : res.error ?? res.status}
                      </p>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      <RuleFormModal
        open={creating || editing !== null}
        rule={editing}
        options={options}
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
        onConfirm={() => {
          const rule = removing;
          setRemoving(null);
          if (rule) run(() => deleteRuleAction(rule.id));
        }}
        danger
        title="Excluir automação"
        description={`"${removing?.name ?? ""}" para de executar. O histórico de execuções também é removido.`}
        confirmLabel="Excluir"
      />
    </div>
  );
}
