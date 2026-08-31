// ============================================================
// Painel "Recebimento" — os três canais de entrada de lead, com semáforo.
//
// Fica onde o problema se CONSERTA (`/atendimento/configuracoes`). Quem
// descobre que algo parou é o banner, que fica onde as pessoas já estão — ver
// `components/crm/ingestion-alert-banner.tsx`. Os dois são necessários:
// ninguém abre a tela de configurações sem já suspeitar de alguma coisa, e foi
// exatamente por isso que o incidente de 26/08/2026 durou cinco dias.
//
// Server Component: só leitura, sem estado e sem evento.
// ============================================================
import { HealthRow } from "@/components/crm/health-row";
import { Card, CardHeader } from "@/components/ui/card";
import {
  CHANNEL_LABELS,
  describeChannel,
  formatSilence,
  type ChannelHealth,
} from "@/lib/features/lead-ingestion/domain/ingestion-health";
import { APP_TIME_ZONE } from "@/lib/utils/period";
import { Antenna, FileText, MessageCircle, Workflow } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const CHANNEL_ICONS: Record<string, ReactNode> = {
  whatsapp: <MessageCircle className="h-4 w-4" />,
  external_ingest: <Workflow className="h-4 w-4" />,
  public_form: <FileText className="h-4 w-4" />,
};

/**
 * O valor curto do `Badge`, à direita da linha.
 *
 * Deliberadamente NÃO diz "OK" nem "Falha". Diz o tempo, que é o único fato
 * disponível: o indicador não sabe distinguir integração quebrada de semana
 * fraca, e um rótulo de diagnóstico afirmaria o que o dado não sustenta.
 */
function badgeValue(health: ChannelHealth): string {
  switch (health.status) {
    case "not_configured":
      return "Não configurado";
    case "never_received":
      return "Aguardando";
    case "dormant":
      return "Sem uso";
    case "unknown":
      return "Sem apuração";
    default:
      return formatSilence(health.hoursSince ?? 0);
  }
}

/**
 * Data absoluta ao lado do relativo. "há 4 dias" é o que faz agir; a data
 * exata é o que permite cruzar com o log do provedor depois — e ela vive em
 * `America/Sao_Paulo`, nunca no fuso do processo (em produção o Node roda em
 * UTC).
 */
function formatAbsolute(date: Date | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function IngestionHealthPanel({
  healths,
  canFix,
}: {
  healths: ChannelHealth[];
  /**
   * `org_admin`/admin global veem o atalho de conserto. `viewer` vê o mesmo
   * indicador sem CTA: ele não tem o que fazer com o botão, e a URL do webhook
   * carrega o segredo da instância.
   */
  canFix: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Antenna className="h-4 w-4 text-primary-500" />
            Recebimento
          </span>
        }
        subtitle="Quando cada canal de entrada recebeu um lead pela última vez"
      />
      <ul className="divide-y divide-line">
        {healths.map((health) => {
          const absolute = formatAbsolute(health.lastReceivedAt);
          return (
            <HealthRow
              key={health.channel}
              icon={CHANNEL_ICONS[health.channel]}
              title={CHANNEL_LABELS[health.channel]}
              description={absolute ? `${describeChannel(health)} — ${absolute}` : describeChannel(health)}
              tone={health.tone}
              value={badgeValue(health)}
              action={health.alerts && canFix ? <FixHint channel={health.channel} /> : undefined}
            />
          );
        })}
      </ul>
      <p className="border-t border-line px-5 py-3 text-xs text-ink-faint">
        O indicador mostra <b>ausência de entrada</b>, não falha da integração. Um
        canal quieto pode ser uma semana fraca — confira a origem antes de concluir.
      </p>
    </Card>
  );
}

/**
 * O que fazer a respeito. Curto e específico por canal: um "verifique as
 * configurações" genérico devolve a pessoa ao mesmo beco em que ela já estava.
 */
function FixHint({ channel }: { channel: ChannelHealth["channel"] }) {
  if (channel === "whatsapp") {
    return (
      <p className="mt-1 text-xs text-ink-soft">
        Confirme se a URL do webhook abaixo é a mesma cadastrada no painel da UAZAPI.
      </p>
    );
  }
  return (
    <p className="mt-1 text-xs text-ink-soft">
      Confira os formulários e a credencial em{" "}
      <Link href="/formularios" className="font-medium text-primary-700 hover:underline">
        Formulários
      </Link>
      .
    </p>
  );
}
