/**
 * Os tres defeitos Altos que a auditoria de QA encontrou no recurso de edicao.
 *
 * Todos foram REPRODUZIDOS contra o codigo real antes da correcao. Cada teste
 * abaixo falha na versao anterior — e esse e o unico motivo de eles existirem.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyEditedAnswers,
  diffLeadAnswers,
  parseLeadInfo,
  serializeLeadAnswers,
} from "./lead-answers.ts";

test("editar ate sobrar UMA linha nao colapsa o bloco", () => {
  // Antes: o valor deixava de ter "mais de uma linha", virava extra rotulado
  // "R lista" e a caixa de edicao reabria VAZIA — o Salvar seguinte apagava a
  // ultima informacao que restava.
  const original = { r_lista: "POSSUI CNPJ?: MEI\nQUANTAS VIDAS?: 4" };
  const salvo = applyEditedAnswers(original, "POSSUI CNPJ?: MEI");
  const info = parseLeadInfo(salvo);

  assert.equal(info.answers.length, 1, "a linha que sobrou continua sendo resposta");
  assert.deepEqual(info.extras, [], "nada pode virar extra rotulado com a chave tecnica");
  assert.equal(
    serializeLeadAnswers(info.answers),
    "POSSUI CNPJ?: MEI",
    "reabrir a edicao traz o conteudo, nao uma caixa vazia"
  );
});

test("historico nao registra remocao do que continua gravado", () => {
  const antes = parseLeadInfo({ r_lista: "POSSUI CNPJ?: MEI\nQUANTAS VIDAS?: 4" });
  const depois = parseLeadInfo(applyEditedAnswers({ r_lista: "POSSUI CNPJ?: MEI\nQUANTAS VIDAS?: 4" }, "POSSUI CNPJ?: MEI"));
  assert.deepEqual(diffLeadAnswers(antes.answers, depois.answers), [
    "QUANTAS VIDAS?: 4 → (removido)",
  ]);
});

test("dois valores multilinha: salvar sem mudar nada nao duplica", () => {
  // Antes: o texto editado ia so para a primeira chave, a segunda ficava
  // intacta, e o conteudo dela voltava a ser somado — de forma cumulativa a
  // cada Salvar — com o historico inventando alteracoes.
  const original = { r_lista: "P1: a\nP2: b", mensagem: "linha um\nlinha dois" };
  const info = parseLeadInfo(original);
  assert.equal(info.answers.length, 4);
  assert.deepEqual(info.blockKeys, ["r_lista", "mensagem"]);

  const salvo = applyEditedAnswers(original, serializeLeadAnswers(info.answers));
  const depois = parseLeadInfo(salvo);

  assert.equal(depois.answers.length, 4, "nao pode duplicar");
  assert.deepEqual(diffLeadAnswers(info.answers, depois.answers), [], "nem inventar alteracao");

  // Salvar de novo tambem nao acumula: o defeito era cumulativo.
  const salvoDeNovo = applyEditedAnswers(salvo, serializeLeadAnswers(depois.answers));
  assert.equal(parseLeadInfo(salvoDeNovo).answers.length, 4);
});

test("o que nao e bloco e preservado intacto", () => {
  const original = {
    r_lista: "P1: a\nP2: b",
    utm: "source=META ADS",
    typeform_response_id: "abc123",
  };
  const salvo = applyEditedAnswers(original, "P1: z");
  assert.equal(salvo.utm, "source=META ADS");
  assert.equal(salvo.typeform_response_id, "abc123");
  assert.equal(salvo.r_lista, undefined, "a chave da origem foi consolidada");
  assert.equal(salvo.respostas, "P1: z");
});

test("lead sem bloco de origem: a primeira edicao cria um bloco de verdade", () => {
  // Antes: uma unica linha digitada virava extra rotulado "Respostas" e a
  // reabertura vinha vazia.
  const salvo = applyEditedAnswers({ utm: "source=x" }, "Orcamento: 5000");
  const info = parseLeadInfo(salvo);
  assert.equal(info.answers.length, 1);
  assert.deepEqual(info.answers[0], { question: "Orcamento", answer: "5000" });
  assert.deepEqual(
    info.extras.map((e) => e.question),
    ["Utm"]
  );
});

test("apagar tudo remove o bloco em vez de deixar chave vazia", () => {
  const salvo = applyEditedAnswers({ r_lista: "P1: a\nP2: b", utm: "x" }, "   ");
  assert.equal(salvo.respostas, undefined);
  assert.equal(salvo.r_lista, undefined);
  assert.equal(salvo.utm, "x");
});

test("metadata ausente ou invalido nao quebra a edicao", () => {
  for (const entrada of [null, undefined, "texto", [1, 2], 42]) {
    const salvo = applyEditedAnswers(entrada, "P: v");
    assert.equal(salvo.respostas, "P: v");
  }
});
