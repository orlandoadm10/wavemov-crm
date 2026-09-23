/**
 * Guarda da política de caminhos públicos do middleware.
 *
 *   npm run test:unit
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * `/api/forms` ficou de fora de `PUBLIC_PATHS` desde que a rota nasceu. O
 * efeito era silencioso: a submissão do formulário público era redirecionada
 * para `/login`, que responde **200 com HTML**, então `res.ok` ficava
 * verdadeiro, a página exibia "Recebido com sucesso" e nenhum lead era
 * gravado. Nenhum teste do projeto podia ver isso — o middleware não tinha
 * cobertura nenhuma.
 *
 * O teste tem duas partes, e é a segunda que importa mais:
 *   1. casos concretos, incluindo o que regrediu;
 *   2. uma varredura de `app/api/**` que FALHA diante de uma rota nova ainda
 *      não declarada. Não dá para adivinhar se uma rota futura deve ser
 *      pública; dá para obrigar quem a criou a decidir.
 */
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isPublicPath } from "./public-paths.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Decisão explícita para CADA rota de API do repositório.
 *
 * `true` = o middleware deixa passar sem sessão, porque a rota autentica por
 * conta própria. `false` = exige sessão do CRM.
 *
 * Acrescentar rota nova em `app/api/` sem acrescentá-la aqui quebra o teste
 * de propósito.
 */
const DECISAO_POR_ROTA: Record<string, boolean> = {
  // Preenchida pelo próprio lead, que não tem conta no CRM.
  "/api/forms/[slug]/submit": true,
  // Credencial por organização no cabeçalho x-webhook-secret (0014).
  "/api/ingest/leads": true,
  // Segredo por instância WhatsApp (0010).
  "/api/webhooks/uazapi": true,
  // Assinatura X-Hub-Signature-256 do app da Meta + phone_number_id (0027).
  "/api/webhooks/meta": true,
  // Bearer CRON_SECRET, comparado em tempo constante; recusa sem a variável.
  "/api/cron/automations": true,
  // Token de API por organização (0029); a organização sai do token.
  "/api/mcp": true,
  "/api/v1/contacts": true,
  "/api/v1/deals": true,
  "/api/v1/deals/[id]": true,
  "/api/v1/messages": true,
  "/api/v1/pipelines": true,
  "/api/v1/tools/[name]": true,
  // Drena a fila da empresa de quem está logado (após mover card no Kanban).
  "/api/automations/dispatch": false,
  // Operam sobre a sessão de quem está logado.
  "/api/session/logout": false,
  "/api/session/org": false,
  // Falam com a UAZAPI em nome de um membro autenticado.
  "/api/uazapi/instance": false,
  "/api/uazapi/send": false,
};

/** Caminhos de rota derivados de `app/api/**​/route.ts`. */
function listarRotasDeApi(dir: string, prefixo = "/api"): string[] {
  const rotas: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.isDirectory()) {
      rotas.push(...listarRotasDeApi(path.join(dir, entrada.name), `${prefixo}/${entrada.name}`));
    } else if (entrada.name === "route.ts") {
      rotas.push(prefixo);
    }
  }
  return rotas;
}

/** `/api/forms/[slug]/submit` → `/api/forms/qualquer-slug/submit` */
function comSegmentosConcretos(rota: string): string {
  return rota.replace(/\[[^\]]+\]/g, "valor-concreto");
}

test("toda rota de API do repositório tem decisão declarada", () => {
  const rotas = listarRotasDeApi(path.join(REPO, "app", "api")).sort();
  const declaradas = Object.keys(DECISAO_POR_ROTA).sort();
  assert.deepEqual(
    rotas,
    declaradas,
    "rota de API criada ou removida sem atualizar DECISAO_POR_ROTA — decida se ela exige sessão"
  );
});

test("cada rota de API se comporta como foi declarada", () => {
  for (const [rota, deveSerPublica] of Object.entries(DECISAO_POR_ROTA)) {
    const caminho = comSegmentosConcretos(rota);
    assert.equal(
      isPublicPath(caminho),
      deveSerPublica,
      `${caminho} deveria ser ${deveSerPublica ? "público" : "privado"}`
    );
  }
});

test("regressão: a submissão do formulário público NÃO pode cair no /login", () => {
  // Este é o caso exato que quebrou. `/login` responde 200 com HTML, então o
  // redirect não vira erro no `fetch` — vira "sucesso" com lead perdido.
  assert.equal(isPublicPath("/api/forms/meu-formulario/submit"), true);
});

test("páginas públicas e privadas", () => {
  for (const publico of ["/", "/login", "/register", "/f/meu-form", "/esqueci-senha", "/auth/confirmar"]) {
    assert.equal(isPublicPath(publico), true, `${publico} deveria ser público`);
  }
  for (const privado of [
    "/dashboard",
    "/negociacoes",
    "/negociacoes/abc-123",
    "/atendimento",
    "/formularios",
    "/funis",
    "/admin",
    "/perfil",
    // Exige a sessão criada pelo link do e-mail; sem ela, vai para o login.
    "/redefinir-senha",
  ]) {
    assert.equal(isPublicPath(privado), false, `${privado} deveria exigir sessão`);
  }
});

test("o casamento é por segmento — prefixo parecido não vira público", () => {
  // Sem a checagem de segmento, `startsWith("/api/forms")` deixaria passar
  // qualquer um destes: uma rota futura nasceria pública sem ninguém decidir.
  for (const impostor of [
    "/api/formsecretos",
    "/api/ingestao-interna",
    "/api/webhooksinternos",
    "/loginhack",
    "/registered",
    "/faturamento",
    "/authx",
    "/esqueci-senhas",
  ]) {
    assert.equal(isPublicPath(impostor), false, `${impostor} não deveria ser público`);
  }
});

test("a raiz é pública, mas nada que apenas comece com barra", () => {
  assert.equal(isPublicPath("/"), true);
  assert.equal(isPublicPath("/qualquer-coisa"), false);
});
