"use client";

import { LeadInfoCard } from "@/components/crm/lead-info-card";
import { Skeleton } from "@/components/ui/skeleton";
import { hasLeadInfo, parseLeadInfo } from "@/lib/features/lead-ingestion/domain/lead-answers";
import { loadLeadInfo } from "@/lib/features/lead-ingestion/infrastructure/lead-info-query";
import { useEffect, useState } from "react";

/**
 * "Informações do Lead" na tela de atendimento.
 *
 * Carrega sob demanda, para o lead da conversa aberta. A alternativa —
 * trazer o `metadata` de todos os leads junto com a lista de conversas —
 * engordaria o payload inicial de `/atendimento` proporcionalmente ao número
 * de conversas, para exibir uma de cada vez.
 *
 * O chamador deve passar `key={dealId}`: sem isso, trocar de conversa
 * reaproveitaria o estado e mostraria por um instante as respostas do lead
 * anterior — o tipo de vazamento de contexto que faz o atendente responder a
 * pessoa errada.
 */
export function LeadInfoPanel({
  dealId,
  canEdit,
}: {
  dealId: string;
  /** viewer é somente leitura: vê as informações, mas não as edita. */
  canEdit: boolean;
}) {
  const [metadata, setMetadata] = useState<unknown>(null);
  const [formExternalId, setFormExternalId] = useState<string | null>(null);
  const [hasSubmission, setHasSubmission] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    loadLeadInfo(dealId).then((result) => {
      // A conversa pode ter mudado enquanto a consulta voltava.
      if (!active) return;
      setMetadata(result.metadata);
      setFormExternalId(result.formExternalId);
      setHasSubmission(result.hasSubmission);
      setError(result.error);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [dealId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-line bg-white p-4 shadow-(--shadow-card)">
        <Skeleton className="mb-3 h-3.5 w-32" />
        <Skeleton className="mb-2 h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-line bg-white p-4 shadow-(--shadow-card)">
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      </div>
    );
  }

  // Sem respostas não há card: lead criado à mão ou vindo do WhatsApp não
  // deve deixar um bloco vazio ocupando a coluna. A checagem é sobre os DADOS,
  // não sobre o elemento: `<LeadInfoCard/>` é sempre um objeto verdadeiro,
  // mesmo quando o componente decide renderizar `null` lá dentro.
  const podeEditar = canEdit && hasSubmission;
  if (!hasLeadInfo(parseLeadInfo(metadata)) && !podeEditar) return null;

  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-(--shadow-card)">
      <LeadInfoCard
        dealId={dealId}
        metadata={metadata}
        formExternalId={formExternalId}
        hasSubmission={hasSubmission}
        canEdit={canEdit}
        onSaved={setMetadata}
        compact
      />
    </div>
  );
}
