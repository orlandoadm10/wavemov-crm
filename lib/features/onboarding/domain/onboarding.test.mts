/**
 * Assistente de configuração inicial: quem cai nele, em que passo, e o que o
 * passo do funil aceita gravar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PIPELINE_TEMPLATES,
  templateForSegment,
  validatePipelineDraft,
} from "./pipeline-templates.ts";
import {
  needsOnboarding,
  nextPendingStep,
  parseOnboardingProgress,
  stepAfter,
  stepBefore,
} from "./steps.ts";

test("coluna ausente (0030 não aplicada) não prende ninguém no assistente", () => {
  assert.equal(needsOnboarding({ onboardedAt: undefined, isOrgAdminMember: true }), false);
});

test("só o org_admin membro de empresa não configurada é levado ao assistente", () => {
  assert.equal(needsOnboarding({ onboardedAt: null, isOrgAdminMember: true }), true);
  assert.equal(needsOnboarding({ onboardedAt: null, isOrgAdminMember: false }), false);
  assert.equal(needsOnboarding({ onboardedAt: "2026-09-23T00:00:00Z", isOrgAdminMember: true }), false);
});

test("progresso descarta chave desconhecida e valor inválido", () => {
  assert.deepEqual(
    parseOnboardingProgress({ empresa: "done", funil: "talvez", loja: "done", ia: "skipped" }),
    { empresa: "done", ia: "skipped" }
  );
  assert.deepEqual(parseOnboardingProgress(null), {});
  assert.deepEqual(parseOnboardingProgress(["empresa"]), {});
});

test("próximo passo é o primeiro sem decisão; pulado conta como decidido", () => {
  assert.equal(nextPendingStep({}), "empresa");
  assert.equal(nextPendingStep({ empresa: "done", funil: "skipped" }), "equipe");
  assert.equal(
    nextPendingStep({ empresa: "done", funil: "done", equipe: "done", whatsapp: "skipped", ia: "done" }),
    null
  );
});

test("navegação entre passos para nas pontas", () => {
  assert.equal(stepBefore("empresa"), null);
  assert.equal(stepAfter("empresa"), "funil");
  assert.equal(stepAfter("ia"), null);
});

test("segmento sugere o modelo mais específico", () => {
  assert.equal(templateForSegment("Corretor de imóveis").id, "imobiliaria");
  assert.equal(templateForSegment("Plano de Saúde").id, "corretora");
  assert.equal(templateForSegment("Clínica odontológica").id, "clinica");
  assert.equal(templateForSegment("CURSOS ONLINE").id, "educacao");
  assert.equal(templateForSegment("").id, "generico");
  assert.equal(templateForSegment(null).id, "generico");
  assert.equal(templateForSegment("fábrica de parafusos").id, "generico");
});

test("todo modelo pronto passa na própria validação", () => {
  for (const t of PIPELINE_TEMPLATES) {
    const r = validatePipelineDraft(t.pipeline);
    assert.equal(r.ok, true, `${t.id}: ${r.ok ? "" : r.error}`);
  }
});

test("validação reordena ganho e perda para o fim", () => {
  const r = validatePipelineDraft({
    name: "  Meu funil ",
    stages: [
      { name: "Perdido", kind: "lost" },
      { name: " Novo ", kind: "open" },
      { name: "Ganho", kind: "won" },
      { name: "Proposta", kind: "open" },
    ],
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.name, "Meu funil");
    assert.deepEqual(
      r.value.stages.map((s) => s.name),
      ["Novo", "Proposta", "Ganho", "Perdido"]
    );
  }
});

test("validação recusa funil que o banco recusaria", () => {
  const base = [
    { name: "Novo", kind: "open" },
    { name: "Ganho", kind: "won" },
    { name: "Perdido", kind: "lost" },
  ];
  const casos: Array<[string, unknown]> = [
    ["sem nome", { name: " ", stages: base }],
    ["etapa em branco", { name: "Funil", stages: [...base, { name: "  ", kind: "open" }] }],
    ["dois ganhos", { name: "Funil", stages: [...base, { name: "Ganho 2", kind: "won" }] }],
    ["sem perda", { name: "Funil", stages: [base[0], base[1], { name: "Outra", kind: "open" }] }],
    ["sem etapa aberta", { name: "Funil", stages: [base[1], base[2], { name: "X", kind: "won" }] }],
    ["nome repetido com acento", { name: "Funil", stages: [...base, { name: "NOVO", kind: "open" }] }],
    ["tipo inválido", { name: "Funil", stages: [...base, { name: "X", kind: "hack" }] }],
    ["poucas etapas", { name: "Funil", stages: [base[1], base[2]] }],
  ];
  for (const [rotulo, entrada] of casos) {
    assert.equal(validatePipelineDraft(entrada).ok, false, rotulo);
  }
});
