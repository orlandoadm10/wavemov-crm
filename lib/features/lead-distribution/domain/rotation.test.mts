/**
 * Rodizio ponderado — a regra que decide quem atende cada lead.
 *
 * Ela precisa ser DETERMINISTICA: o mesmo bilhete com os mesmos participantes
 * tem de resolver a mesma pessoa, senao a auditoria nao pode ser conferida
 * depois. Estes testes prendem exatamente isso.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRotationSequence, pickByTicket } from "./rotation.ts";

// Ids ordenaveis, para a ordem esperada ficar obvia na leitura do teste.
const ANA = "aaaaaaaa-0000-0000-0000-000000000001";
const BRUNO = "bbbbbbbb-0000-0000-0000-000000000002";
const CARLA = "cccccccc-0000-0000-0000-000000000003";

const p = (profileId: string, weight = 1) => ({ profileId, name: profileId[0], weight });

test("pesos iguais: cada um recebe uma vez por volta", () => {
  const seq = buildRotationSequence([p(ANA), p(BRUNO), p(CARLA)]);
  assert.deepEqual(seq, [ANA, BRUNO, CARLA]);
});

test("peso 2 recebe o dobro de peso 1", () => {
  const seq = buildRotationSequence([p(ANA, 2), p(BRUNO, 1)]);
  assert.equal(seq.filter((x) => x === ANA).length, 2);
  assert.equal(seq.filter((x) => x === BRUNO).length, 1);
});

test("a sequencia e INTERCALADA, nao em blocos", () => {
  // Expandir em bloco (A,A,A,B) daria a proporcao certa e entregaria tres
  // leads seguidos a mesma pessoa, concentrando a fila num vendedor so.
  const seq = buildRotationSequence([p(ANA, 3), p(BRUNO, 1)]);
  assert.deepEqual(seq, [ANA, BRUNO, ANA, ANA]);
});

test("a ordem nao depende da ordem de entrada", () => {
  const a = buildRotationSequence([p(CARLA), p(ANA), p(BRUNO)]);
  const b = buildRotationSequence([p(ANA), p(BRUNO), p(CARLA)]);
  assert.deepEqual(a, b, "o mesmo bilhete precisa resolver a mesma pessoa");
});

test("o primeiro bilhete cai na primeira posicao", () => {
  // O contador do banco devolve o valor JA incrementado: o primeiro lead
  // recebe o bilhete 1.
  const seq = buildRotationSequence([p(ANA), p(BRUNO)]);
  assert.equal(pickByTicket(seq, 1), ANA);
  assert.equal(pickByTicket(seq, 2), BRUNO);
  assert.equal(pickByTicket(seq, 3), ANA, "a volta recomeca");
});

test("dez leads seguidos respeitam a proporcao dos pesos", () => {
  const seq = buildRotationSequence([p(ANA, 3), p(BRUNO, 1)]);
  const recebidos: Record<string, number> = {};
  for (let bilhete = 1; bilhete <= 12; bilhete++) {
    const quem = pickByTicket(seq, bilhete)!;
    recebidos[quem] = (recebidos[quem] ?? 0) + 1;
  }
  assert.equal(recebidos[ANA], 9);
  assert.equal(recebidos[BRUNO], 3);
});

test("um participante so e responsavel fixo", () => {
  // E por isso que nao existe um metodo "responsavel fixo" separado.
  const seq = buildRotationSequence([p(ANA, 1)]);
  for (const bilhete of [1, 2, 50, 999]) assert.equal(pickByTicket(seq, bilhete), ANA);
});

test("sem participantes nao ha escolha", () => {
  assert.deepEqual(buildRotationSequence([]), []);
  assert.equal(pickByTicket([], 1), null);
  // Peso zero nao deveria existir (o banco exige 1..100), mas se chegar aqui
  // a pessoa simplesmente nao entra na volta.
  assert.deepEqual(buildRotationSequence([p(ANA, 0)]), []);
});

test("bilhete grande ou zerado nao estoura a sequencia", () => {
  const seq = buildRotationSequence([p(ANA), p(BRUNO)]);
  assert.equal(pickByTicket(seq, 1_000_001), ANA);
  assert.equal(pickByTicket(seq, 0), BRUNO, "bilhete 0 nao quebra");
});
