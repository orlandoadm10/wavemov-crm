// ============================================================
// Saúde da entrada de leads — regra pura, sem banco e sem React.
//
// O CRM tem três entradas (webhook da UAZAPI, `POST /api/ingest/leads` do n8n
// e o formulário público `/f/[slug]`) e nenhuma delas declarava o próprio
// estado em lugar nenhum da interface. Em 26/08/2026 o recebimento do WhatsApp
// parou por cinco dias e a descoberta veio do cliente reclamando.
//
// O QUE ESTE MÓDULO AFIRMA, E O QUE ELE NÃO AFIRMA
//
// Ele afirma **ausência**: "nenhuma mensagem recebida há N dias". Ele NÃO
// afirma falha. O dado disponível não distingue integração quebrada de semana
// fraca, e prometer diagnóstico com esse dado seria mentir na tela. Toda a
// redação da UI depende dessa distinção — ver `describeChannel`.
//
// POR QUE HÁ ESTADOS QUE NÃO ALERTAM
//
// Alarme falso mata o alarme: se o aviso aparecer numa empresa que só teve uma
// semana quieta, a equipe aprende a ignorá-lo e o produto fica pior do que se
// não existisse. Por isso só alerta canal que estava recebendo e parou:
//
//   `not_configured` — nunca houve integração. Não é problema, é estado.
//   `never_received` — configurado, nada chegou ainda. É implantação, não
//                      queda; empresa nova não nasce em vermelho.
//   `dormant`        — parou há tanto tempo que virou decisão, não incidente.
//                      Alertar sobre isso todo dia é ruído permanente.
//
// Só `silent` alerta.
// ============================================================

/** As três entradas de lead do produto. */
export type IngestionChannel = "whatsapp" | "external_ingest" | "public_form";

/** Mesmos tons do `Badge`/`HealthRow` — ver `components/crm/health-row.tsx`. */
export type HealthTone = "green" | "amber" | "red" | "slate";

export type HealthStatus =
  | "not_configured"
  | "never_received"
  | "receiving"
  | "silent"
  | "dormant"
  | "unknown";

export interface ChannelInput {
  /**
   * A leitura falhou (erro do PostgREST, RLS, rede).
   *
   * Existe porque o modo de falha mais perigoso deste indicador é ele mesmo
   * falhar em silêncio: sem esta bandeira, uma consulta que estoura devolve
   * `lastReceivedAt: null`, o canal cai em `never_received` e a tela responde
   * "aguardando a primeira entrada" — falso conforto, que é exatamente o
   * defeito que esta funcionalidade existe para denunciar. `unknown` prefere
   * admitir que não sabe.
   */
  failed?: boolean;
  /**
   * Existe integração configurada? Instância de WhatsApp cadastrada,
   * formulário com `external_id`, formulário público ativo. Sem isso não há
   * o que monitorar.
   */
  configured: boolean;
  /**
   * Quando a última entrada REALMENTE RECEBIDA chegou. `null` = nenhuma.
   *
   * Nunca derive isto de `whatsapp_conversations.last_message_at`: o envio
   * também escreve nessa coluna, e foi exatamente essa contaminação que
   * escondeu o incidente de 26/08 por quatro dias — o CRM continuava
   * respondendo normalmente enquanto nada entrava.
   */
  lastReceivedAt: string | Date | null;
}

export interface ChannelHealth {
  channel: IngestionChannel;
  status: HealthStatus;
  tone: HealthTone;
  /** Horas desde a última entrada; `null` quando nunca houve uma. */
  hoursSince: number | null;
  lastReceivedAt: Date | null;
  /** Só `silent` alerta. É o que decide se o banner aparece. */
  alerts: boolean;
}

const HOUR = 60 * 60 * 1000;

/**
 * Quanto tempo de silêncio deixa de ser normal, por canal.
 *
 * Fixos de propósito nesta versão: limiar configurável por empresa é
 * afinação, e afinar um indicador em que ninguém confia ainda é otimizar
 * antes de medir. Se aparecer evidência de falso positivo, o número muda aqui
 * — num lugar só.
 *
 * WhatsApp é conversa: 48h de silêncio absoluto em horário comercial já é
 * anômalo. n8n e formulário entram em rajada e passam dias legítimos sem nada,
 * por isso a semana.
 */
export const SILENCE_THRESHOLD_HOURS: Record<IngestionChannel, number> = {
  whatsapp: 48,
  external_ingest: 24 * 7,
  public_form: 24 * 7,
};

/**
 * Depois de quanto tempo o silêncio deixa de ser incidente e vira estado.
 *
 * Contado A PARTIR do limiar, não da última entrada. Um canal parado há meses
 * não é uma novidade que mereça alarme diário — é uma decisão que alguém
 * tomou, ou um canal que a empresa abandonou.
 */
export const DORMANT_AFTER_HOURS = 24 * 30;

function toDate(value: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function evaluateChannel(
  channel: IngestionChannel,
  input: ChannelInput,
  now: Date = new Date()
): ChannelHealth {
  const lastReceivedAt = toDate(input.lastReceivedAt);

  if (input.failed) {
    return {
      channel,
      status: "unknown",
      tone: "slate",
      hoursSince: null,
      lastReceivedAt: null,
      // Não alerta: "não consegui apurar" não é "o canal parou", e tratar os
      // dois como a mesma coisa encheria a tela de vermelho a cada soluço de
      // rede. O estado aparece no painel; só não vira banner.
      alerts: false,
    };
  }

  if (!input.configured) {
    return {
      channel,
      status: "not_configured",
      tone: "slate",
      hoursSince: null,
      lastReceivedAt,
      alerts: false,
    };
  }

  if (!lastReceivedAt) {
    return {
      channel,
      status: "never_received",
      tone: "slate",
      hoursSince: null,
      lastReceivedAt: null,
      alerts: false,
    };
  }

  // Data no futuro (relógio do provedor adiantado, `created_at` viajado) conta
  // como zero em vez de negativo: um número negativo viraria "há -3 horas" na
  // tela, e o estado correto continua sendo "está recebendo".
  const hoursSince = Math.max(0, (now.getTime() - lastReceivedAt.getTime()) / HOUR);
  const threshold = SILENCE_THRESHOLD_HOURS[channel];

  if (hoursSince < threshold) {
    return { channel, status: "receiving", tone: "green", hoursSince, lastReceivedAt, alerts: false };
  }

  if (hoursSince >= threshold + DORMANT_AFTER_HOURS) {
    return { channel, status: "dormant", tone: "slate", hoursSince, lastReceivedAt, alerts: false };
  }

  // Âmbar no começo do silêncio, vermelho quando ele dobra o limiar. A
  // graduação não muda a ação — em ambos o canal precisa de atenção —, mas
  // separa "pode ser um fim de semana" de "isto já passou de qualquer
  // explicação inocente".
  return {
    channel,
    status: "silent",
    tone: hoursSince >= threshold * 2 ? "red" : "amber",
    hoursSince,
    lastReceivedAt,
    alerts: true,
  };
}

/** Nome do canal na interface. */
export const CHANNEL_LABELS: Record<IngestionChannel, string> = {
  whatsapp: "WhatsApp",
  external_ingest: "Integração n8n",
  public_form: "Formulário público",
};

/**
 * "há 3 dias", "há 5 horas", "há poucos minutos".
 *
 * Arredonda para baixo de propósito: dizer "há 2 dias" quando faz 2 dias e 20
 * horas erra a favor de quem lê — ninguém age achando que o problema é menor
 * do que é, e o número na tela nunca fica maior que a realidade.
 */
export function formatSilence(hoursSince: number): string {
  if (hoursSince < 1) return "há poucos minutos";
  if (hoursSince < 24) {
    const horas = Math.floor(hoursSince);
    return `há ${horas} ${horas === 1 ? "hora" : "horas"}`;
  }
  const dias = Math.floor(hoursSince / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/**
 * A frase que vai para a tela.
 *
 * Toda redação de `silent` e `dormant` fala de AUSÊNCIA, nunca de falha. O
 * indicador não sabe se a integração quebrou ou se o mercado parou, e a tela
 * não pode afirmar o que o dado não sustenta.
 */
export function describeChannel(health: ChannelHealth): string {
  const nome = CHANNEL_LABELS[health.channel];
  switch (health.status) {
    case "not_configured":
      return `${nome} não configurado`;
    case "never_received":
      return `${nome} configurado, aguardando a primeira entrada`;
    case "receiving":
      return `Última entrada ${formatSilence(health.hoursSince ?? 0)}`;
    case "silent":
      return `Nenhuma entrada ${formatSilence(health.hoursSince ?? 0)}`;
    case "dormant":
      return `Sem entradas ${formatSilence(health.hoursSince ?? 0)}`;
    case "unknown":
      return "Não foi possível apurar o recebimento agora";
  }
}

/**
 * Os canais em silêncio, do mais grave para o menos — é o que o banner
 * anuncia. Lista vazia significa que não há nada a dizer, e o banner não deve
 * ser desenhado.
 */
export function alertingChannels(healths: ChannelHealth[]): ChannelHealth[] {
  return healths
    .filter((h) => h.alerts)
    .sort((a, b) => (b.hoursSince ?? 0) - (a.hoursSince ?? 0));
}
