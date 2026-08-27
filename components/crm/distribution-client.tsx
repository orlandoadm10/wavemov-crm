"use client";

import {
  createRuleAction,
  deleteRuleAction,
  removeParticipantAction,
  updateRuleAction,
  upsertParticipantAction,
} from "@/app/(dashboard)/distribuicao/actions";
import { DistributionAuditTable, type AuditEntry } from "@/components/crm/distribution-audit-table";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { buildRotationSequence } from "@/lib/features/lead-distribution/domain/rotation";
import { GripVertical, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export interface RuleParticipant {
  id: string;
  profile_id: string;
  weight: number;
  is_active: boolean;
  profile: { id: string; first_name: string | null; last_name: string | null } | null;
}

export interface DistributionRuleRow {
  id: string;
  name: string;
  priority: number;
  is_active: boolean;
  is_fallback: boolean;
  method: string;
  origin: string | null;
  form_id: string | null;
  assignments_count: number;
  participants: RuleParticipant[];
}

export interface EligibleMember {
  id: string;
  name: string;
  role: string;
}

const ORIGIN_LABELS: Record<string, string> = {
  public_form: "Formulário público",
  external_ingest: "Integração (n8n)",
  whatsapp: "WhatsApp",
};

export function DistributionClient({
  rules,
  members,
  forms,
  auditEntries,
  auditPageSize,
}: {
  rules: DistributionRuleRow[];
  members: EligibleMember[];
  forms: { id: string; name: string }[];
  auditEntries: AuditEntry[];
  auditPageSize: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DistributionRuleRow | null>(null);
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("100");
  const [origin, setOrigin] = useState("");
  const [formId, setFormId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<DistributionRuleRow | null>(null);

  function run(acao: () => Promise<{ error?: string; success?: string }>) {
    setMessage(null);
    startSaving(async () => {
      const r = await acao();
      if (r.error) {
        setMessage({ type: "error", text: r.error });
        return;
      }
      setMessage({ type: "ok", text: r.success ?? "Pronto." });
      setModalOpen(false);
      setConfirmDelete(null);
      router.refresh();
    });
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setPriority("100");
    setOrigin("");
    setFormId("");
    setIsActive(true);
    setMessage(null);
    setModalOpen(true);
  }

  function openEdit(rule: DistributionRuleRow) {
    setEditing(rule);
    setName(rule.name);
    setPriority(String(rule.priority));
    setOrigin(rule.origin ?? "");
    setFormId(rule.form_id ?? "");
    setIsActive(rule.is_active);
    setMessage(null);
    setModalOpen(true);
  }

  function salvar() {
    const payload = {
      name,
      priority,
      // A regra padrão não aceita condições (o banco recusa) e o formulário
      // nem mostra os campos — mandar nulo explicitamente evita depender do
      // que sobrou no estado da última edição.
      origin: editing?.is_fallback ? null : origin || null,
      formId: editing?.is_fallback ? null : formId || null,
      isActive,
    };
    run(() => (editing ? updateRuleAction(editing.id, payload) : createRuleAction(payload)));
  }

  return (
    <div className="space-y-4">
      {message && (
        <p
          role={message.type === "error" ? "alert" : undefined}
          className={
            message.type === "ok"
              ? "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
              : "rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
          }
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-white p-3 shadow-(--shadow-card)">
        <p className="text-xs leading-relaxed text-ink-soft">
          As regras são avaliadas <b>de cima para baixo</b>; a primeira que casar com o lead
          vence. A <b>regra padrão</b> é sempre a última e recebe tudo que nenhuma outra pegou.
        </p>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nova regra
        </Button>
      </div>

      {rules.map((rule) => (
        <RuleCard
          key={rule.id}
          rule={rule}
          members={members}
          forms={forms}
          busy={saving}
          onEdit={() => openEdit(rule)}
          onDelete={() => setConfirmDelete(rule)}
          onParticipant={(acao) => run(acao)}
        />
      ))}

      <DistributionAuditTable entries={auditEntries} pageSize={auditPageSize} />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar regra" : "Nova regra de distribuição"}
        subtitle={
          editing?.is_fallback
            ? "A regra padrão recebe o que nenhuma outra regra pegou, por isso não tem condições."
            : "Defina quando esta regra vale. Condições em branco significam «qualquer»."
        }
        size="md"
      >
        <div className="space-y-4">
          <Field label="Nome da regra">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Campanha MedSenior"
              aria-label="Nome da regra"
            />
          </Field>

          <Field label="Prioridade (menor é avaliada primeiro)">
            <Input
              type="number"
              min={1}
              max={999}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              disabled={editing?.is_fallback}
              aria-label="Prioridade"
            />
          </Field>

          {!editing?.is_fallback && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Origem do lead">
                <Select value={origin} onChange={(e) => setOrigin(e.target.value)}>
                  <option value="">Qualquer origem</option>
                  {Object.entries(ORIGIN_LABELS).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Formulário">
                <Select value={formId} onChange={(e) => setFormId(e.target.value)}>
                  <option value="">Qualquer formulário</option>
                  {forms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary-600"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Regra ativa
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} loading={saving}>
              {editing ? "Salvar regra" : "Criar regra"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Excluir esta regra?"
        description={`Os leads que casavam com "${confirmDelete?.name}" passam a ser avaliados pelas regras seguintes. O histórico de distribuição dela é preservado.`}
        confirmLabel="Excluir regra"
        onConfirm={() => confirmDelete && run(() => deleteRuleAction(confirmDelete.id))}
      />
    </div>
  );
}

function RuleCard({
  rule,
  members,
  forms,
  busy,
  onEdit,
  onDelete,
  onParticipant,
}: {
  rule: DistributionRuleRow;
  members: EligibleMember[];
  forms: { id: string; name: string }[];
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onParticipant: (acao: () => Promise<{ error?: string; success?: string }>) => void;
}) {
  const [novoParticipante, setNovoParticipante] = useState("");

  const ativos = rule.participants.filter((p) => p.is_active);
  const disponiveis = members.filter((m) => !rule.participants.some((p) => p.profile_id === m.id));
  const formName = forms.find((f) => f.id === rule.form_id)?.name;

  // A sequência é a mesma que o motor monta. Mostrá-la é o que transforma
  // "peso 2" numa promessa verificável em vez de um número abstrato.
  const sequencia = buildRotationSequence(
    ativos.map((p) => ({
      profileId: p.profile_id,
      name: nomeDe(p),
      weight: p.weight,
    }))
  );

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {rule.name}
            {rule.is_fallback && <Badge tone="blue">Padrão</Badge>}
            {!rule.is_active && <Badge tone="slate">Inativa</Badge>}
          </span>
        }
        subtitle={
          rule.is_fallback
            ? "Recebe todo lead que nenhuma outra regra pegou"
            : [
                `Prioridade ${rule.priority}`,
                rule.origin ? ORIGIN_LABELS[rule.origin] : "Qualquer origem",
                formName ?? "Qualquer formulário",
              ].join(" · ")
        }
        action={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
            {!rule.is_fallback && (
              <Button variant="outline" size="icon" onClick={onDelete} disabled={busy} aria-label={`Excluir regra ${rule.name}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        }
      />

      <div className="space-y-3 px-5 py-4">
        {ativos.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            Nenhum participante no rodízio. Enquanto estiver assim, os leads que casarem com esta
            regra <b>entram sem responsável</b> e ficam invisíveis para os vendedores — o registro
            fica na auditoria como <code className="rounded bg-amber-100 px-1">no_candidates</code>.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
            {ativos.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar name={nomeDe(p)} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{nomeDe(p)}</span>
                <label className="flex items-center gap-1.5 text-xs text-ink-faint">
                  Peso
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={p.weight}
                    className="h-8 w-16 text-xs"
                    aria-label={`Peso de ${nomeDe(p)}`}
                    onBlur={(e) => {
                      const peso = Number(e.target.value);
                      if (peso === p.weight) return;
                      onParticipant(() =>
                        upsertParticipantAction({
                          ruleId: rule.id,
                          profileId: p.profile_id,
                          weight: peso,
                        })
                      );
                    }}
                  />
                </label>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={busy}
                  aria-label={`Remover ${nomeDe(p)} do rodízio`}
                  onClick={() =>
                    onParticipant(() => removeParticipantAction(rule.id, p.profile_id))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {disponiveis.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <Field label="Adicionar ao rodízio">
                <Select
                  value={novoParticipante}
                  onChange={(e) => setNovoParticipante(e.target.value)}
                >
                  <option value="">Escolha uma pessoa…</option>
                  {disponiveis.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button
              variant="secondary"
              disabled={!novoParticipante || busy}
              onClick={() => {
                const alvo = novoParticipante;
                setNovoParticipante("");
                onParticipant(() =>
                  upsertParticipantAction({ ruleId: rule.id, profileId: alvo, weight: 1 })
                );
              }}
            >
              <UserPlus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>
        )}

        {sequencia.length > 1 && (
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-line">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
              <GripVertical className="h-3.5 w-3.5 text-ink-faint" />
              Ordem de entrega desta volta
            </p>
            <p className="text-xs leading-relaxed text-ink-faint">
              {sequencia
                .map((id) => nomeDe(ativos.find((p) => p.profile_id === id)))
                .join(" → ")}
            </p>
            <p className="mt-1.5 text-xs text-ink-faint">
              {rule.assignments_count} lead(s) já distribuído(s) por esta regra.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function nomeDe(p: RuleParticipant | undefined): string {
  if (!p?.profile) return "Sem nome";
  return `${p.profile.first_name ?? ""} ${p.profile.last_name ?? ""}`.trim() || "Sem nome";
}
