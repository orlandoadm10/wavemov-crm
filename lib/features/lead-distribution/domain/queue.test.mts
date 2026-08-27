/**
 * A fila ordenada com plantão — o coração da distribuição.
 *
 * O comportamento que estes testes prendem é o que o cliente descreveu: ordem
 * manual, peso como leads consecutivos, ausente PULADO sem perder a posição, e
 * continuidade do rodízio entre um lead e o seguinte.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { INITIAL_CURSOR, pickNext, type QueueParticipant } from "./queue.ts";

const p = (nome: string, position: number, weight = 1): QueueParticipant => ({
  profileId: `id-${nome}`,
  name: nome,
  weight,
  position,
});

const ANA = p("Ana", 0);
const BRUNO = p("Bruno", 1);
const CARLA = p("Carla", 2);
const FILA = [ANA, BRUNO, CARLA];

/** Roda N leads seguidos e devolve quem recebeu cada um. */
function distribuir(fila: QueueParticipant[], quantidade: number, inicio = INITIAL_CURSOR) {
  let cursor = inicio;
  const recebidos: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    const escolha = pickNext(fila, cursor);
    if (!escolha) break;
    recebidos.push(escolha.participant.name);
    cursor = escolha.next;
  }
  return { recebidos, cursor };
}

test("o primeiro lead vai para a primeira posição da fila", () => {
  const escolha = pickNext(FILA, INITIAL_CURSOR);
  assert.equal(escolha?.participant.name, "Ana");
  assert.deepEqual(escolha?.next, { position: 0, uses: 1 });
});

test("a fila segue a ordem do administrador e dá a volta", () => {
  const { recebidos } = distribuir(FILA, 7);
  assert.deepEqual(recebidos, ["Ana", "Bruno", "Carla", "Ana", "Bruno", "Carla", "Ana"]);
});

test("a ordem é a das POSIÇÕES, não a da lista recebida", () => {
  // Depender da ordem que o banco devolveu é o tipo de suposição que quebra
  // quando alguém mexe na consulta.
  const { recebidos } = distribuir([CARLA, ANA, BRUNO], 3);
  assert.deepEqual(recebidos, ["Ana", "Bruno", "Carla"]);
});

test("peso é quantos leads CONSECUTIVOS antes de avançar", () => {
  const fila = [p("Ana", 0, 2), p("Bruno", 1, 1), p("Carla", 2, 3)];
  const { recebidos } = distribuir(fila, 6);
  assert.deepEqual(recebidos, ["Ana", "Ana", "Bruno", "Carla", "Carla", "Carla"]);
});

test("o cursor persiste: retomar de onde parou continua a volta", () => {
  const primeira = distribuir(FILA, 2);
  assert.deepEqual(primeira.recebidos, ["Ana", "Bruno"]);
  // Simula o próximo lead chegando depois, com o cursor lido do banco.
  const segunda = distribuir(FILA, 1, primeira.cursor);
  assert.deepEqual(segunda.recebidos, ["Carla"]);
});

test("quem sai do plantão é PULADO e ninguém mais se desloca", () => {
  // Bruno some da fila elegível; Ana e Carla mantêm posições 0 e 2.
  const { recebidos } = distribuir([ANA, CARLA], 4);
  assert.deepEqual(recebidos, ["Ana", "Carla", "Ana", "Carla"]);
});

test("voltando ao plantão, a pessoa retoma o lugar dela na ordem", () => {
  // Cursor parado em Ana (posição 0), peso 1 consumido. Bruno estava fora.
  const cursor = { position: 0, uses: 1 };
  assert.equal(pickNext([ANA, CARLA], cursor)?.participant.name, "Carla");
  // Com Bruno de volta, o MESMO cursor entrega para ele — sem reordenar nada.
  assert.equal(pickNext(FILA, cursor)?.participant.name, "Bruno");
});

test("se a pessoa da vez sai no meio do peso, a vez passa adiante", () => {
  // Ana tem peso 3 e já consumiu 1, mas saiu do plantão: o lead não pode ficar
  // preso esperando quem não está trabalhando.
  const escolha = pickNext([BRUNO, CARLA], { position: 0, uses: 1 });
  assert.equal(escolha?.participant.name, "Bruno");
  assert.deepEqual(escolha?.next, { position: 1, uses: 1 });
});

test("um participante só recebe tudo — é o responsável fixo", () => {
  const { recebidos } = distribuir([p("Ana", 0)], 3);
  assert.deepEqual(recebidos, ["Ana", "Ana", "Ana"]);
});

test("fila vazia não escolhe ninguém", () => {
  assert.equal(pickNext([], INITIAL_CURSOR), null);
  assert.equal(pickNext([], { position: 5, uses: 2 }), null);
});

test("cursor apontando para posição que não existe mais dá a volta", () => {
  // A última pessoa da fila foi removida enquanto era a vez dela.
  assert.equal(pickNext([ANA, BRUNO], { position: 2, uses: 1 })?.participant.name, "Ana");
});

test("posições não sequenciais funcionam (o admin pode deixar buracos)", () => {
  const fila = [p("Ana", 10), p("Bruno", 50), p("Carla", 99)];
  const { recebidos } = distribuir(fila, 4);
  assert.deepEqual(recebidos, ["Ana", "Bruno", "Carla", "Ana"]);
});

test("peso reduzido abaixo do já consumido faz a fila avançar na hora", () => {
  // O admin baixou o peso da Ana de 3 para 1 depois de ela já ter recebido 2.
  const escolha = pickNext([p("Ana", 0, 1), BRUNO, CARLA], { position: 0, uses: 2 });
  assert.equal(escolha?.participant.name, "Bruno");
});
