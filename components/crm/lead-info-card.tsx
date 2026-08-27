import { Card, CardHeader } from "@/components/ui/card";
import {
  hasLeadInfo,
  parseLeadInfo,
  type LeadAnswer,
} from "@/lib/features/lead-ingestion/domain/lead-answers";
import { ClipboardList } from "lucide-react";

/**
 * "Informações do Lead" — as respostas que o lead deu no formulário de origem
 * (Typeform, Meta Lead Ads) antes de virar uma conversa.
 *
 * É a primeira coisa que o atendente precisa ler para responder com contexto,
 * então aparece nas duas telas em que ele trabalha: o detalhe do lead e o
 * atendimento. A leitura do `metadata` mora em `parseLeadInfo`; aqui só se
 * decide como desenhar.
 *
 * Não renderiza nada quando não há o que mostrar — lead criado à mão ou pela
 * página pública não ganha um card vazio.
 */
export function LeadInfoCard({
  metadata,
  className,
  compact = false,
}: {
  metadata: unknown;
  className?: string;
  /** Versão do atendimento: densidade maior, sem moldura de Card. */
  compact?: boolean;
}) {
  const info = parseLeadInfo(metadata);
  if (!hasLeadInfo(info)) return null;

  const body = (
    <div className={compact ? "space-y-3" : "space-y-4 px-5 py-4"}>
      {info.answers.length > 0 && (
        <dl className="space-y-2.5">
          {info.answers.map((answer, index) => (
            <AnswerRow key={`${answer.question}-${index}`} answer={answer} />
          ))}
        </dl>
      )}

      {info.extras.length > 0 && (
        <div className={info.answers.length > 0 ? "border-t border-line pt-3" : undefined}>
          <dl className="space-y-1.5">
            {info.extras.map((extra, index) => (
              <div key={`${extra.question}-${index}`} className="flex justify-between gap-3">
                <dt className="shrink-0 text-xs text-ink-faint">{extra.question}</dt>
                <dd className="min-w-0 truncate text-right text-xs text-ink-soft" title={extra.answer}>
                  {extra.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );

  if (compact) {
    return (
      <section className={className} aria-label="Informações do Lead">
        <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <ClipboardList className="h-3.5 w-3.5 text-ink-faint" />
          Informações do Lead
        </h3>
        {body}
      </section>
    );
  }

  return (
    <Card className={className}>
      <CardHeader
        title="Informações do Lead"
        subtitle="Respostas enviadas no formulário de origem"
        action={<ClipboardList className="h-4 w-4 text-ink-faint" />}
      />
      {body}
    </Card>
  );
}

/**
 * Pergunta em cima, resposta embaixo.
 *
 * As perguntas do Typeform são frases inteiras ("QUAL O CUSTO DO SEU PLANO DE
 * SAÚDE ATUAL?"), então o par lado a lado usado em Negócio e Contato não serve
 * aqui: a pergunta ocuparia a linha toda e empurraria a resposta para fora.
 *
 * `whitespace-pre-wrap` porque a resposta pode conter quebras que o lead
 * digitou, e elas fazem parte do que ele quis dizer.
 */
function AnswerRow({ answer }: { answer: LeadAnswer }) {
  return (
    <div>
      {answer.question && (
        <dt className="text-xs leading-snug text-ink-faint">{answer.question}</dt>
      )}
      <dd className="mt-0.5 text-sm leading-snug font-medium break-words whitespace-pre-wrap text-ink">
        {answer.answer}
      </dd>
    </div>
  );
}
