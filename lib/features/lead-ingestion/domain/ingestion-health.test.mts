/**
 * Regra da saúde da entrada de leads.
 *
 *   npm run test:unit
 *
 * O caso que dá nome a este arquivo é o incidente de 26/08/2026: o webhook da
 * UAZAPI ficou cinco dias devolvendo 401 e nada na interface disse que o
 * recebimento havia parado. O primeiro teste reproduz exatamente essa janela.
 *
 * O resto do arquivo existe pelo motivo oposto: garantir que o indicador
 * **não** grite. Alarme falso mata o alarme, então empresa em implantação,
 * canal nunca configurado e canal abandonado há meses precisam ficar quietos —
 * e é isso que a maioria das asserções prende.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alertingChannels,
  describeChannel,
  evaluateChannel,
  formatSilence,
  DORMANT_AFTER_HOURS,
  SILENCE_THRESHOLD_HOURS,
} from "./ingestion-health.ts";

const AGORA = new Date("2026-08-31T13:47:00.000Z");
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 60 * 60 * 1000);

test("o incidente real: WhatsApp parado desde 26/08 alerta", () => {
  // Última mensagem recebida em produção: 2026-08-26 18:20:52 UTC.
  const health = evaluateChannel(
    "whatsapp",
    { configured: true, lastReceivedAt: "2026-08-26T18:20:52.266Z" },
    AGORA
  );
  assert.equal(health.status, "silent");
  assert.equal(health.alerts, true);
  assert.equal(health.tone, "red", "quatro dias é o dobro do limiar de 48h");
  assert.match(describeChannel(health), /^Nenhuma entrada há 4 dias$/);
});

test("canal recebendo não alerta", () => {
  const health = evaluateChannel("whatsapp", { configured: true, lastReceivedAt: horasAtras(3) }, AGORA);
  assert.equal(health.status, "receiving");
  assert.equal(health.tone, "green");
  assert.equal(health.alerts, false);
});

test("nunca configurado é estado, não problema", () => {
  const health = evaluateChannel("whatsapp", { configured: false, lastReceivedAt: null }, AGORA);
  assert.equal(health.status, "not_configured");
  assert.equal(health.alerts, false, "empresa sem WhatsApp não pode viver com alerta na tela");
  assert.equal(health.tone, "slate");
});

test("configurado e ainda sem nada é implantação, não queda", () => {
  const health = evaluateChannel("whatsapp", { configured: true, lastReceivedAt: null }, AGORA);
  assert.equal(health.status, "never_received");
  assert.equal(health.alerts, false, "empresa nova não pode nascer em vermelho");
  assert.match(describeChannel(health), /aguardando a primeira entrada/);
});

test("canal parado há meses vira dormente e para de alertar", () => {
  const muitoDepois = SILENCE_THRESHOLD_HOURS.whatsapp + DORMANT_AFTER_HOURS + 1;
  const health = evaluateChannel("whatsapp", { configured: true, lastReceivedAt: horasAtras(muitoDepois) }, AGORA);
  assert.equal(health.status, "dormant");
  assert.equal(health.alerts, false, "alarme diário sobre canal abandonado é ruído permanente");
});

test("a borda do limiar do WhatsApp é 48h", () => {
  const dentro = evaluateChannel("whatsapp", { configured: true, lastReceivedAt: horasAtras(47.9) }, AGORA);
  const fora = evaluateChannel("whatsapp", { configured: true, lastReceivedAt: horasAtras(48.1) }, AGORA);
  assert.equal(dentro.status, "receiving");
  assert.equal(fora.status, "silent");
  assert.equal(fora.tone, "amber", "logo depois do limiar ainda pode ser um fim de semana");
});

test("n8n e formulário toleram uma semana — entram em rajada", () => {
  const tresDias = { configured: true, lastReceivedAt: horasAtras(24 * 3) };
  assert.equal(evaluateChannel("whatsapp", tresDias, AGORA).status, "silent");
  assert.equal(evaluateChannel("external_ingest", tresDias, AGORA).status, "receiving");
  assert.equal(evaluateChannel("public_form", tresDias, AGORA).status, "receiving");
});

test("data no futuro não vira 'há -3 horas'", () => {
  const health = evaluateChannel("whatsapp", { configured: true, lastReceivedAt: horasAtras(-3) }, AGORA);
  assert.equal(health.hoursSince, 0);
  assert.equal(health.status, "receiving");
});

test("timestamp inválido é tratado como ausência, não como erro", () => {
  const health = evaluateChannel("whatsapp", { configured: true, lastReceivedAt: "nao-e-data" }, AGORA);
  assert.equal(health.status, "never_received");
  assert.equal(health.alerts, false);
});

test("a tela nunca acusa falha — só ausência", () => {
  const silencioso = evaluateChannel(
    "whatsapp",
    { configured: true, lastReceivedAt: horasAtras(72) },
    AGORA
  );
  const texto = describeChannel(silencioso);
  assert.doesNotMatch(texto, /falha|erro|quebrad|offline/i, "o dado não distingue integração quebrada de semana fraca");
  assert.match(texto, /Nenhuma entrada/);
});

test("formatSilence arredonda para baixo e concorda em singular", () => {
  assert.equal(formatSilence(0.4), "há poucos minutos");
  assert.equal(formatSilence(1.9), "há 1 hora");
  assert.equal(formatSilence(5.7), "há 5 horas");
  assert.equal(formatSilence(24), "há 1 dia");
  assert.equal(formatSilence(24 * 2 + 20), "há 2 dias", "2d20h não pode virar 3 dias");
});

test("alertingChannels traz só quem alerta, do mais grave para o menos", () => {
  const healths = [
    evaluateChannel("whatsapp", { configured: true, lastReceivedAt: horasAtras(50) }, AGORA),
    evaluateChannel("external_ingest", { configured: true, lastReceivedAt: horasAtras(24 * 10) }, AGORA),
    evaluateChannel("public_form", { configured: true, lastReceivedAt: horasAtras(1) }, AGORA),
    evaluateChannel("whatsapp", { configured: false, lastReceivedAt: null }, AGORA),
  ];
  const alertando = alertingChannels(healths);
  assert.deepEqual(
    alertando.map((h) => h.channel),
    ["external_ingest", "whatsapp"]
  );
});

test("sem nada em silêncio, não há banner a desenhar", () => {
  const healths = [
    evaluateChannel("whatsapp", { configured: true, lastReceivedAt: horasAtras(2) }, AGORA),
    evaluateChannel("public_form", { configured: false, lastReceivedAt: null }, AGORA),
  ];
  assert.deepEqual(alertingChannels(healths), []);
});

test("leitura que falha vira 'unknown', nunca 'aguardando'", () => {
  // É o modo de falha mais perigoso do indicador: se a consulta estoura e o
  // canal cai em `never_received`, a tela responde "aguardando a primeira
  // entrada" — falso conforto, exatamente o defeito que ele existe para
  // denunciar.
  const health = evaluateChannel(
    "whatsapp",
    { failed: true, configured: true, lastReceivedAt: null },
    AGORA
  );
  assert.equal(health.status, "unknown");
  assert.notEqual(health.status, "never_received");
  assert.match(describeChannel(health), /não foi possível apurar/i);
});

test("'unknown' não vira banner — não saber não é o canal ter parado", () => {
  const health = evaluateChannel(
    "external_ingest",
    { failed: true, configured: true, lastReceivedAt: null },
    AGORA
  );
  assert.equal(health.alerts, false, "um soluço de rede não pode pintar a tela de vermelho");
  assert.deepEqual(alertingChannels([health]), []);
});

test("a falha vence qualquer data já lida", () => {
  // Cinto e suspensório: se a bandeira de falha chegar junto com um timestamp
  // antigo em cache, o estado honesto continua sendo "não sei".
  const health = evaluateChannel(
    "whatsapp",
    { failed: true, configured: true, lastReceivedAt: horasAtras(1) },
    AGORA
  );
  assert.equal(health.status, "unknown");
  assert.equal(health.lastReceivedAt, null);
});
