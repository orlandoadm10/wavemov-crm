/**
 * O defeito que o primeiro lead real do Typeform revelou.
 *
 * O n8n grava o bloco de respostas com `\n` ESCAPADO — barra invertida
 * seguida de `n`, dois caracteres — e não com quebra de linha de verdade.
 * Conferido no dado gravado em produção: `r_lista` chegou com 464 caracteres
 * numa única linha.
 *
 * Consequência antes da correção: o bloco nunca tinha mais de uma linha, não
 * era reconhecido como respostas, e a tela desenhava `R lista: <texto
 * gigante>` no card secundário — com o nome técnico da chave como rótulo, e o
 * card principal vazio.
 *
 * As constantes deste arquivo usam `String.raw` de propósito, para que a barra
 * invertida sobreviva ao código-fonte. Se alguém "arrumar" isso trocando por
 * `"\n"`, o teste passa a exercitar o caso que já funcionava e para de
 * proteger o que interessa.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { hasLeadInfo, parseLeadInfo } from "./lead-answers.ts";

/** Forma exata em que o dado chegou do n8n. */
const BLOCO_ESCAPADO = String.raw`Qual é o seu email?: lead@exemplo.com\nPOSSUI CNPJ?: ✅ POSSUO CNPJ\nEM QUAL OPÇÃO MELHOR SE ENCAIXA?: ✅ TENHO UM PLANO DE SAÚDE\nQUAL O SEU PLANO DE SAÚDE ATUAL?: UNIMED\nQUAL A QUANTIDADE DE VIDAS PARA COTAÇÃO?: 4 vidas`;

const PAYLOAD_REAL = {
  utm: "source=META ADS&medium=RJ&campaign=JID&content=MEDSENIOR&term=Stories",
  r_lista: BLOCO_ESCAPADO,
  typeform_response_id: "g3uumlovqev9p9p1upj2ng3uuml8218y",
};

test("o bloco com \\n escapado vira respostas separadas", () => {
  const info = parseLeadInfo(PAYLOAD_REAL);
  assert.equal(info.answers.length, 5);
  assert.deepEqual(info.answers[1], { question: "POSSUI CNPJ?", answer: "✅ POSSUO CNPJ" });
  assert.deepEqual(info.answers[4], {
    question: "QUAL A QUANTIDADE DE VIDAS PARA COTAÇÃO?",
    answer: "4 vidas",
  });
});

test("e NUNCA vira um extra rotulado com o nome da chave", () => {
  const info = parseLeadInfo(PAYLOAD_REAL);
  const rotulos = info.extras.map((e) => e.question);
  assert.ok(!rotulos.includes("R lista"), "o defeito relatado pelo cliente");
  // Sobra só a UTM: o id da resposta é filtrado por ser token opaco da origem.
  assert.deepEqual(rotulos, ["Utm"]);
});

test("a UTM continua sendo um par rotulado, não vira resposta", () => {
  // Ela não tem `\\n` escapado, então segue de uma linha só — e ali o rótulo
  // ajuda, porque "Utm" diz o que aquele valor é.
  const info = parseLeadInfo(PAYLOAD_REAL);
  assert.equal(info.extras[0].answer.startsWith("source="), true);
});

test("a chave do bloco é reconhecida para a edição", () => {
  assert.equal(parseLeadInfo(PAYLOAD_REAL).answersKey, "r_lista");
});

test("\\r\\n escapado também é tratado", () => {
  const info = parseLeadInfo({ bloco: String.raw`Plano: UNIMED\r\nVidas: 4` });
  assert.equal(info.answers.length, 2);
  assert.deepEqual(info.answers[1], { question: "Vidas", answer: "4" });
});

test("quebra de linha de verdade continua funcionando", () => {
  // A correção não pode quebrar a origem que já mandava certo.
  const info = parseLeadInfo({ bloco: "Plano: UNIMED\nVidas: 4" });
  assert.equal(info.answers.length, 2);
  assert.ok(hasLeadInfo(info));
});
