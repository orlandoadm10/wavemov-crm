"use client";

import { updateLeadInfoAction } from "@/app/(dashboard)/negociacoes/[id]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import {
  hasLeadInfo,
  parseLeadInfo,
  serializeLeadAnswers,
} from "@/lib/features/lead-ingestion/domain/lead-answers";
import { Pencil, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * "Informações do Lead" — as respostas que o lead deu no formulário de origem.
 *
 * APRESENTAÇÃO
 * O bloco é desenhado como o lead o respondeu: uma linha por pergunta, com a
 * resposta logo depois dos dois-pontos. A versão anterior quebrava cada par em
 * rótulo acima e valor abaixo, o que dobrava a altura do card e desfazia a
 * leitura corrida que o formulário já tem.
 *
 * O nome da chave da origem (`r_lista`, `r-lista`) nunca aparece: é detalhe de
 * integração, não informação do lead.
 */
export function LeadInfoCard({
  dealId,
  metadata,
  formExternalId = null,
  hasSubmission = false,
  canEdit = false,
  onSaved,
  className,
  compact = false,
}: {
  /** Necessário para editar. Sem ele o card é somente leitura. */
  dealId?: string;
  metadata: unknown;
  /** `forms.external_id` — a referência visual de qual formulário originou. */
  formExternalId?: string | null;
  /**
   * Existe submissão para este lead? É ela que dá onde gravar: `form_id` é
   * obrigatório em `form_submissions`, então lead criado à mão ou vindo do
   * WhatsApp não tem registro para editar.
   */
  hasSubmission?: boolean;
  canEdit?: boolean;
  /**
   * Chamado com o `metadata` gravado. Obrigatório para quem mantém as
   * informações em estado de cliente (o painel do atendimento): lá
   * `router.refresh()` não alcança nada, e sem isto o card seguiria mostrando
   * o valor antigo — e a próxima edição partiria dele, desfazendo esta.
   */
  onSaved?: (metadata: Record<string, unknown>) => void;
  className?: string;
  /** Versão do atendimento: densidade maior, sem moldura de Card. */
  compact?: boolean;
}) {
  const router = useRouter();
  const info = parseLeadInfo(metadata);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  const editavel = canEdit && Boolean(dealId) && hasSubmission;

  // Sem respostas, o card só existe para quem pode escrever nele. Lead criado à
  // mão ou vindo do WhatsApp não tem submissão e não deixa bloco vazio na tela.
  if (!hasLeadInfo(info) && !editing && !editavel) return null;

  function abrirEdicao() {
    setDraft(serializeLeadAnswers(info.answers));
    setMessage(null);
    setEditing(true);
  }

  function salvar() {
    if (!dealId) return;
    setMessage(null);
    startSaving(async () => {
      const result = await updateLeadInfoAction(dealId, draft);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
        return;
      }
      setEditing(false);
      setMessage({ type: "ok", text: result.success ?? "Informações atualizadas." });
      if (result.metadata) onSaved?.(result.metadata);
      // Atualiza quem recebe as informações como prop de Server Component
      // (o detalhe do lead). Inofensivo para o atendimento, que usa `onSaved`.
      router.refresh();
    });
  }

  const corpo = editing ? (
    <div className="space-y-3">
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={Math.min(Math.max(info.answers.length + 2, 6), 18)}
        className="font-mono text-xs leading-relaxed"
        aria-label="Informações do lead"
        autoFocus
      />
      <p className="text-xs text-ink-faint">
        Uma linha por informação, no formato <code className="rounded bg-muted px-1">pergunta: resposta</code>.
        Toda alteração fica registrada no histórico do lead.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={salvar} loading={saving}>
          Salvar
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  ) : info.answers.length > 0 ? (
    <dl className="rounded-xl bg-muted/50 px-4 py-3 ring-1 ring-line">
      {info.answers.map((answer, index) => (
        <div key={`${answer.question}-${index}`} className="flex flex-wrap gap-x-2 py-0.5 text-sm">
          {answer.question && <dt className="text-ink-soft">{answer.question}:</dt>}
          <dd className="min-w-0 font-medium break-words text-ink">{answer.answer}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-ink-faint ring-1 ring-line">
      Nenhuma informação registrada para este lead.
    </p>
  );

  const aviso = message && (
    <p
      role={message.type === "error" ? "alert" : undefined}
      className={
        message.type === "ok"
          ? "mt-3 rounded-lg bg-success/10 px-3 py-2 text-xs text-success-text"
          : "mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive-text"
      }
    >
      {message.text}
    </p>
  );

  const lapis = editavel && !editing && (
    <button
      onClick={abrirEdicao}
      className="-m-1 flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-muted hover:text-primary-700"
      aria-label="Editar informações do lead"
    >
      <Pencil className="h-4 w-4" />
    </button>
  );

  if (compact) {
    return (
      <section className={className} aria-label="Informações do Lead">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <User className="h-3.5 w-3.5 text-ink-faint" />
            Informações do Lead
          </h3>
          {lapis}
        </div>
        {corpo}
        {aviso}
        <LeadInfoExtras info={info} formExternalId={formExternalId} compact />
      </section>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary-600" />
              Informações do Lead
            </span>
          }
          action={lapis}
        />
        <div className="px-5 py-4">
          {corpo}
          {aviso}
        </div>
      </Card>
      <LeadInfoExtras info={info} formExternalId={formExternalId} />
    </>
  );
}

/**
 * Card separado com o que NÃO é resposta do lead: UTM e o formulário de origem.
 *
 * Fica fora do card principal de propósito — são dados de campanha e de
 * integração, úteis para conferir de onde veio, mas nada que o atendente
 * precise ler antes de responder. Misturá-los às respostas competiria com a
 * informação que importa.
 */
function LeadInfoExtras({
  info,
  formExternalId,
  compact = false,
}: {
  info: ReturnType<typeof parseLeadInfo>;
  formExternalId: string | null;
  compact?: boolean;
}) {
  const linhas = [
    ...info.extras,
    // O id do FORMULÁRIO, não o da resposta: é o valor que o operador colou no
    // n8n e reconhece de imediato. O id da resposta é um token opaco.
    ...(formExternalId ? [{ question: "Formulário", answer: formExternalId }] : []),
  ];

  if (linhas.length === 0) return null;

  const corpo = (
    <dl className="space-y-2.5">
      {linhas.map((linha, index) => (
        <div key={`${linha.question}-${index}`} className="flex items-start justify-between gap-4">
          <dt className="shrink-0 text-xs text-ink-faint">{linha.question}</dt>
          <dd className="min-w-0 text-right text-xs font-semibold break-all text-ink">
            {linha.answer}
          </dd>
        </div>
      ))}
    </dl>
  );

  if (compact) return <div className="mt-3 border-t border-line pt-3">{corpo}</div>;

  return <Card className="mt-4 px-5 py-4">{corpo}</Card>;
}
