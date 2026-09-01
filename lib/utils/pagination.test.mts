/**
 * Aritmética de paginação.
 *
 *   npm run test:unit
 *
 * Estes testes nasceram em `lib/features/contacts/domain/contact-search.test.mts`
 * e vieram junto quando as funções foram promovidas ao ganhar o segundo
 * consumidor (a carteira de leads). Teste que fica para trás na promoção é
 * teste que ninguém roda.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PER_PAGE, resolvePagination, totalPages } from "./pagination.ts";

test("a primeira página começa no zero", () => {
  assert.deepEqual(resolvePagination("1"), { page: 1, from: 0, to: DEFAULT_PER_PAGE - 1 });
});

test("a segunda página não repete nem pula linha", () => {
  const primeira = resolvePagination("1");
  const segunda = resolvePagination("2");
  assert.equal(segunda.from, primeira.to + 1, "sem buraco e sem sobreposição entre páginas");
});

test("página inválida, zero ou negativa cai na primeira", () => {
  // A URL é editável à mão e compartilhada por link: derrubar a tela por um
  // parâmetro torto é pior que ignorá-lo.
  for (const entrada of ["0", "-3", "abc", "", undefined, "NaN"]) {
    assert.equal(resolvePagination(entrada).page, 1, `entrada: ${String(entrada)}`);
  }
});

test("página fracionária é truncada", () => {
  assert.equal(resolvePagination("2.9").page, 2);
});

test("o tamanho de página é de quem chama", () => {
  const p = resolvePagination("3", 10);
  assert.deepEqual(p, { page: 3, from: 20, to: 29 });
});

test("lista vazia ainda é uma página", () => {
  // Zero páginas produziria "Página 1 de 0" na tela.
  assert.equal(totalPages(0), 1);
});

test("o total de páginas arredonda para cima", () => {
  assert.equal(totalPages(DEFAULT_PER_PAGE), 1);
  assert.equal(totalPages(DEFAULT_PER_PAGE + 1), 2);
  assert.equal(totalPages(248), Math.ceil(248 / DEFAULT_PER_PAGE));
  assert.equal(totalPages(10, 3), 4);
});
