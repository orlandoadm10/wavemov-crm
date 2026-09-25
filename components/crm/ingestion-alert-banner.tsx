// ============================================================
// Banner de canal em silêncio.
//
// Este componente existe por causa de uma lição específica: o webhook do
// WhatsApp ficou cinco dias devolvendo 401 e a descoberta veio do cliente
// reclamando. O painel de `/atendimento/configuracoes` sozinho não teria
// evitado isso — ninguém abre a tela de configurações sem já suspeitar de
// alguma coisa. O sinal precisa ser EMPURRADO, e por isso ele aparece em
// `/dashboard` e `/atendimento`, onde a equipe já está.
//
// Ele só é desenhado quando há canal em silêncio (`alerts`). Canal nunca
// configurado, empresa em implantação e canal abandonado há meses não passam
// por aqui — alarme falso ensina a equipe a ignorar o alarme, e aí o produto
// fica pior do que se não tivesse nenhum.
//
// Server Component: sem estado, sem evento, sem "dispensar". Um banner que se
// deixa fechar some no primeiro clique e nunca mais aparece; este só some
// quando o canal volta a receber — que é a única coisa que deve fazê-lo sumir.
// ============================================================
import {
  alertingChannels,
  CHANNEL_LABELS,
  formatSilence,
  type ChannelHealth,
} from "@/lib/features/lead-ingestion/domain/ingestion-health";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

export function IngestionAlertBanner({
  healths,
  canFix,
}: {
  healths: ChannelHealth[];
  /** `viewer` vê o mesmo aviso, sem atalho: ele não tem o que consertar. */
  canFix: boolean;
}) {
  const alertando = alertingChannels(healths);
  if (alertando.length === 0) return null;

  // O mais grave manda no tom do banner. Dois canais em silêncio com gravidades
  // diferentes não podem virar dois banners: o segundo é lido como repetição e
  // some da atenção.
  const grave = alertando.some((h) => h.tone === "red");
  const nomes = alertando.map(
    (h) => `${CHANNEL_LABELS[h.channel]} (${formatSilence(h.hoursSince ?? 0)})`
  );

  return (
    <div
      role="status"
      className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-3 text-sm ${
        grave ? "bg-destructive/10 text-destructive-text" : "bg-warning/10 text-warning-text"
      }`}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        {/* Ausência, nunca falha: o dado não distingue integração quebrada de
            semana fraca, e a tela não pode afirmar o que ele não sustenta. */}
        <b>Sem entrada de leads</b> em {nomes.join(" e ")}.{" "}
        {canFix ? (
          <>
            Confira o canal em{" "}
            <Link
              href={
                alertando[0].channel === "whatsapp"
                  ? "/atendimento/configuracoes"
                  : "/formularios"
              }
              className="font-semibold underline underline-offset-2"
            >
              {alertando[0].channel === "whatsapp" ? "Conexão WhatsApp" : "Formulários"}
            </Link>
            .
          </>
        ) : (
          <>Avise um administrador da empresa.</>
        )}
      </span>
    </div>
  );
}
