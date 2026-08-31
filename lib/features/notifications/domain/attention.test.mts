/**
 * Regra dos indicadores de atenção.
 *
 *   npm run test:unit
 *
 * O que este arquivo protege, em ordem de importância: que `viewer` não ganhe
 * badge (o contador dele nunca desceria), que o toast não dispare na abertura
 * da aba, e que o número mostrado seja o de conversas — nunca o de mensagens.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  arrivedSince,
  ATTENTION_LABELS,
  COUNT_CEILING,
  formatCount,
  isTaskOverdue,
  newLeadCutoff,
  NEW_LEAD_WINDOW_HOURS,
  seesAttention,
  showsBadge,
} from "./attention.ts";

const AGORA = new Date("2026-08-31T18:00:00.000Z");
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 60 * 60 * 1000).toISOString();

test("viewer não recebe indicador — o contador dele nunca desceria", () => {
  // Ele não conclui tarefa e não zera `unread_count` (a escrita é barrada de
  // propósito em whatsapp-client.tsx). Badge permanentemente aceso ensina a
  // ignorar todos os badges.
  assert.equal(seesAttention("viewer", false), false);
  assert.equal(seesAttention("org_admin", false), true);
  assert.equal(seesAttention("seller", false), true);
  assert.equal(seesAttention("agent", false), true);
});

test("admin global vê mesmo com papel viewer na organização ativa", () => {
  assert.equal(seesAttention("viewer", true), true);
});

test("tarefa vencida: pendente e com prazo no passado", () => {
  assert.equal(isTaskOverdue({ status: "pending", due_at: horasAtras(1) }, AGORA), true);
  assert.equal(isTaskOverdue({ status: "pending", due_at: horasAtras(-1) }, AGORA), false);
});

test("tarefa concluída nunca está vencida, mesmo com prazo estourado", () => {
  assert.equal(isTaskOverdue({ status: "done", due_at: horasAtras(240) }, AGORA), false);
});

test("tarefa sem prazo nunca vence", () => {
  // Cobrar prazo de quem não definiu um é inventar dívida.
  assert.equal(isTaskOverdue({ status: "pending", due_at: null }, AGORA), false);
});

test("prazo inválido não derruba o contador", () => {
  assert.equal(isTaskOverdue({ status: "pending", due_at: "nao-e-data" }, AGORA), false);
});

test("o teto do badge é 99+", () => {
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(7), "7");
  assert.equal(formatCount(COUNT_CEILING), "99");
  assert.equal(formatCount(COUNT_CEILING + 1), "99+");
  assert.equal(formatCount(4821), "99+", "número de quatro dígitos não é informação");
});

test("formatCount não produz negativo nem fração", () => {
  assert.equal(formatCount(-3), "0");
  assert.equal(formatCount(2.7), "2");
});

test("a janela de lead novo é de 24h", () => {
  const corte = newLeadCutoff(AGORA);
  assert.equal(NEW_LEAD_WINDOW_HOURS, 24);
  assert.equal(corte.toISOString(), "2026-08-30T18:00:00.000Z");
});

test("a primeira leitura da aba NÃO dispara toast", () => {
  // Abrir o CRM com sete leads das últimas 24h é estado, não chegada. Sem esta
  // regra, todo login vira uma rajada de avisos sobre o que a pessoa já sabia.
  assert.deepEqual(arrivedSince(null, ["a", "b", "c"]), []);
});

test("só o que apareceu depois da leitura anterior vira toast", () => {
  assert.deepEqual(arrivedSince(["a", "b"], ["c", "a", "b"]), ["c"]);
});

test("lead que saiu da janela não dispara nada", () => {
  assert.deepEqual(arrivedSince(["a", "b"], ["b"]), []);
});

test("nada novo, nada a anunciar", () => {
  assert.deepEqual(arrivedSince(["a", "b"], ["a", "b"]), []);
});

test("o rótulo do atendimento separa conversas de mensagens", () => {
  // O badge mostra conversas. Mostrar mensagens infla: um lead que manda sete
  // linhas viraria "7", e a equipe aprende que o número não significa esforço.
  assert.equal(ATTENTION_LABELS.unread(3, 11), "3 conversas aguardando · 11 mensagens");
  assert.equal(ATTENTION_LABELS.unread(1, 1), "1 conversa aguardando · 1 mensagem");
  assert.equal(ATTENTION_LABELS.unread(1, 4), "1 conversa aguardando · 4 mensagens");
});

test("os rótulos concordam em singular e respeitam o teto", () => {
  assert.equal(ATTENTION_LABELS.overdueTasks(1), "1 tarefa vencida");
  assert.equal(ATTENTION_LABELS.overdueTasks(5), "5 tarefas vencidas");
  assert.equal(ATTENTION_LABELS.newLeads(1), "1 lead novo (24h)");
  assert.equal(ATTENTION_LABELS.newLeads(200), "99+ leads novos (24h)");
});

test("o rótulo de lead diz 'novos', nunca 'não atendidos'", () => {
  // O dado prova chegada, não ausência de atendimento: `deals` não registra
  // primeiro contato. Mesmo contrato de redação da saúde da entrada de leads.
  const texto = ATTENTION_LABELS.newLeads(4);
  assert.doesNotMatch(texto, /atendid|sem resposta|parado/i);
  assert.match(texto, /novos/);
});

test("null é 'não sei' e não desenha badge — nem zero desenha", () => {
  // Zero afirma "nada esperando por você"; quando a consulta falha, o sistema
  // não sustenta essa afirmação. Mesma disciplina do `unknown` da saúde da
  // entrada de leads.
  assert.equal(showsBadge(null), false);
  assert.equal(showsBadge(0), false);
  assert.equal(showsBadge(1), true);
});
