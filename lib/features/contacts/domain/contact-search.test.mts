/**
 * Busca e paginação de contatos.
 *
 *   npm run test:unit
 *
 * O termo digitado é interpolado numa gramática do PostgREST
 * (`or=(a.ilike.%x%,b.ilike.%x%)`) e depois numa do `ilike`. Duas gramáticas
 * encadeadas sobre entrada do usuário é motivo suficiente para este arquivo
 * existir — a maioria das asserções aqui é sobre o que NÃO pode passar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildContactSearchFilter,
  parseDealStatus,
  sanitizeSearchTerm,
} from "./contact-search.ts";

test("busca simples vira um ilike por coluna", () => {
  assert.equal(
    buildContactSearchFilter("maria"),
    "name.ilike.%maria%,email.ilike.%maria%,phone.ilike.%maria%,whatsapp_phone.ilike.%maria%"
  );
});

test("vírgula não pode virar um segundo filtro", () => {
  // `or=(...)` separa por vírgula: sem o saneamento, "a,b" viraria um filtro
  // extra e o PostgREST interpretaria a expressão errada.
  const filtro = buildContactSearchFilter("silva, joão");
  assert.equal(filtro, "name.ilike.%silva joão%,email.ilike.%silva joão%,phone.ilike.%silva joão%,whatsapp_phone.ilike.%silva joão%");
  assert.equal(filtro?.split(",").length, 4, "continuam sendo quatro filtros, um por coluna");
});

test("parênteses não quebram a expressão", () => {
  assert.equal(sanitizeSearchTerm("(11) 99999-9999"), "11 99999-9999");
});

test("curinga digitado não traz a base inteira", () => {
  // Quem digita `%` espera o literal. Sem remover, `%` no meio do `ilike`
  // casaria com tudo e a tela devolveria a empresa inteira como "resultado".
  assert.equal(sanitizeSearchTerm("%"), "");
  assert.equal(sanitizeSearchTerm("ma%ria"), "ma ria");
  assert.equal(sanitizeSearchTerm("ma_ria"), "ma ria");
  assert.equal(sanitizeSearchTerm("ma*ria"), "ma ria");
});

test("barra invertida não escapa o caractere seguinte", () => {
  assert.equal(sanitizeSearchTerm("ma\\ria"), "ma ria");
});

test("busca vazia é ausência de filtro, não filtro que não casa", () => {
  // Devolver a lista completa é mais honesto: a pessoa não chegou a expressar
  // um termo, então não há resultado a negar.
  assert.equal(buildContactSearchFilter(""), null);
  assert.equal(buildContactSearchFilter("   "), null);
  assert.equal(buildContactSearchFilter(undefined), null);
  assert.equal(buildContactSearchFilter("%%%"), null, "só curingas equivale a não buscar");
});

test("espaços repetidos colapsam", () => {
  assert.equal(sanitizeSearchTerm("  joão   da   silva  "), "joão da silva");
});

test("status inválido vira ausência de filtro, não erro", () => {
  // A URL é editável à mão e compartilhada por link: derrubar a tela por um
  // parâmetro torto é pior que ignorá-lo.
  assert.equal(parseDealStatus("open"), "open");
  assert.equal(parseDealStatus("won"), "won");
  assert.equal(parseDealStatus("lost"), "lost");
  assert.equal(parseDealStatus("arquivado"), null);
  assert.equal(parseDealStatus(""), null);
  assert.equal(parseDealStatus(undefined), null);
});
