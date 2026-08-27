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
import {
  diffLeadAnswers,
  hasLeadInfo,
  parseLeadInfo,
  serializeLeadAnswers,
} from "./lead-answers.ts";

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

test("Typeform: utm vazio some e o id da RESPOSTA nao aparece na tela", () => {
  const info = parseLeadInfo(TYPEFORM);
  // `typeform_response_id` e um token opaco de outro sistema: nao diz nada a
  // quem atende. A referencia visual e o id do FORMULARIO, que a tela le de
  // `forms.external_id` — nao do payload.
  assert.deepEqual(info.extras, []);
});

test("a chave do bloco e devolvida para a edicao, mas nunca e rotulo", () => {
  assert.equal(parseLeadInfo(TYPEFORM).answersKey, "r_lista");
  assert.equal(parseLeadInfo(META_LEAD_ADS).answersKey, "r-lista");
  assert.equal(parseLeadInfo({ utm: "x" }).answersKey, null);
});

test("Meta Lead Ads: a chave é r-lista e funciona sem o código conhecê-la", () => {
  const info = parseLeadInfo(META_LEAD_ADS);
  assert.equal(info.answers.length, 6);
  assert.deepEqual(info.answers[0], { question: "Opção", answer: "TENHO PLANO" });
  // "30, 32" tem vírgula e continua uma resposta só.
  assert.deepEqual(info.answers[2], { question: "Idades", answer: "30, 32" });
});

test("Meta Lead Ads: enriquecimento fica nos extras; ID_form e utm vazio saem", () => {
  const info = parseLeadInfo(META_LEAD_ADS);
  const rotulos = info.extras.map((e) => e.question);
  // `ID_form` sai porque a tela ja mostra o id do formulario a partir do CRM:
  // repeti-lo seria a mesma linha duas vezes.
  assert.deepEqual(rotulos, ["Genero", "Genero confianca"]);
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

test("bloco misto: a maioria manda, e a linha solta vira resposta sem pergunta", () => {
  // Exigir separador em TODAS as linhas era frágil demais para dado real: uma
  // resposta que o lead escreveu em duas linhas derrubava o bloco inteiro para
  // os extras, e aí a tela mostrava o nome cru da chave da origem como rótulo.
  const info = parseLeadInfo({ bloco: "Pergunta: resposta\nlinha solta que o lead escreveu" });
  assert.equal(info.answers.length, 2);
  assert.deepEqual(info.answers[1], { question: "", answer: "linha solta que o lead escreveu" });
  assert.equal(info.extras.length, 0, "não pode virar extra rotulado com a chave");
});

test("separador sem espaço depois também conta (POSSUI CNPJ?:MEI)", () => {
  const info = parseLeadInfo({ bloco: "POSSUI CNPJ?:MEI\nVIDAS?: 4" });
  assert.deepEqual(info.answers[0], { question: "POSSUI CNPJ?", answer: "MEI" });
});

test("serializeLeadAnswers volta ao formato que a origem manda", () => {
  const info = parseLeadInfo(META_LEAD_ADS);
  const texto = serializeLeadAnswers(info.answers);
  assert.equal(texto.split("\n").length, 6);
  assert.equal(texto.split("\n")[0], "Opção: TENHO PLANO");
  // Ida e volta sem perda: é o que a caixa de edição grava de volta.
  assert.deepEqual(parseLeadInfo({ "r-lista": texto }).answers, info.answers);
});

test("diff: só o que mudou entra no histórico", () => {
  const antes = parseLeadInfo({ b: "Plano: UNIMED\nVidas: 4" }).answers;
  const depois = parseLeadInfo({ b: "Plano: AMIL\nVidas: 4" }).answers;
  assert.deepEqual(diffLeadAnswers(antes, depois), ["Plano: UNIMED → AMIL"]);
});

test("diff: reordenar as linhas não vira alteração", () => {
  // Sem comparar por pergunta, mover uma linha viraria N alterações e o
  // histórico deixaria de ser auditável.
  const antes = parseLeadInfo({ b: "Plano: UNIMED\nVidas: 4" }).answers;
  const depois = parseLeadInfo({ b: "Vidas: 4\nPlano: UNIMED" }).answers;
  assert.deepEqual(diffLeadAnswers(antes, depois), []);
});

test("diff: inclusão e remoção são nomeadas", () => {
  const antes = parseLeadInfo({ b: "Plano: UNIMED\nVidas: 4" }).answers;
  const depois = parseLeadInfo({ b: "Plano: UNIMED\nHospital: Sírio" }).answers;
  assert.deepEqual(diffLeadAnswers(antes, depois).sort(), [
    "Hospital: (vazio) → Sírio",
    "Vidas: 4 → (removido)",
  ]);
});

test("diff: perguntas repetidas são comparadas na ordem em que aparecem", () => {
  // O Typeform permite a mesma pergunta duas vezes; agrupar sem manter a ordem
  // faria a segunda resposta sumir do registro.
  const antes = parseLeadInfo({ b: "Idade: 30\nIdade: 32" }).answers;
  const depois = parseLeadInfo({ b: "Idade: 30\nIdade: 33" }).answers;
  assert.deepEqual(diffLeadAnswers(antes, depois), ["Idade: 32 → 33"]);
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

test("o nome da chave da origem NUNCA vira rótulo na tela", () => {
  // Regra de produto, nao heuristica: qualquer valor de varias linhas e bloco
  // de respostas. Antes, um bloco "mal formatado" caia nos extras e a tela
  // desenhava "R lista: <texto gigante>" — exatamente o que o cliente recusou.
  const malFormatados = [
    { "r-lista": "sem dois pontos aqui\nnem aqui" },
    { r_lista: "Pergunta: resposta\nlinha solta\noutra linha solta" },
    { qualquer_chave_tecnica: "linha um\nlinha dois\nlinha tres" },
  ];
  for (const metadata of malFormatados) {
    const info = parseLeadInfo(metadata);
    assert.equal(info.extras.length, 0, `virou extra rotulado: ${JSON.stringify(metadata)}`);
    assert.ok(info.answers.length > 0, "o conteudo nao pode sumir");
  }
});

test("valor de uma linha só continua sendo extra rotulado", () => {
  // Utm e genero sao pares curtos de verdade: ali o rotulo ajuda.
  const info = parseLeadInfo({ utm: "source=META ADS&medium=RJ", genero: "Indefinido" });
  assert.deepEqual(
    info.extras.map((e) => e.question),
    ["Utm", "Genero"]
  );
  assert.equal(info.answers.length, 0);
});
