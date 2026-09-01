/**
 * Regra da carteira de leads.
 *
 *   npm run test:unit
 *
 * O teste que dá sentido ao arquivo é o primeiro: o lead que escreve todo dia e
 * nunca recebe resposta **não pode** parecer bem atendido. Foi o defeito que a
 * definição ingênua de "última interação" produziria, e 86% dos `activity_logs`
 * da produção são exatamente esse caso.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ATRASO_ATENCAO_DIAS,
  ATRASO_CRITICO_DIAS,
  diasParado,
  formatarAtraso,
  janelaEmDias,
  paradoDesde,
  parseJanela,
  parseOrdem,
  rotularTratativa,
  situacao,
  SITUACAO_TOM,
  tomDoAtraso,
} from "./follow-up.ts";

const AGORA = new Date("2026-09-01T12:00:00.000Z");
const diasAtras = (d: number) =>
  new Date(AGORA.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

test("o lead que fala todo dia e nunca é respondido NÃO parece bem atendido", () => {
  // O caso que motiva o módulo inteiro. A equipe tratou há 10 dias; o lead
  // escreveu hoje. Uma métrica de "última interação" diria "ativo hoje".
  const lead = {
    equipeTratouEm: diasAtras(10),
    leadFalouEm: diasAtras(0),
    criadoEm: diasAtras(30),
  };
  assert.equal(situacao(lead, AGORA), "aguardando_resposta");
  assert.equal(diasParado(lead, AGORA), 10, "o relógio é o da EQUIPE, não o do lead");
  assert.equal(SITUACAO_TOM.aguardando_resposta, "red");
});

test("aguardando resposta vence o prazo — alguém está esperando agora", () => {
  // A equipe tratou há 2 horas e o lead respondeu há 1: dentro de qualquer
  // limiar, mas há uma pessoa esperando. Silêncio mútuo é menos grave.
  const lead = {
    equipeTratouEm: new Date(AGORA.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    leadFalouEm: new Date(AGORA.getTime() - 1 * 60 * 60 * 1000).toISOString(),
    criadoEm: diasAtras(5),
  };
  assert.equal(situacao(lead, AGORA), "aguardando_resposta");
});

test("nunca tratado conta desde a criação, não desde sempre", () => {
  // Ordenar "nunca tratado" como infinito jogaria para o topo da carteira o
  // lead que entrou há cinco minutos — todo dia, para sempre.
  const recem = { equipeTratouEm: null, leadFalouEm: null, criadoEm: diasAtras(0) };
  const antigo = { equipeTratouEm: null, leadFalouEm: null, criadoEm: diasAtras(30) };
  assert.equal(situacao(recem, AGORA), "nunca_tratado");
  assert.equal(diasParado(recem, AGORA), 0, "entrou agora: não é atraso ainda");
  assert.equal(diasParado(antigo, AGORA), 30);
  assert.equal(paradoDesde(antigo).toISOString(), diasAtras(30));
});

test("a equipe falou por último e o lead sumiu: sem retorno, não aguardando", () => {
  const lead = { equipeTratouEm: diasAtras(4), leadFalouEm: diasAtras(6), criadoEm: diasAtras(20) };
  assert.equal(situacao(lead, AGORA), "sem_retorno");
  assert.equal(SITUACAO_TOM.sem_retorno, "amber", "menos grave que ninguém ter respondido");
});

test("tratado dentro do limiar e sem o lead esperando é 'em dia'", () => {
  const lead = { equipeTratouEm: diasAtras(1), leadFalouEm: diasAtras(2), criadoEm: diasAtras(9) };
  assert.equal(situacao(lead, AGORA), "em_dia");
});

test("a borda do limiar de atenção", () => {
  const dentro = { equipeTratouEm: diasAtras(ATRASO_ATENCAO_DIAS - 1), leadFalouEm: null, criadoEm: diasAtras(20) };
  const fora = { equipeTratouEm: diasAtras(ATRASO_ATENCAO_DIAS), leadFalouEm: null, criadoEm: diasAtras(20) };
  assert.equal(situacao(dentro, AGORA), "em_dia");
  assert.equal(situacao(fora, AGORA), "sem_retorno");
});

test("o tom do atraso só grita depois do limiar", () => {
  assert.equal(tomDoAtraso(0), "slate");
  assert.equal(tomDoAtraso(ATRASO_ATENCAO_DIAS - 1), "slate");
  assert.equal(tomDoAtraso(ATRASO_ATENCAO_DIAS), "amber");
  assert.equal(tomDoAtraso(ATRASO_CRITICO_DIAS), "red");
});

test("data inválida não derruba a linha", () => {
  const lead = { equipeTratouEm: "nao-e-data", leadFalouEm: null, criadoEm: diasAtras(3) };
  assert.equal(situacao(lead, AGORA), "nunca_tratado");
  assert.equal(diasParado(lead, AGORA), 3, "cai no relógio da criação");
});

test("atraso nunca é negativo, mesmo com relógio adiantado", () => {
  const lead = { equipeTratouEm: diasAtras(-2), leadFalouEm: null, criadoEm: diasAtras(10) };
  assert.equal(diasParado(lead, AGORA), 0);
});

test("formatarAtraso arredonda para baixo e concorda em singular", () => {
  assert.equal(formatarAtraso(0), "hoje");
  assert.equal(formatarAtraso(1), "1 dia");
  assert.equal(formatarAtraso(12), "12 dias");
});

test("o tipo da última tratativa é rotulado, e o desconhecido não vira vazio", () => {
  // `stage_changed` conta como tratativa: arrastar cards numa arrumação de
  // segunda "trata" leads sem ninguém ter falado com ninguém. Mostrar o tipo é
  // o que deixa o admin julgar em vez de acreditar.
  assert.equal(rotularTratativa("stage_changed"), "Etapa alterada");
  assert.equal(rotularTratativa("whatsapp_outbound"), "Mensagem enviada");
  assert.equal(rotularTratativa(null), "—");
  assert.equal(rotularTratativa("tipo_futuro"), "tipo_futuro", "some na tela, não quebra");
});

test("parâmetros inválidos da URL caem no padrão em silêncio", () => {
  assert.equal(parseOrdem("recentes"), "recentes");
  assert.equal(parseOrdem("parados"), "parados");
  assert.equal(parseOrdem("qualquer"), "parados");
  assert.equal(parseOrdem(undefined), "parados");
  assert.equal(parseJanela("7d"), "7d");
  assert.equal(parseJanela("99d"), "todos");
});

test("a janela vira o mínimo de dias que a consulta exige", () => {
  assert.equal(janelaEmDias("3d"), ATRASO_ATENCAO_DIAS);
  assert.equal(janelaEmDias("7d"), ATRASO_CRITICO_DIAS);
  assert.equal(janelaEmDias("todos"), null);
  assert.equal(janelaEmDias("nunca"), null, "'nunca tratado' não é filtro de tempo");
});
