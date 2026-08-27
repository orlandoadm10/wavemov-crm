/**
 * Regressão do parser das respostas do lead.
 *
 *   npm run test:unit
 *
 * Usa o runner embutido do Node (`node --test`) e o type stripping nativo do
 * Node 22.6+: nenhuma dependência nova entrou no projeto por causa deste
 * arquivo. É a resposta barata ao débito 1 do HANDOFF ("escolher um runner"),
 * limitada ao que é regra pura — o que fala com Supabase continua sem teste.
 *
 * Os dois payloads abaixo são REAIS, capturados no primeiro uso da integração
 * (Typeform e Meta Lead Ads, via n8n). Não os "arrume": o valor deste arquivo
 * é justamente prender o formato que a origem manda de verdade, incluindo o
 * `utm` vazio e o emoji nas respostas.
 *
 * Extensão `.mts` de propósito: o `package.json` não declara `type: module`, e
 * `.mts` evita o aviso de reparse a cada execução sem mexer no pacote.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { hasLeadInfo, parseLeadInfo } from "./lead-answers.ts";

const TYPEFORM = {
  r_lista:
    "Qual é o seu email?: adm.orlandolima@gmail.com\nPOSSUI CNPJ?: ✅ MEI\nEM QUAL OPÇÃO MELHOR SE ENCAIXA?: ✅ TENHO UM PLANO DE SAÚDE\nQUAL O SEU PLANO DE SAÚDE ATUAL?: UNIMED\nQUAL O CUSTO DO SEU PLANO DE SAÚDE ATUAL?: Até R$ 4.000\nQUAL A QUANTIDADE DE VIDAS PARA COTAÇÃO?: 4 vidas\nQUAIS AS IDADES DAS VIDAS?: 12\nHOSPITAL DE PREFERÊNCIA?: testeHosp\nPARA FINALIZAR, QUAL O SEU NOME?: LeadtesteOrlando\nE QUAL O SEU WHATSAPP (EXCLUSIVO PARA SÃO PAULO)?: +5584999915326",
  utm: "",
  typeform_response_id: "g3uumlovqev9p9p1upj2ng3uuml8218y",
};

const META_LEAD_ADS = {
  "r-lista":
    "Opção: TENHO PLANO\nCnpj: MEI\nIdades: 30, 32\nVidas: 4 vidas\nCusto atual: Até R$ 4.000\nPlano atual: UNIMED",
  ID_form: "2432052590537853",
  utm: "  ",
  genero: "Indefinido",
  genero_confianca: "baixa",
};

test("Typeform: as 10 respostas viram pares pergunta/resposta", () => {
  const info = parseLeadInfo(TYPEFORM);
  assert.equal(info.answers.length, 10);
  assert.deepEqual(info.answers[1], { question: "POSSUI CNPJ?", answer: "✅ MEI" });
  assert.deepEqual(info.answers[4], {
    question: "QUAL O CUSTO DO SEU PLANO DE SAÚDE ATUAL?",
    answer: "Até R$ 4.000",
  });
  // Parênteses e acento na pergunta não quebram a divisão.
  assert.equal(info.answers[9].question, "E QUAL O SEU WHATSAPP (EXCLUSIVO PARA SÃO PAULO)?");
});

test("Typeform: utm vazio some, id da origem vira extra", () => {
  const info = parseLeadInfo(TYPEFORM);
  assert.equal(info.extras.length, 1);
  assert.deepEqual(info.extras[0], {
    question: "Typeform response id",
    answer: "g3uumlovqev9p9p1upj2ng3uuml8218y",
  });
});

test("Meta Lead Ads: a chave é r-lista e funciona sem o código conhecê-la", () => {
  const info = parseLeadInfo(META_LEAD_ADS);
  assert.equal(info.answers.length, 6);
  assert.deepEqual(info.answers[0], { question: "Opção", answer: "TENHO PLANO" });
  // "30, 32" tem vírgula e continua uma resposta só.
  assert.deepEqual(info.answers[2], { question: "Idades", answer: "30, 32" });
});

test("Meta Lead Ads: enriquecimento fica nos extras, utm só com espaços some", () => {
  const info = parseLeadInfo(META_LEAD_ADS);
  const rotulos = info.extras.map((e) => e.question);
  assert.deepEqual(rotulos, ["ID form", "Genero", "Genero confianca"]);
  assert.ok(!rotulos.includes("Utm"));
});

test("resposta com dois-pontos dentro não perde conteúdo", () => {
  const info = parseLeadInfo({
    bloco: "Custo do plano: Até R$ 4.000: negociável\nVidas: 4",
  });
  assert.deepEqual(info.answers[0], {
    question: "Custo do plano",
    answer: "Até R$ 4.000: negociável",
  });
});

test("uma linha só não é bloco de respostas — vira extra", () => {
  const info = parseLeadInfo({ obs: "Cliente pediu retorno: amanhã" });
  assert.equal(info.answers.length, 0);
  assert.deepEqual(info.extras[0], { question: "Obs", answer: "Cliente pediu retorno: amanhã" });
});

test("linha sem separador é preservada como resposta sem pergunta", () => {
  const info = parseLeadInfo({ bloco: "Pergunta: resposta\nlinha solta que o lead escreveu" });
  assert.equal(info.answers.length, 0, "bloco misto não é tratado como pares");
  assert.equal(info.extras.length, 1, "o conteúdo não pode sumir");
});

test("entradas defensivas não quebram nem inventam card", () => {
  for (const entrada of [null, undefined, {}, { utm: "" }, { utm: "   " }, "texto", [1, 2], 42]) {
    const info = parseLeadInfo(entrada);
    assert.equal(hasLeadInfo(info), false, `deveria ser vazio: ${JSON.stringify(entrada)}`);
  }
});

test("números e booleanos do payload viram texto sem sumir", () => {
  const info = parseLeadInfo({ vidas: 4, ativo: true });
  assert.deepEqual(
    info.extras.map((e) => e.answer),
    ["4", "true"]
  );
});
