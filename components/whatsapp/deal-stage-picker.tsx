"use client";

import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { describeWriteError, firstOpenStage } from "@/lib/utils";
import type { Deal, Pipeline, PipelineStage } from "@/types";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Props {
  deal: Deal;
  pipelines: Pipeline[];
  organizationId: string;
  profileId: string;
  conversationId: string;
  canManage: boolean;
  /**
   * Recebe a falha de uma gravação que terminou depois do desmonte (troca de
   * conversa em cima da escolha). O componente já não existe para mostrá-la, e
   * escrita que falha calada é o pior defeito possível nesta tela.
   */
  onDetachedError: (dealTitle: string, message: string) => void;
}

interface Target {
  pipeline_id: string;
  stage_id: string;
}

/**
 * Move o lead de funil e de etapa sem tirar o vendedor da conversa.
 *
 * Monte sempre com `key={deal.id}`: o estado (alvo pendente, mensagem,
 * temporizador) é por lead, e a remontagem ao trocar de conversa impede que a
 * confirmação de um atendimento apareça em cima de outro.
 *
 * Só lista etapas abertas. Ganhar e perder continuam sendo ato deliberado em
 * `/negociacoes/[id]`, onde há confirmação e motivo de perda — por isso este
 * componente nunca toca em `status`, `won_at`, `lost_at` ou `lost_reason_id`.
 */
export function DealStagePicker({
  deal,
  pipelines,
  organizationId,
  profileId,
  conversationId,
  canManage,
  onDetachedError,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // Alvo escolhido que ainda não voltou do servidor. Enquanto existe, é ele
  // que os selects mostram; some sozinho quando o dado do servidor alcança.
  const [target, setTarget] = useState<Target | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const openStagesOf = useCallback(
    (pipelineId: string): PipelineStage[] =>
      (pipelines.find((p) => p.id === pipelineId)?.stages ?? [])
        .filter((s) => !s.is_won_stage && !s.is_lost_stage)
        .sort((a, b) => a.order_index - b.order_index),
    [pipelines]
  );

  const current: Target = target ?? { pipeline_id: deal.pipeline_id, stage_id: deal.stage_id };

  const stageOptions = useMemo(() => {
    const abertas = openStagesOf(current.pipeline_id);
    // Lead parado numa etapa de fechamento continua precisando de um valor
    // válido no select — sem isto o controle renderizaria vazio.
    const atual = (pipelines.find((p) => p.id === current.pipeline_id)?.stages ?? []).find(
      (s) => s.id === current.stage_id
    );
    return atual && !abertas.some((s) => s.id === atual.id) ? [atual, ...abertas] : abertas;
  }, [openStagesOf, pipelines, current.pipeline_id, current.stage_id]);

  const commit = useCallback(
    async (next: Target) => {
      const stage = (pipelines.find((p) => p.id === next.pipeline_id)?.stages ?? []).find(
        (s) => s.id === next.stage_id
      );
      const pipeline = pipelines.find((p) => p.id === next.pipeline_id);
      if (!stage || !pipeline) return;

      const previous: Target = { pipeline_id: deal.pipeline_id, stage_id: deal.stage_id };
      const trocouDeFunil = next.pipeline_id !== previous.pipeline_id;

      setSaving(true);
      setError(null);
      setDone(null);

      // Funil e etapa num único update: gravar só o funil deixa o lead numa
      // etapa que não pertence a ele e ele some dos dois Kanbans.
      //
      // O `.select()` não é enfeite: quando a linha não passa pelo USING da
      // policy (o lead foi transferido para outro responsável enquanto esta
      // aba estava aberta), o PostgREST responde 204 sem erro e zero linhas.
      // Sem conferir a linha afetada, a tela anunciaria "sucesso" e a trilha
      // registraria uma movimentação que nunca aconteceu.
      const { data: updated, error: err } = await supabase
        .from("deals")
        .update({ pipeline_id: next.pipeline_id, stage_id: next.stage_id })
        .eq("id", deal.id)
        .eq("organization_id", organizationId)
        .select("id");

      setSaving(false);

      const recusado = !err && (updated ?? []).length === 0;

      if (err || recusado) {
        setTarget(null); // volta ao objeto do servidor, inteiro
        const mensagem = recusado
          ? "Este lead não está mais sob sua responsabilidade. Atualize a página."
          : describeWriteError(err, "Não foi possível mover o lead. Tente novamente.");
        if (recusado) console.error("Update de deals sem linha afetada", { dealId: deal.id });
        // Desmontado = a gravação era a do flush; quem mostra o erro é o pai.
        if (mounted.current) setError(mensagem);
        else onDetachedErrorRef.current(deal.title, mensagem);
        return;
      }

      setDone(
        trocouDeFunil
          ? `Movido para ${pipeline.name} · ${stage.name}.`
          : `Etapa alterada para ${stage.name}.`
      );

      // Trilha de auditoria: o trabalho do vendedor já está gravado, então
      // falha aqui vira log de console e não trava a tela.
      const [hist, log] = await Promise.all([
        supabase.from("deal_stage_history").insert({
          deal_id: deal.id,
          from_stage_id: previous.stage_id,
          to_stage_id: next.stage_id,
          changed_by: profileId,
        }),
        supabase.from("activity_logs").insert({
          organization_id: organizationId,
          actor_id: profileId,
          deal_id: deal.id,
          type: "stage_changed",
          title: trocouDeFunil
            ? `Movido para o funil "${pipeline.name}" — etapa "${stage.name}" (atendimento)`
            : `Etapa alterada para "${stage.name}" (atendimento)`,
          metadata: {
            origem: "atendimento",
            conversation_id: conversationId,
            from_pipeline_id: previous.pipeline_id,
            to_pipeline_id: next.pipeline_id,
          },
        }),
      ]);
      if (hist.error) console.error("Falha ao gravar deal_stage_history", hist.error);
      if (log.error) console.error("Falha ao gravar activity_logs", log.error);

      router.refresh();
    },
    [
      supabase,
      router,
      deal.id,
      deal.title,
      deal.pipeline_id,
      deal.stage_id,
      organizationId,
      profileId,
      conversationId,
      pipelines,
    ]
  );

  // O temporizador junta a rajada de `change` que o teclado dispara ao
  // percorrer um select fechado: uma escrita só, no valor em que o usuário
  // parou. `commitRef` mantém o flush do desmonte livre de closure velha.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Target | null>(null);
  const commitRef = useRef(commit);
  const mounted = useRef(true);
  const onDetachedErrorRef = useRef(onDetachedError);
  useEffect(() => {
    commitRef.current = commit;
    onDetachedErrorRef.current = onDetachedError;
  }, [commit, onDetachedError]);

  useEffect(
    () => () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      // Trocar de conversa no meio da rajada não pode engolir a movimentação:
      // o alvo é gravado no desmonte, contra o lead que já estava capturado.
      // Se essa gravação falhar, o erro sobe para o pai por `onDetachedError`.
      if (pendingRef.current) void commitRef.current(pendingRef.current);
    },
    []
  );

  // Outro usuário pode ganhar/perder o lead dentro da janela do temporizador:
  // um `router.refresh()` traz `status` fechado, o componente re-renderiza em
  // modo leitura mas NÃO desmonta. Sem isto o temporizador ainda dispararia e
  // gravaria uma etapa aberta num lead fechado.
  useEffect(() => {
    if (deal.status !== "open" && timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      pendingRef.current = null;
    }
  }, [deal.status]);

  function schedule(next: Target) {
    setError(null);
    setDone(null);
    if (timer.current) clearTimeout(timer.current);

    // Voltou ao que já está gravado: cancela em vez de gravar um "movimento"
    // de A para A, que sujaria a trilha do lead sem mover nada.
    if (next.pipeline_id === deal.pipeline_id && next.stage_id === deal.stage_id) {
      timer.current = null;
      pendingRef.current = null;
      setTarget(null);
      return;
    }

    setTarget(next);
    pendingRef.current = next;
    timer.current = setTimeout(() => {
      pendingRef.current = null;
      void commit(next);
    }, 400);
  }

  // O alvo cumpriu o papel quando o servidor devolve o lead já movido.
  useEffect(() => {
    if (target && deal.pipeline_id === target.pipeline_id && deal.stage_id === target.stage_id) {
      setTarget(null);
    }
  }, [deal.pipeline_id, deal.stage_id, target]);

  function changePipeline(pipelineId: string) {
    if (pipelineId === current.pipeline_id) return;

    // Desfazer a escolha antes de gravar devolve o lead à posição real, não à
    // primeira etapa: quem explora o dropdown e volta ao funil de origem não
    // pode perder a etapa em que o lead estava.
    if (pipelineId === deal.pipeline_id) {
      schedule({ pipeline_id: deal.pipeline_id, stage_id: deal.stage_id });
      return;
    }

    // Reposiciona a etapa em vez de limpá-la: `deals.stage_id` é obrigatório.
    const primeira = firstOpenStage(pipelines.find((p) => p.id === pipelineId)?.stages);
    if (!primeira) {
      setError(`O funil "${pipelines.find((p) => p.id === pipelineId)?.name}" não tem etapa aberta.`);
      return;
    }
    schedule({ pipeline_id: pipelineId, stage_id: primeira.id });
  }

  const pipelineName = pipelines.find((p) => p.id === current.pipeline_id)?.name ?? "—";
  const stageName =
    (pipelines.find((p) => p.id === current.pipeline_id)?.stages ?? []).find(
      (s) => s.id === current.stage_id
    )?.name ?? "—";

  // Sem funis carregados (falha na consulta da página) os selects sairiam
  // vazios e mudos. Diga o que aconteceu em vez de oferecer um controle morto.
  if (pipelines.length === 0) {
    return (
      <p className="mt-3 border-t border-line pt-3 text-xs text-ink-faint">
        Não foi possível carregar os funis. Recarregue a página para mover este lead.
      </p>
    );
  }

  // Somente leitura: viewer, e lead já fechado (ganho/perdido/arquivado), que
  // só volta a se mover depois de reaberto no detalhe da negociação.
  const fechado = deal.status !== "open";
  if (!canManage || fechado) {
    return (
      <div className="mt-3 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="slate">{pipelineName}</Badge>
          <Badge tone="blue">{stageName}</Badge>
        </div>
        {fechado && canManage && (
          <p className="mt-2 text-xs text-ink-faint">
            Negociação {deal.status === "won" ? "ganha" : deal.status === "lost" ? "perdida" : "arquivada"}.{" "}
            <Link href={`/negociacoes/${deal.id}`} className="font-medium text-primary-700 hover:underline">
              Reabra no detalhe
            </Link>{" "}
            para movimentá-la.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3" aria-busy={saving}>
      <div className="flex items-center gap-2">
        <label htmlFor={`funil-${deal.id}`} className="w-11 shrink-0 text-xs text-ink-faint">
          Funil
        </label>
        <Select
          id={`funil-${deal.id}`}
          className="text-xs"
          value={current.pipeline_id}
          disabled={saving}
          onChange={(e) => changePipeline(e.target.value)}
        >
          {pipelines.map((p) => {
            const semEtapa = !firstOpenStage(p.stages) && p.id !== current.pipeline_id;
            return (
              <option key={p.id} value={p.id} disabled={semEtapa}>
                {p.name}
                {semEtapa ? " (sem etapa aberta)" : ""}
              </option>
            );
          })}
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor={`etapa-${deal.id}`} className="w-11 shrink-0 text-xs text-ink-faint">
          Etapa
        </label>
        <Select
          id={`etapa-${deal.id}`}
          className="text-xs"
          value={current.stage_id}
          disabled={saving}
          onChange={(e) => schedule({ pipeline_id: current.pipeline_id, stage_id: e.target.value })}
        >
          {stageOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      {/* A região viva fica sempre montada: leitor de tela costuma ignorar um
          role="status" inserido no mesmo ciclo em que o texto aparece. */}
      <p role="status" className="min-h-4 text-xs text-ink-faint">
        {saving ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Salvando…
          </span>
        ) : done ? (
          <span className="text-emerald-700">{done}</span>
        ) : null}
      </p>
      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
