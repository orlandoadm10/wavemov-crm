/**
 * Verificação das migrations do Wavemov CRM.
 *
 *   npm run test:db
 *
 * Aplica `supabase/migrations/*.sql` do zero, na ordem, num Postgres
 * descartável (PGlite — Postgres real compilado para WASM, sem Docker e sem
 * tocar em nenhum banco de verdade) e roda asserções de comportamento por
 * cima: isolamento entre organizações, papéis, invariantes do funil padrão,
 * recusas de exclusão, coerência funil/etapa e idempotência.
 *
 * POR QUE ISTO EXISTE: o cliente executa o SQL manualmente no painel do
 * Supabase. Migration entregue sem teste é migration testada em produção.
 *
 * O ambiente Supabase é imitado com o mínimo necessário — o schema `auth`,
 * `auth.uid()` lendo um GUC e os papéis `anon`/`authenticated`/`service_role`/
 * `authenticator`. `pgcrypto` é removido do 0001 porque o PGlite não a traz e
 * `gen_random_uuid()` é core desde o Postgres 13.
 *
 * AO ADICIONAR UMA MIGRATION: rode este arquivo antes de entregar o SQL ao
 * cliente e acrescente asserções para as invariantes novas. Um teste que só
 * confirma que o SQL não tem erro de sintaxe não paga o que custa.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

let falhas = 0;
const ok = (m) => console.log(`  PASS  ${m}`);
const fail = (m, extra = "") => {
  falhas++;
  console.log(`  FAIL  ${m}${extra ? `\n        ${extra}` : ""}`);
};

const db = await PGlite.create();

// ------------------------------------------------------------
// Stub do ambiente Supabase (schema auth, auth.uid(), roles)
// ------------------------------------------------------------
await db.exec(`
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create or replace function auth.uid() returns uuid
  language sql stable as $fn$
    select nullif(current_setting('test.uid', true), '')::uuid
  $fn$;
  create role anon;
  create role authenticated;
  create role service_role;
  create role authenticator;
`);

// ------------------------------------------------------------
// Aplica 0001..0012 na ordem
// ------------------------------------------------------------
const arquivos = readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
for (const f of arquivos) {
  let sql = readFileSync(path.join(MIG, f), "utf8");
  // pgcrypto não vem no PGlite; gen_random_uuid() é core desde o PG13.
  sql = sql.replace(/create extension if not exists "pgcrypto";/, "");
  try {
    await db.exec(sql);
    console.log(`aplicada  ${f}`);
  } catch (e) {
    console.log(`ERRO em   ${f}\n  ${e.message}`);
    process.exit(1);
  }
}

console.log("\n== Idempotência: 0012 aplicada uma segunda vez ==");
try {
  await db.exec(readFileSync(path.join(MIG, "0012_funis_padrao_e_administracao.sql"), "utf8"));
  ok("0012 roda duas vezes sem erro");
} catch (e) {
  fail("0012 não é idempotente", e.message);
}

// ------------------------------------------------------------
// 0021 — publicação do Realtime
//
// O defeito que a 0021 corrige não aparece em nenhuma asserção de dado: a
// tabela existe, a policy existe, o insert funciona, e mesmo assim a tela não
// recebe o evento. A única prova possível é o catálogo — por isso ela está
// aqui, e não numa asserção de comportamento.
// ------------------------------------------------------------
console.log("\n== 0021: tabelas do atendimento no Realtime ==");
const publicadas = await db.query(
  `select tablename from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
    order by tablename`
);
const nomes = publicadas.rows.map((r) => r.tablename);
for (const t of ["whatsapp_conversations", "whatsapp_messages"]) {
  if (nomes.includes(t)) ok(`0021: ${t} publicada em supabase_realtime`);
  else fail(`0021: ${t} fora da publicação — a tela não recebe evento`, nomes.join(", "));
}

// `alter publication ... add table` numa tabela já publicada é erro. Reaplicar
// é o teste que prova que a guarda de catálogo funciona — e é a migration que
// o cliente pode rodar duas vezes por engano no painel.
try {
  await db.exec(readFileSync(path.join(MIG, "0021_realtime_do_atendimento.sql"), "utf8"));
  ok("0021 roda duas vezes sem erro");
} catch (e) {
  fail("0021 não é idempotente", e.message);
}

// ------------------------------------------------------------
// 0022 — índice da última entrada recebida
//
// A asserção que importa não é "o índice existe": é que ele é PARCIAL em
// `inbound`. Um índice cheio responderia à mesma consulta e passaria num teste
// de existência, gastando o dobro de espaço numa tabela que só cresce.
// ------------------------------------------------------------
console.log("\n== 0022: índice da última entrada recebida ==");
const indice = await db.query(
  `select indexdef from pg_indexes
    where schemaname = 'public' and indexname = 'whatsapp_messages_org_inbound_idx'`
);
if (indice.rows.length === 0) {
  fail("0022: índice whatsapp_messages_org_inbound_idx não existe");
} else {
  const def = indice.rows[0].indexdef;
  ok("0022: índice whatsapp_messages_org_inbound_idx criado");
  if (/where\s+\(?direction\s*=\s*'inbound'/i.test(def))
    ok("0022: o índice é parcial em direction = 'inbound'");
  else fail("0022: o índice não é parcial — gastaria o dobro à toa", def);
  if (/organization_id/.test(def) && /created_at\s+desc/i.test(def))
    ok("0022: chaveado por (organization_id, created_at desc)");
  else fail("0022: chave errada para `order by created_at desc limit 1` por empresa", def);
}

try {
  await db.exec(readFileSync(path.join(MIG, "0022_indice_da_ultima_entrada.sql"), "utf8"));
  ok("0022 roda duas vezes sem erro");
} catch (e) {
  fail("0022 não é idempotente", e.message);
}

// ------------------------------------------------------------
// 0023 — índice das tarefas pendentes por responsável
//
// A asserção que importa é `assigned_to` estar na chave: o índice que já
// existia (`tasks_org_idx`) tem organização, status e prazo, e passaria num
// teste ingênuo de "existe índice em tasks" — filtrando a pessoa linha a linha.
// ------------------------------------------------------------
console.log("\n== 0023: índice das tarefas do responsável ==");
const idxTarefas = await db.query(
  `select indexdef from pg_indexes
    where schemaname = 'public' and indexname = 'tasks_responsavel_pendentes_idx'`
);
if (idxTarefas.rows.length === 0) {
  fail("0023: índice tasks_responsavel_pendentes_idx não existe");
} else {
  const def = idxTarefas.rows[0].indexdef;
  ok("0023: índice tasks_responsavel_pendentes_idx criado");
  if (/where\s+\(?status\s*=\s*'pending'/i.test(def))
    ok("0023: o índice é parcial em status = 'pending'");
  else fail("0023: o índice não é parcial — carregaria todo o histórico concluído", def);
  if (/organization_id,\s*assigned_to,\s*due_at/i.test(def))
    ok("0023: chaveado por (organization_id, assigned_to, due_at)");
  else fail("0023: sem assigned_to no prefixo, a pessoa é filtrada linha a linha", def);
}

try {
  await db.exec(readFileSync(path.join(MIG, "0023_indice_das_tarefas_do_responsavel.sql"), "utf8"));
  ok("0023 roda duas vezes sem erro");
} catch (e) {
  fail("0023 não é idempotente", e.message);
}

// ------------------------------------------------------------
// Cenário: duas organizações, papéis distintos
// ------------------------------------------------------------
const uid = (nome) => db.query(`select id from auth.users where email = $1`, [nome]).then((r) => r.rows[0].id);

await db.exec(`
  insert into auth.users (email, raw_user_meta_data) values
    ('admin.a@teste.com', '{"first_name":"Ana"}'),
    ('seller.a@teste.com', '{"first_name":"Sergio"}'),
    ('admin.b@teste.com', '{"first_name":"Bruno"}');
`);

const adminA = await uid("admin.a@teste.com");
const sellerA = await uid("seller.a@teste.com");
const adminB = await uid("admin.b@teste.com");

const perfil = async (authId) =>
  (await db.query(`select id from public.profiles where auth_user_id = $1`, [authId])).rows[0].id;

const pAdminA = await perfil(adminA);
const pSellerA = await perfil(sellerA);
const pAdminB = await perfil(adminB);

await db.exec(`
  insert into public.organizations (id, name) values
    ('11111111-1111-1111-1111-111111111111', 'Empresa A'),
    ('22222222-2222-2222-2222-222222222222', 'Empresa B');
`);
const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";

await db.query(
  `insert into public.organization_members (organization_id, profile_id, role) values
     ($1,$2,'org_admin'), ($1,$3,'seller'), ($4,$5,'org_admin')`,
  [ORG_A, pAdminA, pSellerA, ORG_B, pAdminB]
);

// Funil inicial das duas empresas, pelo caminho de produção (0004)
await db.query(`select public.provision_organization_defaults($1)`, [ORG_A]);
await db.query(`select public.provision_organization_defaults($1)`, [ORG_B]);

const comoUsuario = async (authId, fn) => {
  await db.exec(`set role authenticated;`);
  await db.query(`select set_config('test.uid', $1, false)`, [authId]);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('test.uid', '', false);`);
  }
};

const esperaErro = async (label, fn, regex) => {
  try {
    await fn();
    fail(label, "nenhum erro foi levantado");
  } catch (e) {
    if (regex && !regex.test(e.message)) fail(label, `mensagem inesperada: ${e.message}`);
    else ok(`${label} — ${e.message.split("\n")[0]}`);
  }
};

const umaLinha = async (sql, params = []) => (await db.query(sql, params)).rows[0];

console.log("\n== 1. Backfill e invariante do padrão ==");
{
  const r = await umaLinha(
    `select count(*) filter (where is_default) as padroes, count(*) as total
       from public.pipelines where organization_id = $1`,
    [ORG_A]
  );
  if (Number(r.padroes) === 1 && Number(r.total) === 1) ok("primeiro funil da empresa nasce padrão");
  else fail("padrão do primeiro funil", JSON.stringify(r));
}

console.log("\n== 2. create_pipeline ==");
let pipeExtraA;
await comoUsuario(adminA, async () => {
  const r = await umaLinha(`select public.create_pipeline($1, $2, $3, true) as id`, [
    ORG_A,
    "  Funil Parcerias  ",
    "  Indicações  ",
  ]);
  pipeExtraA = r.id;
});
{
  const p = await umaLinha(`select name, description, is_default from public.pipelines where id = $1`, [pipeExtraA]);
  if (p.name === "Funil Parcerias" && p.description === "Indicações") ok("nome e descrição são normalizados (btrim)");
  else fail("normalização de nome/descrição", JSON.stringify(p));
  if (p.is_default === false) ok("funil adicional NÃO vira padrão");
  else fail("funil adicional virou padrão");

  const s = await umaLinha(
    `select count(*) as n,
            count(*) filter (where is_won_stage) as ganho,
            count(*) filter (where is_lost_stage) as perdido,
            count(*) filter (where not is_won_stage and not is_lost_stage) as abertas
       from public.pipeline_stages where pipeline_id = $1`,
    [pipeExtraA]
  );
  if (Number(s.n) === 3 && Number(s.ganho) === 1 && Number(s.perdido) === 1 && Number(s.abertas) === 1)
    ok("etapas padrão: Lead Novo + Ganho + Perdido");
  else fail("etapas padrão", JSON.stringify(s));
}

await comoUsuario(adminA, async () => {
  const r = await umaLinha(`select public.create_pipeline($1, $2, null, false) as id`, [ORG_A, "Sem etapas padrão"]);
  const s = await umaLinha(
    `select count(*) as n from public.pipeline_stages
      where pipeline_id = $1 and not is_won_stage and not is_lost_stage`,
    [r.id]
  );
  if (Number(s.n) === 1) ok("with_default_stages=false ainda cria uma etapa aberta (funil usável)");
  else fail("funil sem etapa aberta", JSON.stringify(s));
  await db.query(`select public.delete_pipeline($1)`, [r.id]);
});

console.log("\n== 3. Somente org_admin administra ==");
await comoUsuario(sellerA, () =>
  esperaErro(
    "seller não cria funil pela RPC",
    () => db.query(`select public.create_pipeline($1, 'Funil do seller', null, true)`, [ORG_A]),
    /administradores/i
  )
);
await comoUsuario(sellerA, () =>
  esperaErro(
    "seller não insere funil direto na tabela (RLS)",
    () => db.query(`insert into public.pipelines (organization_id, name) values ($1, 'Direto')`, [ORG_A]),
    /row-level security|policy/i
  )
);
await comoUsuario(sellerA, async () => {
  const r = await db.query(
    `update public.pipelines set name = 'Renomeado pelo seller' where organization_id = $1 returning id`,
    [ORG_A]
  );
  if (r.rows.length === 0) ok("seller não renomeia funil (update não atinge linha)");
  else fail("seller renomeou funil");

  const s = await db.query(
    `update public.pipeline_stages set name = 'Etapa do seller'
      where pipeline_id = $1 returning id`,
    [pipeExtraA]
  );
  if (s.rows.length === 0) ok("seller não edita etapas");
  else fail("seller editou etapas");

  const i = await db.query(
    `insert into public.pipeline_stages (pipeline_id, name) values ($1, 'Nova') returning id`,
    [pipeExtraA]
  ).then(() => "inseriu").catch((e) => e.message);
  if (i !== "inseriu") ok("seller não cria etapa");
  else fail("seller criou etapa");
});
await comoUsuario(sellerA, async () => {
  const r = await db.query(`select id, name from public.pipelines where organization_id = $1`, [ORG_A]);
  if (r.rows.length >= 2) ok(`seller continua LENDO os funis (${r.rows.length} visíveis)`);
  else fail("seller perdeu a leitura dos funis", JSON.stringify(r.rows));
});

console.log("\n== 4. Isolamento entre organizações ==");
await comoUsuario(adminA, () =>
  esperaErro(
    "org_admin de A não cria funil em B",
    () => db.query(`select public.create_pipeline($1, 'Invasor', null, true)`, [ORG_B]),
    /administradores/i
  )
);
{
  const pipeB = await umaLinha(`select id from public.pipelines where organization_id = $1`, [ORG_B]);
  await comoUsuario(adminA, () =>
    esperaErro(
      "org_admin de A não torna padrão um funil de B",
      () => db.query(`select public.set_default_pipeline($1)`, [pipeB.id]),
      /administradores/i
    )
  );
  await comoUsuario(adminA, () =>
    esperaErro(
      "org_admin de A não lê bloqueios de exclusão de B",
      () => db.query(`select * from public.pipeline_delete_blockers($1)`, [pipeB.id]),
      /administradores/i
    )
  );
  await comoUsuario(adminA, () =>
    esperaErro(
      "org_admin de A não exclui funil de B",
      () => db.query(`select public.delete_pipeline($1)`, [pipeB.id]),
      /administradores/i
    )
  );
}

console.log("\n== 5. Troca de padrão ==");
{
  const antes = await umaLinha(`select id from public.pipelines where organization_id = $1 and is_default`, [ORG_A]);
  await comoUsuario(adminA, () => db.query(`select public.set_default_pipeline($1)`, [pipeExtraA]));
  const depois = await db.query(
    `select id, is_default from public.pipelines where organization_id = $1 order by created_at`,
    [ORG_A]
  );
  const padroes = depois.rows.filter((r) => r.is_default);
  if (padroes.length === 1 && padroes[0].id === pipeExtraA) ok("set_default_pipeline move o padrão e mantém exatamente um");
  else fail("troca de padrão", JSON.stringify(depois.rows));

  await comoUsuario(adminA, () => db.query(`select public.set_default_pipeline($1)`, [pipeExtraA]));
  ok("set_default_pipeline é idempotente no funil que já é padrão");

  await comoUsuario(adminA, () => db.query(`select public.set_default_pipeline($1)`, [antes.id]));
}

console.log("\n== 6. is_default não muda por fora da RPC ==");
await esperaErro(
  "update direto de is_default é recusado pelo trigger",
  () => db.query(`update public.pipelines set is_default = true where id = $1`, [pipeExtraA]),
  /set_default_pipeline/i
);
await esperaErro(
  "desmarcar o padrão direto também é recusado",
  () => db.query(`update public.pipelines set is_default = false where organization_id = $1 and is_default`, [ORG_A]),
  /set_default_pipeline/i
);
await esperaErro(
  "funil não muda de organização",
  () => db.query(`update public.pipelines set organization_id = $1 where id = $2`, [ORG_B, pipeExtraA]),
  /mudar de organização/i
);
await esperaErro(
  "insert com is_default forçado não cria segundo padrão",
  async () => {
    await db.query(`insert into public.pipelines (organization_id, name, is_default) values ($1, 'Forçado', true)`, [ORG_A]);
    const r = await umaLinha(
      `select count(*) filter (where is_default) as n from public.pipelines where organization_id = $1`,
      [ORG_A]
    );
    if (Number(r.n) !== 1) throw new Error(`padrões na empresa A: ${r.n}`);
    throw new Error("insert normalizado para is_default = false");
  },
  /normalizado/
);

console.log("\n== 7. Exclusão de funil ==");
{
  // reaproveita o funil 'Forçado' (criado no teste 6) como alvo dos testes
  const forcado = await umaLinha(`select id from public.pipelines where name = 'Forçado'`);
  await esperaErro(
    "chamada sem sessão autenticada é recusada",
    () => db.query(`select public.delete_pipeline($1)`, [forcado.id]),
    /administradores/i
  );
  await comoUsuario(adminA, () =>
    esperaErro(
      "excluir o funil padrão é recusado",
      () =>
        db.query(
          `select public.delete_pipeline((select id from public.pipelines where organization_id = $1 and is_default))`,
          [ORG_A]
        ),
      /padrão/i
    )
  );
  await esperaErro(
    "delete direto do funil padrão também é recusado (trigger)",
    () => db.query(`delete from public.pipelines where organization_id = $1 and is_default`, [ORG_A]),
    /padrão/i
  );

  // Funil com negociação vinculada
  const stage = await umaLinha(
    `select id from public.pipeline_stages where pipeline_id = $1 order by order_index limit 1`,
    [pipeExtraA]
  );
  await db.query(
    `insert into public.deals (organization_id, pipeline_id, stage_id, responsible_id, title)
     values ($1, $2, $3, $4, 'Lead de teste')`,
    [ORG_A, pipeExtraA, stage.id, pSellerA]
  );
  await comoUsuario(adminA, async () => {
    const b = await umaLinha(`select * from public.pipeline_delete_blockers($1)`, [pipeExtraA]);
    if (Number(b.deals_count) === 1 && Number(b.forms_count) === 0 && b.is_default === false && b.is_last_pipeline === false)
      ok("pipeline_delete_blockers informa 1 negociação e nenhum formulário");
    else fail("pipeline_delete_blockers", JSON.stringify(b));
  });
  await comoUsuario(adminA, () =>
    esperaErro(
      "delete_pipeline recusa funil com negociação",
      () => db.query(`select public.delete_pipeline($1)`, [pipeExtraA]),
      /negociaç/i
    )
  );
  await esperaErro(
    "delete direto é barrado pela FK restrict (deals)",
    () => db.query(`delete from public.pipelines where id = $1`, [pipeExtraA]),
    /foreign key|violates/i
  );
  {
    const d = await umaLinha(`select count(*) as n from public.deals where pipeline_id = $1`, [pipeExtraA]);
    if (Number(d.n) === 1) ok("a negociação continua intacta depois das tentativas");
    else fail("negociação sumiu", JSON.stringify(d));
  }

  // Funil usado por formulário
  let pipeForms;
  await comoUsuario(adminA, async () => {
    pipeForms = (await umaLinha(`select public.create_pipeline($1, 'Funil de captura', null, true) as id`, [ORG_A])).id;
  });
  await db.query(
    `insert into public.forms (organization_id, name, slug, pipeline_id)
     values ($1, 'Captura', 'captura-teste', $2)`,
    [ORG_A, pipeForms]
  );
  await comoUsuario(adminA, () =>
    esperaErro(
      "delete_pipeline recusa funil usado por formulário",
      () => db.query(`select public.delete_pipeline($1)`, [pipeForms]),
      /formulário/i
    )
  );
  await esperaErro(
    "delete direto é barrado pela FK restrict (forms)",
    () => db.query(`delete from public.pipelines where id = $1`, [pipeForms]),
    /foreign key|violates/i
  );
  {
    const f = await umaLinha(`select pipeline_id from public.forms where slug = 'captura-teste'`);
    if (f.pipeline_id === pipeForms) ok("o formulário continua apontando para o funil (nada foi desassociado)");
    else fail("formulário foi desassociado", JSON.stringify(f));
  }

  // Formulário que aponta só para uma ETAPA do funil (forms.stage_id é set null)
  const stageForms = await umaLinha(`select id from public.pipeline_stages where pipeline_id = $1 limit 1`, [pipeForms]);
  await db.query(`update public.forms set pipeline_id = null, stage_id = $1 where slug = 'captura-teste'`, [
    stageForms.id,
  ]);
  await comoUsuario(adminA, () =>
    esperaErro(
      "delete_pipeline recusa funil cuja ETAPA é usada por formulário",
      () => db.query(`select public.delete_pipeline($1)`, [pipeForms]),
      /formulário/i
    )
  );
  await db.query(`delete from public.forms where slug = 'captura-teste'`);
  await comoUsuario(adminA, async () => {
    await db.query(`select public.delete_pipeline($1)`, [pipeForms]);
    const r = await umaLinha(`select count(*) as n from public.pipelines where id = $1`, [pipeForms]);
    if (Number(r.n) === 0) ok("sem vínculos, delete_pipeline exclui o funil (e as etapas em cascata)");
    else fail("funil livre não foi excluído");
  });
  {
    const forcadoAindaLa = await umaLinha(`select count(*) as n from public.pipelines where id = $1`, [forcado.id]);
    if (Number(forcadoAindaLa.n) === 1) ok("os demais funis da empresa seguem intactos");
    else fail("funil vizinho sumiu");
  }
}

console.log("\n== 8. Último funil da organização ==");
{
  const pipeB = await umaLinha(`select id from public.pipelines where organization_id = $1`, [ORG_B]);
  await comoUsuario(adminB, () =>
    esperaErro(
      "não é possível excluir o único funil da empresa",
      () => db.query(`select public.delete_pipeline($1)`, [pipeB.id]),
      /padrão|pelo menos um funil/i
    )
  );
  // Segundo funil em B: o primeiro continua padrão, então o guard de
  // "último funil" só aparece depois que o padrão muda de lugar.
  let pipeB2;
  await comoUsuario(adminB, async () => {
    pipeB2 = (await umaLinha(`select public.create_pipeline($1, 'Segundo de B', null, true) as id`, [ORG_B])).id;
    await db.query(`select public.set_default_pipeline($1)`, [pipeB2]);
    await db.query(`select public.delete_pipeline($1)`, [pipeB.id]);
    const r = await umaLinha(
      `select count(*) as n, count(*) filter (where is_default) as padroes
         from public.pipelines where organization_id = $1`,
      [ORG_B]
    );
    if (Number(r.n) === 1 && Number(r.padroes) === 1)
      ok("trocar o padrão e excluir o antigo deixa a empresa com um funil, ainda padrão");
    else fail("estado final da empresa B", JSON.stringify(r));
  });
  await comoUsuario(adminB, () =>
    esperaErro(
      "e o último funil restante volta a ser inexcluível",
      () => db.query(`select public.delete_pipeline($1)`, [pipeB2]),
      /padrão|pelo menos um funil/i
    )
  );
}

console.log("\n== 9. Exclusão da organização (cascata) ==");
{
  await db.exec(`insert into public.organizations (id, name) values ('33333333-3333-3333-3333-333333333333','Empresa C');`);
  await db.query(`select public.provision_organization_defaults('33333333-3333-3333-3333-333333333333')`);
  try {
    await db.exec(`delete from public.organizations where id = '33333333-3333-3333-3333-333333333333';`);
    ok("excluir organização sem negociações continua funcionando (cascata do funil padrão)");
  } catch (e) {
    fail("cascata da exclusão de organização", e.message);
  }
}

console.log("\n== 10. Metadados do schema ==");
{
  const fks = await db.query(`
    select rel.relname as tabela, con.conname, con.confdeltype
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where con.confrelid = 'public.pipelines'::regclass and con.contype = 'f'
     order by 1`);
  for (const row of fks.rows) {
    const esperado = row.tabela === "deals" || row.tabela === "forms" ? "r" : null;
    if (esperado && row.confdeltype === esperado) ok(`${row.tabela}.pipeline_id -> on delete restrict`);
    else if (esperado) fail(`${row.tabela}.pipeline_id`, `confdeltype = ${row.confdeltype}`);
  }
  const idx = await db.query(
    `select indexdef from pg_indexes where tablename = 'pipelines' and indexname = 'pipelines_default_por_org_idx'`
  );
  if (idx.rows.length === 1 && /unique/i.test(idx.rows[0].indexdef)) ok("índice único parcial do padrão existe");
  else fail("índice único parcial ausente", JSON.stringify(idx.rows));

  const pol = await db.query(
    `select tablename, policyname, cmd from pg_policies
      where tablename in ('pipelines','pipeline_stages') order by tablename, cmd`
  );
  console.log("        policies:", pol.rows.map((r) => `${r.tablename}/${r.cmd}: ${r.policyname}`).join(" | "));

  const priv = await db.query(`
    select p.proname,
           has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('create_pipeline','set_default_pipeline','delete_pipeline','pipeline_delete_blockers')
     order by 1`);
  for (const r of priv.rows) {
    if (!r.anon && r.auth) ok(`${r.proname}: anon sem execute, authenticated com execute`);
    else fail(`privilégios de ${r.proname}`, JSON.stringify(r));
  }
}

console.log("\n== 11. Coerência funil/etapa/organização (0013) ==");
{
  const pipeB = await umaLinha(`select id from public.pipelines where organization_id = $1`, [ORG_B]);
  const stageB = await umaLinha(`select id from public.pipeline_stages where pipeline_id = $1 limit 1`, [pipeB.id]);
  const dealA = await umaLinha(`select id, pipeline_id, stage_id from public.deals where organization_id = $1 limit 1`, [
    ORG_A,
  ]);

  await esperaErro(
    "lead da empresa A não aceita funil da empresa B",
    () => db.query(`update public.deals set pipeline_id = $1 where id = $2`, [pipeB.id, dealA.id]),
    /não pertence à organização/i
  );
  await esperaErro(
    "lead não aceita etapa de outro funil",
    () => db.query(`update public.deals set stage_id = $1 where id = $2`, [stageB.id, dealA.id]),
    /não pertence ao funil/i
  );
  await esperaErro(
    "insert incoerente também é recusado",
    () =>
      db.query(
        `insert into public.deals (organization_id, pipeline_id, stage_id, title) values ($1, $2, $3, 'Incoerente')`,
        [ORG_A, dealA.pipeline_id, stageB.id]
      ),
    /não pertence ao funil/i
  );
  {
    const d = await umaLinha(`select pipeline_id, stage_id from public.deals where id = $1`, [dealA.id]);
    if (d.pipeline_id === dealA.pipeline_id && d.stage_id === dealA.stage_id)
      ok("o lead continua no funil e na etapa originais");
    else fail("lead foi alterado apesar das recusas", JSON.stringify(d));
  }

  // Movimentação legítima continua passando
  const outraEtapaA = await umaLinha(
    `select id from public.pipeline_stages where pipeline_id = $1 and id <> $2 limit 1`,
    [dealA.pipeline_id, dealA.stage_id]
  ).catch(() => null);
  if (outraEtapaA) {
    try {
      await db.query(`update public.deals set stage_id = $1 where id = $2`, [outraEtapaA.id, dealA.id]);
      ok("mover o lead para outra etapa do mesmo funil continua funcionando");
    } catch (e) {
      fail("movimentação legítima foi bloqueada", e.message);
    }
  }
}

console.log("\n== 12. Primeiro funil de uma empresa sem nenhum (estado vazio de /funis) ==");
{
  const ORG_D = "44444444-4444-4444-4444-444444444444";
  await db.exec(`insert into public.organizations (id, name) values ('${ORG_D}', 'Empresa D');`);
  await db.exec(`insert into auth.users (email, raw_user_meta_data) values ('admin.d@teste.com', '{}');`);
  const adminD = await uid("admin.d@teste.com");
  const pAdminD = await perfil(adminD);
  await db.query(
    `insert into public.organization_members (organization_id, profile_id, role) values ($1,$2,'org_admin')`,
    [ORG_D, pAdminD]
  );

  const semFunil = await umaLinha(`select count(*) as n from public.pipelines where organization_id = $1`, [ORG_D]);
  if (Number(semFunil.n) === 0) ok("empresa começa sem funil nenhum");
  else fail("empresa não estava vazia", JSON.stringify(semFunil));

  await comoUsuario(adminD, async () => {
    const r = await umaLinha(`select public.create_pipeline($1, 'Funil Inicial', 'Primeiro da empresa', true) as id`, [
      ORG_D,
    ]);
    const p = await umaLinha(`select name, description, is_default from public.pipelines where id = $1`, [r.id]);
    if (p.is_default === true) ok("o primeiro funil da empresa nasce padrão");
    else fail("primeiro funil não virou padrão", JSON.stringify(p));

    const s = await umaLinha(
      `select count(*) as n from public.pipeline_stages where pipeline_id = $1 and not is_won_stage and not is_lost_stage`,
      [r.id]
    );
    if (Number(s.n) >= 1) ok("o funil já nasce com etapa aberta (aceita lead na hora)");
    else fail("funil nasceu sem etapa aberta");

    // Segundo funil da mesma empresa não pode tomar o posto de padrão
    const r2 = await umaLinha(`select public.create_pipeline($1, 'Segundo de D', null, true) as id`, [ORG_D]);
    const padroes = await umaLinha(
      `select count(*) filter (where is_default) as n from public.pipelines where organization_id = $1`,
      [ORG_D]
    );
    if (Number(padroes.n) === 1) ok("criar um segundo funil mantém exatamente um padrão");
    else fail("padrões após o segundo funil", JSON.stringify(padroes));

    // Renomear (o caminho do modal Renomear, que é update direto sob RLS)
    const ren = await db.query(
      `update public.pipelines set name = 'Renomeado', description = null where id = $1 and organization_id = $2 returning id`,
      [r2.id, ORG_D]
    );
    if (ren.rows.length === 1) ok("org_admin renomeia o funil pelo update direto");
    else fail("renomear não atingiu linha");
  });

  // O id é obtido fora da sessão do seller de propósito: sob RLS ele nem
  // enxerga o funil de outra empresa, e o teste precisa provar que, mesmo
  // conhecendo o UUID, a escrita não atinge linha nenhuma.
  const alvoD = await umaLinha(`select id from public.pipelines where organization_id = $1 limit 1`, [ORG_D]);
  await comoUsuario(sellerA, async () => {
    const leitura = await db.query(`select id from public.pipelines where organization_id = $1`, [ORG_D]);
    if (leitura.rows.length === 0) ok("seller da empresa A não LÊ funis da empresa D");
    else fail("seller leu funis de outra empresa", JSON.stringify(leitura.rows));

    const r = await db.query(
      `update public.pipelines set name = 'Invadido' where id = $1 and organization_id = $2 returning id`,
      [alvoD.id, ORG_D]
    );
    if (r.rows.length === 0) ok("e não renomeia, mesmo conhecendo o UUID");
    else fail("seller renomeou funil de outra empresa");
  });
}

console.log("\n== 13. Ingestão externa de leads (0014) ==");
{
  // As organizações deste arquivo nascem DEPOIS das migrations, então não
  // passaram pelo backfill do bloco 5 da 0014 — é exatamente o caso da
  // empresa criada em produção depois da migration, cujo segredo é criado
  // sob demanda pela tela. O teste faz o mesmo caminho.
  await db.query(`insert into public.organization_ingest_secrets (organization_id) values ($1), ($2)`, [ORG_A, ORG_B]);

  const segredos = await db.query(
    `select organization_id, secret from public.organization_ingest_secrets where organization_id in ($1,$2)`,
    [ORG_A, ORG_B]
  );
  const valores = segredos.rows.map((r) => r.secret);
  if (valores.length === 2 && valores[0] !== valores[1] && valores.every((s) => s.startsWith("wmv_")))
    ok("cada organização recebe um segredo próprio, com o prefixo wmv_");
  else fail("segredos gerados", JSON.stringify(segredos.rows));

  // O lookup da rota: o segredo resolve UMA organização, sempre.
  const dono = await umaLinha(`select organization_id from public.organization_ingest_secrets where secret = $1`, [
    valores[0],
  ]);
  if (dono && segredos.rows.some((r) => r.organization_id === dono.organization_id))
    ok("o segredo resolve exatamente uma organização (lookup da rota de ingestão)");
  else fail("segredo não resolveu a organização");

  await esperaErro(
    "dois segredos iguais são recusados pelo índice único",
    () =>
      db.query(`update public.organization_ingest_secrets set secret = $1 where organization_id = $2`, [
        valores[0],
        ORG_B,
      ]),
    /organization_ingest_secrets_secret_key|duplicate/i
  );

  // O ativo mais sensível da migration: membro logado não pode chegar perto.
  await comoUsuario(adminA, async () => {
    await esperaErro(
      "org_admin autenticado NÃO lê a tabela de segredos pelo PostgREST",
      () => db.query(`select secret from public.organization_ingest_secrets`),
      /permission denied|permissão/i
    );
  });
  await comoUsuario(sellerA, async () => {
    await esperaErro(
      "seller tampouco — nem o segredo da própria empresa",
      () => db.query(`select secret from public.organization_ingest_secrets where organization_id = $1`, [ORG_A]),
      /permission denied|permissão/i
    );
  });

  // ---- forms.external_id ----
  const funilA = await umaLinha(`select id from public.pipelines where organization_id = $1 and is_default`, [ORG_A]);
  const funilB = await umaLinha(`select id from public.pipelines where organization_id = $1 and is_default`, [ORG_B]);

  const formA = await umaLinha(
    `insert into public.forms (organization_id, name, slug, pipeline_id, external_id)
       values ($1, 'Meta Lead Ads', 'meta-lead-ads-a', $2, 'meta-lead-ads') returning id`,
    [ORG_A, funilA.id]
  );
  ok("formulário da empresa A nasce com external_id");

  // O ponto que o handoff manda nunca vazar: a colisão é global, e a empresa
  // B só pode saber que o identificador está ocupado — jamais por quem.
  await esperaErro(
    "empresa B não consegue reutilizar o external_id da empresa A",
    () =>
      db.query(
        `insert into public.forms (organization_id, name, slug, pipeline_id, external_id)
           values ($1, 'Copia', 'copia-b', $2, 'meta-lead-ads')`,
        [ORG_B, funilB.id]
      ),
    /forms_external_id_key|duplicate/i
  );

  // Maiúscula NÃO está nesta lista: a 0015 passou a aceitá-la (ids do Typeform
  // e do Meta são colados como estão). A suíte aplica todas as migrations e só
  // então assere, então o que vale aqui é a regra final — o bloco 14 cobre a
  // caixa alta pelo lado positivo.
  for (const invalido of ["com espaco", "ab", "-comeca-com-hifen", "acentuaç"]) {
    await esperaErro(
      `external_id inválido recusado: ${JSON.stringify(invalido)}`,
      () =>
        db.query(
          `insert into public.forms (organization_id, name, slug, pipeline_id, external_id)
             values ($1, 'Invalido', $2, $3, $4)`,
          [ORG_A, `slug-${Math.random().toString(36).slice(2)}`, funilA.id, invalido]
        ),
      /forms_external_id_format/i
    );
  }

  const semExternal = await db.query(
    `insert into public.forms (organization_id, name, slug, pipeline_id)
       values ($1, 'Publico 1', 'publico-1', $2), ($1, 'Publico 2', 'publico-2', $2) returning id`,
    [ORG_A, funilA.id]
  );
  if (semExternal.rows.length === 2)
    ok("vários formulários sem external_id convivem (o único é parcial)");
  else fail("formulários sem external_id colidiram");

  // ---- Idempotência por formulário + evento ----
  const formB = await umaLinha(
    `insert into public.forms (organization_id, name, slug, pipeline_id, external_id)
       values ($1, 'Planilha', 'planilha-b', $2, 'planilha-b') returning id`,
    [ORG_B, funilB.id]
  );

  const sub1 = await umaLinha(
    `insert into public.form_submissions (form_id, raw_data, external_event_id, source)
       values ($1, '{}'::jsonb, 'evt-1', 'external_ingest') returning id, source`,
    [formA.id]
  );
  ok("primeira entrega do evento evt-1 grava a submissão");

  await esperaErro(
    "reentrega do MESMO evento no MESMO formulário é recusada (idempotência)",
    () =>
      db.query(
        `insert into public.form_submissions (form_id, raw_data, external_event_id, source)
           values ($1, '{}'::jsonb, 'evt-1', 'external_ingest')`,
        [formA.id]
      ),
    /form_submissions_form_event_key|duplicate/i
  );

  const original = await umaLinha(
    `select id from public.form_submissions where form_id = $1 and external_event_id = 'evt-1'`,
    [formA.id]
  );
  if (original.id === sub1.id) ok("a reentrega reencontra a submissão original (a rota devolve o mesmo resultado)");
  else fail("submissão original não foi reencontrada");

  // A razão de a chave ser o PAR: fluxos diferentes reutilizam identificador.
  const sub2 = await db.query(
    `insert into public.form_submissions (form_id, raw_data, external_event_id, source)
       values ($1, '{}'::jsonb, 'evt-1', 'external_ingest') returning id`,
    [formB.id]
  );
  if (sub2.rows.length === 1)
    ok("o mesmo evt-1 em OUTRO formulário entra normalmente (chave é formulário + evento)");
  else fail("evento de outro formulário foi recusado");

  const publicas = await db.query(
    `insert into public.form_submissions (form_id, raw_data)
       values ($1, '{}'::jsonb), ($1, '{}'::jsonb) returning id, source, external_event_id`,
    [formA.id]
  );
  if (publicas.rows.length === 2 && publicas.rows.every((r) => r.source === "public_form" && r.external_event_id === null))
    ok("submissões da página pública continuam entrando sem chave de evento, com source public_form");
  else fail("submissões públicas", JSON.stringify(publicas.rows));

  await esperaErro(
    "source fora do domínio é recusado",
    () =>
      db.query(`insert into public.form_submissions (form_id, raw_data, source) values ($1, '{}'::jsonb, 'sei-la')`, [
        formA.id,
      ]),
    /form_submissions_source_check/i
  );

  // Isolamento de leitura das submissões continua valendo com as colunas novas.
  await comoUsuario(sellerA, async () => {
    const r = await db.query(`select id from public.form_submissions where form_id = $1`, [formB.id]);
    if (r.rows.length === 0) ok("seller da empresa A não lê submissões de formulário da empresa B");
    else fail("vazamento de submissões entre organizações", JSON.stringify(r.rows));
  });

  // Sai limpo: o bloco 9 (cascata) e futuros blocos não devem herdar estes dados.
  await db.query(`delete from public.form_submissions where form_id in ($1,$2)`, [formA.id, formB.id]);
  await db.query(`delete from public.forms where organization_id in ($1,$2)`, [ORG_A, ORG_B]);
}

console.log("\n== 14. Respostas do lead e external_id com maiúscula (0015) ==");
{
  const ORG_E = "55555555-5555-5555-5555-555555555555";
  await db.exec(`insert into public.organizations (id, name) values ('${ORG_E}', 'Empresa E');`);
  await db.query(`select public.provision_organization_defaults($1)`, [ORG_E]);
  const funilE = await umaLinha(`select id from public.pipelines where organization_id = $1 and is_default`, [ORG_E]);

  // ---- external_id com maiúscula (ids reais de Typeform e Meta) ----
  const reais = [
    ["xtehq3ca", "typeform minúsculo"],
    ["2432052590537853", "form_id numérico do Meta"],
    ["XtehQ3ca", "typeform com maiúsculas"],
    ["Meta_Lead-Ads01", "misto com sublinhado e hífen"],
  ];
  for (const [indice, [valor, rotulo]] of reais.entries()) {
    try {
      // O slug precisa ser único por linha e NÃO pode derivar do external_id:
      // `XtehQ3ca` e `xtehq3ca` são ids distintos, mas colidiriam em minúsculas.
      await db.query(
        `insert into public.forms (organization_id, name, slug, pipeline_id, external_id)
           values ($1, $2, $3, $4, $5)`,
        [ORG_E, `F ${valor}`, `slug-real-${indice}`, funilE.id, valor]
      );
      ok(`external_id aceito: ${valor} (${rotulo})`);
    } catch (e) {
      fail(`external_id deveria ser aceito: ${valor}`, e.message);
    }
  }

  // A decisão do cliente: caixa DIFERENCIA. `xtehq3ca` já existe acima.
  const caixa = await db.query(
    `insert into public.forms (organization_id, name, slug, pipeline_id, external_id)
       values ($1, 'Caixa alta total', 'slug-caixa-alta', $2, 'XTEHQ3CA') returning external_id`,
    [ORG_E, funilE.id]
  );
  if (caixa.rows.length === 1)
    ok("caixa diferencia: XTEHQ3CA convive com xtehq3ca (comportamento pedido — colar com a caixa errada dá 404)");
  else fail("o único deveria ser sensível a caixa");

  // O que continua recusado depois de abrir para maiúsculas
  for (const invalido of ["com espaco", "ab", "-comeca-com-hifen", "acentuaç", "tem.ponto"]) {
    await esperaErro(
      `external_id ainda recusado: ${JSON.stringify(invalido)}`,
      () =>
        db.query(
          `insert into public.forms (organization_id, name, slug, pipeline_id, external_id)
             values ($1, 'Invalido', $2, $3, $4)`,
          [ORG_E, `slug-${Math.random().toString(36).slice(2)}`, funilE.id, invalido]
        ),
      /forms_external_id_format/i
    );
  }

  // ---- metadata ----
  const formE = await umaLinha(`select id from public.forms where external_id = 'xtehq3ca'`);

  const semMeta = await umaLinha(
    `insert into public.form_submissions (form_id, raw_data) values ($1, '{}'::jsonb) returning metadata`,
    [formE.id]
  );
  if (JSON.stringify(semMeta.metadata) === "{}")
    ok("submissão sem metadata recebe objeto vazio, nunca nulo (histórico anterior à 0015 segue válido)");
  else fail("default de metadata", JSON.stringify(semMeta.metadata));

  // O payload real do Typeform: bloco de respostas em uma única string.
  const rLista =
    "Qual é o seu email?: adm@teste.com\nPOSSUI CNPJ?: MEI\nQUAL A QUANTIDADE DE VIDAS PARA COTAÇÃO?: 4 vidas";
  const comMeta = await umaLinha(
    `insert into public.form_submissions (form_id, raw_data, metadata, external_event_id, source)
       values ($1, '{}'::jsonb, $2::jsonb, 'evt-typeform', 'external_ingest')
       returning metadata`,
    [formE.id, JSON.stringify({ r_lista: rLista, utm: "", typeform_response_id: "g3uuml" })]
  );
  if (comMeta.metadata.r_lista === rLista)
    ok("metadata guarda o bloco de respostas como veio, com quebras de linha e acentos intactos");
  else fail("metadata alterou o conteúdo", JSON.stringify(comMeta.metadata));

  // metadata NÃO passa por form_fields: o formulário não tem campo nenhum
  // cadastrado e mesmo assim as respostas ficaram gravadas.
  const campos = await umaLinha(`select count(*) as n from public.form_fields where form_id = $1`, [formE.id]);
  if (Number(campos.n) === 0 && Object.keys(comMeta.metadata).length === 3)
    ok("metadata não é sanitizado contra form_fields (formulário sem campos preservou as 3 chaves)");
  else fail("sanitização indevida de metadata", JSON.stringify(comMeta.metadata));

  // Isolamento continua valendo para as colunas novas.
  await comoUsuario(sellerA, async () => {
    const r = await db.query(`select metadata from public.form_submissions where form_id = $1`, [formE.id]);
    if (r.rows.length === 0) ok("seller da empresa A não lê metadata de submissão da empresa E");
    else fail("vazamento de metadata entre organizações", JSON.stringify(r.rows));
  });

  await db.query(`delete from public.form_submissions where form_id = $1`, [formE.id]);
  await db.query(`delete from public.forms where organization_id = $1`, [ORG_E]);
}

console.log("\n== 15. Distribuição automática de leads (0016) ==");
{
  // ---- Backfill ----
  const regraA = await umaLinha(
    `select id, name, is_fallback, priority, method, assignments_count
       from public.lead_distribution_rules where organization_id = $1`,
    [ORG_A]
  );
  // O método é o da 0017: a 0016 nasceu com `weighted_round_robin` e a suíte
  // aplica todas as migrations antes de asserir, então o que vale é a regra
  // final.
  if (regraA && regraA.is_fallback === true && regraA.method === "ordered_queue")
    ok("organização com membros elegíveis nasceu com regra padrão ativa");
  else fail("backfill da regra padrão", JSON.stringify(regraA));

  const participantesA = await db.query(
    `select p.profile_id, p.weight, p.is_active
       from public.lead_distribution_participants p where p.rule_id = $1`,
    [regraA.id]
  );
  // Empresa A tem org_admin + seller ativos; `viewer` não existe nela.
  if (participantesA.rows.length === 2 && participantesA.rows.every((r) => r.weight === 1))
    ok("todos os membros elegíveis entraram no rodízio com peso 1");
  else fail("participantes do backfill", JSON.stringify(participantesA.rows));

  // ---- Invariantes da regra ----
  await esperaErro(
    "duas regras padrão na mesma organização são recusadas",
    () =>
      db.query(
        `insert into public.lead_distribution_rules (organization_id, name, is_fallback)
           values ($1, 'Outra padrão', true)`,
        [ORG_A]
      ),
    /lead_distribution_rules_fallback_key|duplicate/i
  );

  await esperaErro(
    "regra padrão com condição é recusada (ela existe para pegar o resto)",
    () =>
      db.query(
        `update public.lead_distribution_rules set origin = 'external_ingest' where id = $1`,
        [regraA.id]
      ),
    /regra padrão não pode ter condições/i
  );

  await esperaErro(
    "método inexistente é recusado",
    () =>
      db.query(
        `insert into public.lead_distribution_rules (organization_id, name, method)
           values ($1, 'Invalida', 'sorteio')`,
        [ORG_A]
      ),
    /lead_distribution_rules_method_check|check constraint/i
  );

  await esperaErro(
    "origem fora do domínio é recusada",
    () =>
      db.query(
        `insert into public.lead_distribution_rules (organization_id, name, origin)
           values ($1, 'Invalida', 'telepatia')`,
        [ORG_A]
      ),
    /origin_check|check constraint/i
  );

  // ---- A guarda que impede vínculo entre organizações ----
  const funilB2 = await umaLinha(
    `select id from public.pipelines where organization_id = $1 limit 1`,
    [ORG_B]
  );
  const formB2 = await umaLinha(
    `insert into public.forms (organization_id, name, slug, pipeline_id)
       values ($1, 'Form da B', 'form-da-b-0016', $2) returning id`,
    [ORG_B, funilB2.id]
  );
  await esperaErro(
    "regra da empresa A não pode condicionar ao formulário da empresa B",
    () =>
      db.query(
        `insert into public.lead_distribution_rules (organization_id, name, form_id)
           values ($1, 'Cruzada', $2)`,
        [ORG_A, formB2.id]
      ),
    /não pertence a esta organização/i
  );

  // ---- A guarda dos participantes ----
  const pAdminBLocal = await perfil(adminB);
  await esperaErro(
    "membro de outra organização não entra no rodízio",
    () =>
      db.query(
        `insert into public.lead_distribution_participants (rule_id, profile_id) values ($1, $2)`,
        [regraA.id, pAdminBLocal]
      ),
    /não é membro desta organização/i
  );

  await esperaErro(
    "peso fora de 1..100 é recusado",
    () =>
      db.query(
        `update public.lead_distribution_participants set weight = 10000 where rule_id = $1`,
        [regraA.id]
      ),
    /weight_check|check constraint/i
  );

  // `viewer` não pode receber lead: ele não consegue trabalhar o registro.
  await db.exec(`insert into auth.users (email, raw_user_meta_data) values ('viewer.a@teste.com', '{}');`);
  const viewerA = await uid("viewer.a@teste.com");
  const pViewerA = await perfil(viewerA);
  await db.query(
    `insert into public.organization_members (organization_id, profile_id, role) values ($1,$2,'viewer')`,
    [ORG_A, pViewerA]
  );
  await esperaErro(
    "perfil somente leitura não entra no rodízio",
    () =>
      db.query(
        `insert into public.lead_distribution_participants (rule_id, profile_id) values ($1, $2)`,
        [regraA.id, pViewerA]
      ),
    /somente leitura não pode receber leads/i
  );

  // Membro inativo também não.
  await db.query(
    `update public.organization_members set is_active = false where organization_id = $1 and profile_id = $2`,
    [ORG_A, pViewerA]
  );
  await db.query(
    `update public.organization_members set role = 'seller' where organization_id = $1 and profile_id = $2`,
    [ORG_A, pViewerA]
  );
  await esperaErro(
    "membro inativo não entra no rodízio",
    () =>
      db.query(
        `insert into public.lead_distribution_participants (rule_id, profile_id) values ($1, $2)`,
        [regraA.id, pViewerA]
      ),
    /está inativa nesta organização/i
  );

  // ---- O bilhete do rodízio é atômico e nunca repete ----
  const bilhetes = [];
  for (let i = 0; i < 5; i++) {
    const r = await umaLinha(
      `update public.lead_distribution_rules
          set assignments_count = assignments_count + 1
        where id = $1 returning assignments_count`,
      [regraA.id]
    );
    bilhetes.push(Number(r.assignments_count));
  }
  if (new Set(bilhetes).size === 5 && bilhetes[4] - bilhetes[0] === 4)
    ok(`o total distribuído pela regra é único e sequencial (${bilhetes.join(", ")})`);
  else fail("contador da regra", JSON.stringify(bilhetes));

  // ---- Papéis ----
  await comoUsuario(sellerA, async () => {
    const leitura = await db.query(
      `select id, name from public.lead_distribution_rules where organization_id = $1`,
      [ORG_A]
    );
    if (leitura.rows.length === 1) ok("seller LÊ a regra da própria empresa (sabe se está no rodízio)");
    else fail("seller não leu a regra da própria empresa", JSON.stringify(leitura.rows));

    const escrita = await db.query(
      `update public.lead_distribution_rules set name = 'Invadida' where id = $1 returning id`,
      [regraA.id]
    );
    if (escrita.rows.length === 0) ok("seller NÃO edita a regra");
    else fail("seller editou a regra de distribuição");

    await esperaErro(
      "seller não cria regra",
      () =>
        db.query(
          `insert into public.lead_distribution_rules (organization_id, name) values ($1, 'Do seller')`,
          [ORG_A]
        ),
      /row-level security|violates/i
    );

    const peso = await db.query(
      `update public.lead_distribution_participants set weight = 99 where rule_id = $1 returning id`,
      [regraA.id]
    );
    if (peso.rows.length === 0) ok("seller NÃO altera o próprio peso");
    else fail("seller alterou o peso do rodízio");
  });

  await comoUsuario(adminA, async () => {
    const r = await db.query(
      `update public.lead_distribution_rules set name = 'Rodízio comercial' where id = $1 returning id`,
      [regraA.id]
    );
    if (r.rows.length === 1) ok("org_admin edita a regra da própria empresa");
    else fail("org_admin não conseguiu editar a regra");
  });

  // ---- Auditoria ----
  const dealParaLog = await umaLinha(
    `select id from public.deals where organization_id = $1 limit 1`,
    [ORG_A]
  );
  const pSellerALocal = await perfil(sellerA);
  await db.query(
    `insert into public.lead_distribution_log
       (organization_id, deal_id, rule_id, rule_name, method, origin, assigned_to,
        assigned_to_name, candidates, ticket, reason)
     values ($1,$2,$3,'Rodízio comercial','weighted_round_robin','external_ingest',$4,
             'Sergio', $5::jsonb, 7, 'rule_matched')`,
    [
      ORG_A,
      dealParaLog?.id ?? null,
      regraA.id,
      pSellerALocal,
      JSON.stringify([{ profile_id: pSellerALocal, name: "Sergio", weight: 1 }]),
    ]
  );
  ok("o motor registra a distribuição com snapshot dos candidatos");

  await esperaErro(
    "motivo fora do domínio é recusado no log",
    () =>
      db.query(
        `insert into public.lead_distribution_log (organization_id, origin, reason)
           values ($1, 'external_ingest', 'porque sim')`,
        [ORG_A]
      ),
    /reason_check|check constraint/i
  );

  // O snapshot é o ponto da tabela: apagar a regra não pode apagar a história.
  const regraDescartavel = await umaLinha(
    `insert into public.lead_distribution_rules (organization_id, name, priority, origin)
       values ($1, 'Campanha de agosto', 10, 'external_ingest') returning id`,
    [ORG_A]
  );
  await db.query(
    `insert into public.lead_distribution_log
       (organization_id, rule_id, rule_name, method, origin, reason)
     values ($1,$2,'Campanha de agosto','weighted_round_robin','external_ingest','rule_matched')`,
    [ORG_A, regraDescartavel.id]
  );
  await db.query(`delete from public.lead_distribution_rules where id = $1`, [regraDescartavel.id]);
  const sobreviveu = await umaLinha(
    `select rule_id, rule_name from public.lead_distribution_log where rule_name = 'Campanha de agosto'`
  );
  if (sobreviveu && sobreviveu.rule_id === null && sobreviveu.rule_name === "Campanha de agosto")
    ok("apagar a regra não apaga a auditoria — o nome fica no snapshot");
  else fail("auditoria perdida ao apagar a regra", JSON.stringify(sobreviveu));

  await comoUsuario(sellerA, async () => {
    const r = await db.query(`select id from public.lead_distribution_log where organization_id = $1`, [
      ORG_A,
    ]);
    if (r.rows.length === 0) ok("seller NÃO lê o log de distribuição (é dado de gestão)");
    else fail("seller leu o log de distribuição", JSON.stringify(r.rows));

    // Aqui o `revoke` da seção 5 é mais forte que o RLS: em vez de devolver
    // zero linhas, o Postgres recusa o privilégio. Auditoria não se edita.
    await esperaErro(
      "seller NÃO reescreve a auditoria (privilégio revogado, não só RLS)",
      () =>
        db.query(`update public.lead_distribution_log set assigned_to = null where organization_id = $1`, [
          ORG_A,
        ]),
      /permission denied/i
    );
    await esperaErro(
      "e não insere linha de auditoria",
      () =>
        db.query(
          `insert into public.lead_distribution_log (organization_id, origin, reason)
             values ($1, 'external_ingest', 'rule_matched')`,
          [ORG_A]
        ),
      /permission denied/i
    );
  });

  await comoUsuario(adminA, async () => {
    const r = await db.query(`select id from public.lead_distribution_log where organization_id = $1`, [
      ORG_A,
    ]);
    if (r.rows.length >= 1) ok("org_admin lê o log de distribuição");
    else fail("org_admin não leu o log");
  });

  // ---- Isolamento entre organizações ----
  await comoUsuario(adminB, async () => {
    const regras = await db.query(
      `select id from public.lead_distribution_rules where organization_id = $1`,
      [ORG_A]
    );
    if (regras.rows.length === 0) ok("admin da empresa B não LÊ regras da empresa A");
    else fail("vazamento de regras entre organizações", JSON.stringify(regras.rows));

    const logs = await db.query(
      `select id from public.lead_distribution_log where organization_id = $1`,
      [ORG_A]
    );
    if (logs.rows.length === 0) ok("admin da empresa B não LÊ a auditoria da empresa A");
    else fail("vazamento de auditoria entre organizações", JSON.stringify(logs.rows));

    const escrita = await db.query(
      `update public.lead_distribution_rules set name = 'Invadida' where id = $1 returning id`,
      [regraA.id]
    );
    if (escrita.rows.length === 0) ok("e não edita a regra da empresa A, mesmo conhecendo o UUID");
    else fail("admin da B editou regra da A");
  });

  await db.query(`delete from public.forms where id = $1`, [formB2.id]);
}

console.log("\n== 16. Fila ordenada e plantão (0017) ==");
{
  const ORG_F = "66666666-6666-6666-6666-666666666666";
  await db.exec(`insert into public.organizations (id, name) values ('${ORG_F}', 'Empresa F');`);

  // Três pessoas, criadas em ordem conhecida.
  const emails = ["f1@teste.com", "f2@teste.com", "f3@teste.com"];
  for (const email of emails) {
    await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, '{}')`, [email]);
  }
  const perfisF = [];
  for (const email of emails) {
    const authId = await uid(email);
    const p = await perfil(authId);
    perfisF.push(p);
    await db.query(
      `insert into public.organization_members (organization_id, profile_id, role) values ($1,$2,'seller')`,
      [ORG_F, p]
    );
  }
  await db.query(`select public.provision_organization_defaults($1)`, [ORG_F]);

  const regraF = await umaLinha(
    `select id, queue_position, queue_uses, method from public.lead_distribution_rules
      where organization_id = $1 and is_fallback`,
    [ORG_F]
  );

  if (regraF.method === "ordered_queue" && Number(regraF.queue_position) === -1)
    ok("a regra nasce com método de fila ordenada e cursor em -1 (ninguém servido)");
  else fail("estado inicial da fila", JSON.stringify(regraF));

  const posicoes = await db.query(
    `select p.position, p.profile_id from public.lead_distribution_participants p
      where p.rule_id = $1 order by p.position`,
    [regraF.id]
  );
  if (
    posicoes.rows.length === 3 &&
    posicoes.rows.map((r) => Number(r.position)).join(",") === "0,1,2"
  )
    ok("os participantes recebem posições distintas e sequenciais (0,1,2)");
  else fail("posições iniciais", JSON.stringify(posicoes.rows));

  // Plantão nasce ligado: a migration não pode parar quem já distribuía.
  const plantao = await umaLinha(
    `select count(*) filter (where on_duty) as ativos, count(*) as total
       from public.organization_members where organization_id = $1`,
    [ORG_F]
  );
  if (Number(plantao.ativos) === 3 && Number(plantao.total) === 3)
    ok("todo mundo nasce de plantão (a migration não interrompe a distribuição)");
  else fail("plantão inicial", JSON.stringify(plantao));

  // ---- A consulta que o motor faz: fila elegível, em ordem ----
  const filaElegivel = async () =>
    (
      await db.query(
        `select p.position, p.weight, p.profile_id
           from public.lead_distribution_participants p
           join public.organization_members om
             on om.profile_id = p.profile_id and om.organization_id = $2
          where p.rule_id = $1
            and p.is_active
            and om.is_active
            and om.on_duty
            and om.role <> 'viewer'
          order by p.position, p.created_at`,
        [regraF.id, ORG_F]
      )
    ).rows;

  const todos = await filaElegivel();
  if (todos.length === 3) ok("com todo mundo de plantão, a fila tem os três");
  else fail("fila com todos", JSON.stringify(todos));

  // Fora do plantão: PULADO, sem perder a posição.
  await db.query(
    `update public.organization_members set on_duty = false where organization_id = $1 and profile_id = $2`,
    [ORG_F, perfisF[1]]
  );
  const semSegundo = await filaElegivel();
  if (
    semSegundo.length === 2 &&
    semSegundo.map((r) => Number(r.position)).join(",") === "0,2"
  )
    ok("quem sai do plantão é pulado e as posições dos outros NÃO mudam (0,2)");
  else fail("fila com um fora do plantão", JSON.stringify(semSegundo));

  // Voltando, retoma o lugar dela.
  await db.query(
    `update public.organization_members set on_duty = true where organization_id = $1 and profile_id = $2`,
    [ORG_F, perfisF[1]]
  );
  const voltou = await filaElegivel();
  if (voltou.map((r) => Number(r.position)).join(",") === "0,1,2")
    ok("voltando ao plantão, retoma a posição original");
  else fail("retorno ao plantão", JSON.stringify(voltou));

  // ---- Só o administrador liga e desliga o plantão ----
  await comoUsuario(sellerA, async () => {
    const r = await db.query(
      `update public.organization_members set on_duty = false
        where organization_id = $1 and profile_id = $2 returning profile_id`,
      [ORG_A, pSellerA]
    );
    if (r.rows.length === 0) ok("seller NÃO desliga o próprio plantão (só o administrador)");
    else fail("seller alterou o próprio plantão");
  });

  await comoUsuario(adminA, async () => {
    const r = await db.query(
      `update public.organization_members set on_duty = false
        where organization_id = $1 and profile_id = $2 returning profile_id`,
      [ORG_A, pSellerA]
    );
    if (r.rows.length === 1) ok("org_admin liga e desliga o plantão da equipe");
    else fail("org_admin não conseguiu alterar o plantão");
    await db.query(
      `update public.organization_members set on_duty = true where organization_id = $1 and profile_id = $2`,
      [ORG_A, pSellerA]
    );
  });

  // Qualquer membro LÊ o plantão: o vendedor precisa saber se está na fila.
  await comoUsuario(sellerA, async () => {
    const r = await db.query(
      `select on_duty from public.organization_members where organization_id = $1 and profile_id = $2`,
      [ORG_A, pSellerA]
    );
    if (r.rows.length === 1) ok("seller LÊ o próprio plantão");
    else fail("seller não leu o próprio plantão");
  });

  // ---- O cursor persiste, que é o ponto da 0017 ----
  const avanca = await umaLinha(
    `update public.lead_distribution_rules
        set queue_position = 1, queue_uses = 1, assignments_count = assignments_count + 1
      where id = $1 and queue_position = -1 and queue_uses = 0
      returning queue_position, queue_uses`,
    [regraF.id]
  );
  if (avanca && Number(avanca.queue_position) === 1)
    ok("o cursor avança por compare-and-swap (a corrida não entrega dois leads à mesma posição)");
  else fail("avanço do cursor", JSON.stringify(avanca));

  const conflito = await db.query(
    `update public.lead_distribution_rules
        set queue_position = 2, queue_uses = 1
      where id = $1 and queue_position = -1 and queue_uses = 0
      returning id`,
    [regraF.id]
  );
  if (conflito.rows.length === 0)
    ok("quem chegou com o cursor velho não atinge linha e precisa reler");
  else fail("o compare-and-swap não protegeu o cursor");

  const persistiu = await umaLinha(
    `select queue_position, queue_uses from public.lead_distribution_rules where id = $1`,
    [regraF.id]
  );
  if (Number(persistiu.queue_position) === 1 && Number(persistiu.queue_uses) === 1)
    ok("a última posição da fila fica persistida entre um lead e o seguinte");
  else fail("persistência do cursor", JSON.stringify(persistiu));

  // ---- Método antigo não é mais aceito ----
  await esperaErro(
    "o método da 0016 deixou de ser aceito (regra que o motor não sabe servir)",
    () =>
      db.query(`update public.lead_distribution_rules set method = 'weighted_round_robin' where id = $1`, [
        regraF.id,
      ]),
    /lead_distribution_rules_method_check|check constraint/i
  );

  // ---- Quem entra depois vai para o FIM da fila ----
  await db.query(`insert into auth.users (email, raw_user_meta_data) values ('f4@teste.com', '{}')`);
  const novo = await perfil(await uid("f4@teste.com"));
  await db.query(
    `insert into public.organization_members (organization_id, profile_id, role) values ($1,$2,'seller')`,
    [ORG_F, novo]
  );
  const doNovo = await umaLinha(
    `select position from public.lead_distribution_participants where rule_id = $1 and profile_id = $2`,
    [regraF.id, novo]
  );
  if (doNovo && Number(doNovo.position) === 3)
    ok("quem entra na equipe entra no FIM da fila, não na frente");
  else fail("posição de quem entra depois", JSON.stringify(doNovo));

  // ---- Isolamento ----
  await comoUsuario(adminA, async () => {
    const r = await db.query(
      `update public.organization_members set on_duty = false where organization_id = $1 returning profile_id`,
      [ORG_F]
    );
    if (r.rows.length === 0) ok("admin da empresa A não mexe no plantão da empresa F");
    else fail("vazamento: admin da A alterou plantão da F", JSON.stringify(r.rows));
  });
}

console.log("\n== 17. Migração aplicada sobre base COM DADOS ==");
{
  // POR QUE ESTE BLOCO EXISTE
  // A primeira versão da 0017 atualizava `method` ANTES de derrubar o `check`
  // antigo, que só aceitava `weighted_round_robin`. Em produção isso explodiu
  // com 23514 na primeira execução. Aqui não tinha explodido: as migrations
  // rodam contra um banco vazio, então o `update` não atingia linha nenhuma e
  // passava.
  //
  // Esta é a lacuna real da suíte — ela prova que o SQL é válido, não que ele
  // sobrevive aos dados que o cliente já tem. O bloco abaixo reconstrói o
  // estado de uma base com a 0016 aplicada e regras criadas, e reexecuta a
  // 0017 inteira por cima.
  const arquivo0017 = path.join(MIG, "0017_fila_ordenada_e_plantao.sql");
  const sql0017 = readFileSync(arquivo0017, "utf8");

  // Volta a tabela ao estado pós-0016: check antigo e regras com o método
  // antigo. Há regras reais aqui — as das empresas A, B, D, E e F.
  // A ORDEM AQUI É A MESMA ARMADILHA QUE A MIGRATION CAIU, e a primeira versão
  // deste bloco também caiu nela: instalar o `check` antigo antes de reverter
  // os dados falha com 23514 no `ATRewriteTable`, porque as linhas ainda estão
  // no valor novo. Constraint depois do dado, sempre.
  await db.exec(
    `alter table public.lead_distribution_rules
       drop constraint if exists lead_distribution_rules_method_check;`
  );
  await db.exec(`update public.lead_distribution_rules set method = 'weighted_round_robin';`);
  await db.exec(`
    alter table public.lead_distribution_rules
      add constraint lead_distribution_rules_method_check
      check (method in ('weighted_round_robin'));
    alter table public.lead_distribution_rules
      alter column method set default 'weighted_round_robin';
  `);

  const antes = await umaLinha(
    `select count(*) as n from public.lead_distribution_rules where method = 'weighted_round_robin'`
  );
  if (Number(antes.n) > 0) ok(`base reconstruída com ${antes.n} regra(s) no método antigo`);
  else fail("a simulação precisa de regras existentes para valer alguma coisa");

  try {
    await db.exec(sql0017);
    ok("a 0017 aplica sobre base COM DADOS (era exatamente o que quebrava)");
  } catch (e) {
    fail("a 0017 falhou sobre base com dados", e.message.split("\n")[0]);
  }

  const depois = await umaLinha(
    `select count(*) filter (where method = 'ordered_queue') as novas,
            count(*) as total
       from public.lead_distribution_rules`
  );
  if (Number(depois.novas) === Number(depois.total))
    ok("todas as regras existentes migraram para o método novo");
  else fail("regras não migradas", JSON.stringify(depois));

  // Reexecutar não pode bagunçar a ordem já configurada.
  const ordemPreservada = await db.query(
    `select rule_id, position, count(*) as n
       from public.lead_distribution_participants
      group by rule_id, position having count(*) > 1`
  );
  if (ordemPreservada.rows.length === 0)
    ok("reaplicar a 0017 não duplica posições dentro de uma regra");
  else fail("posições duplicadas após reaplicar", JSON.stringify(ordemPreservada.rows));

  // E o cursor de quem já estava distribuindo não pode voltar para -1.
  const cursor = await umaLinha(
    `select queue_position, queue_uses from public.lead_distribution_rules
      where queue_position >= 0 limit 1`
  );
  if (cursor) ok(`o cursor de uma regra em uso sobrevive à reaplicação (posição ${cursor.queue_position})`);
  else fail("o cursor foi zerado ao reaplicar a migration");
}

console.log("\n== 18. Auditoria e reparo de posições (0018) ==");
{
  const arquivo0018 = path.join(MIG, "0018_auditoria_da_distribuicao.sql");
  const sql0018 = readFileSync(arquivo0018, "utf8");

  const regra18 = await umaLinha(
    `select id from public.lead_distribution_rules where organization_id = $1 and is_fallback`,
    [ORG_A]
  );

  // ---- Apagar o lead não pode apagar a auditoria ----
  const dealDescartavel = await umaLinha(
    `insert into public.deals (organization_id, pipeline_id, stage_id, title)
     select $1, p.id, s.id, 'Lead para apagar'
       from public.pipelines p
       join public.pipeline_stages s on s.pipeline_id = p.id and not s.is_won_stage and not s.is_lost_stage
      where p.organization_id = $1 and p.is_default
      limit 1
     returning id`,
    [ORG_A]
  );
  await db.query(
    `insert into public.lead_distribution_log
       (organization_id, deal_id, rule_id, rule_name, method, origin, assigned_to_name, reason)
     values ($1,$2,$3,'Regra do teste','ordered_queue','external_ingest','Sergio','rule_matched')`,
    [ORG_A, dealDescartavel.id, regra18.id]
  );
  await db.query(`delete from public.deals where id = $1`, [dealDescartavel.id]);

  const auditoria = await umaLinha(
    `select deal_id, assigned_to_name from public.lead_distribution_log where rule_name = 'Regra do teste'`
  );
  if (auditoria && auditoria.deal_id === null && auditoria.assigned_to_name === "Sergio")
    ok("apagar a negociação NÃO apaga a auditoria da distribuição dela");
  else fail("auditoria perdida ao apagar o lead", JSON.stringify(auditoria));

  // ---- Motivo próprio para contenção ----
  const contencao = await db.query(
    `insert into public.lead_distribution_log (organization_id, origin, reason)
       values ($1, 'external_ingest', 'contention') returning id`,
    [ORG_A]
  );
  if (contencao.rows.length === 1)
    ok("o motivo `contention` é aceito (contenção deixou de ser diagnosticada como sem participantes)");
  else fail("contention recusado pelo check");

  await esperaErro(
    "motivo inventado continua recusado",
    () =>
      db.query(
        `insert into public.lead_distribution_log (organization_id, origin, reason)
           values ($1, 'external_ingest', 'porque sim')`,
        [ORG_A]
      ),
    /reason_check|check constraint/i
  );

  // ---- Reparo das posições duplicadas ----
  //
  // Reconstrói o estado que a tela produzia antes da correção: todo mundo em
  // `position = 0`, com o cursor já em uso.
  await db.query(`update public.lead_distribution_participants set position = 0 where rule_id = $1`, [
    regra18.id,
  ]);
  await db.query(
    `update public.lead_distribution_rules set queue_position = 0, queue_uses = 1 where id = $1`,
    [regra18.id]
  );

  const antesDoReparo = await umaLinha(
    `select count(*) as n from public.lead_distribution_participants where rule_id = $1 and position = 0`,
    [regra18.id]
  );
  if (Number(antesDoReparo.n) > 1) ok(`estado inválido reconstruído: ${antesDoReparo.n} pessoas na posição 0`);
  else fail("a simulação precisa de mais de um participante empatado");

  await db.exec(sql0018);

  const depoisDoReparo = await db.query(
    `select position from public.lead_distribution_participants where rule_id = $1 order by position`,
    [regra18.id]
  );
  const posicoes18 = depoisDoReparo.rows.map((r) => Number(r.position));
  if (new Set(posicoes18).size === posicoes18.length)
    ok(`posições duplicadas foram reparadas (${posicoes18.join(", ")})`);
  else fail("duplicatas sobreviveram ao reparo", JSON.stringify(posicoes18));

  const cursorReparado = await umaLinha(
    `select queue_position, queue_uses from public.lead_distribution_rules where id = $1`,
    [regra18.id]
  );
  if (Number(cursorReparado.queue_position) === -1 && Number(cursorReparado.queue_uses) === 0)
    ok("o cursor da regra reparada é reiniciado — ele apontava para um número que mudou de dono");
  else fail("cursor não reiniciado após o reparo", JSON.stringify(cursorReparado));

  // Reaplicar não pode mexer em quem já está correto.
  const antes = JSON.stringify(
    (
      await db.query(
        `select profile_id, position from public.lead_distribution_participants where rule_id = $1 order by position`,
        [regra18.id]
      )
    ).rows
  );
  await db.exec(sql0018);
  const depois = JSON.stringify(
    (
      await db.query(
        `select profile_id, position from public.lead_distribution_participants where rule_id = $1 order by position`,
        [regra18.id]
      )
    ).rows
  );
  if (antes === depois) ok("reaplicar a 0018 não mexe em fila já correta");
  else fail("a 0018 não é idempotente", `${antes} -> ${depois}`);
}

console.log("\n== 19. Tags de negociação (0019) ==");
{
  // Leads das duas empresas, cada um com responsável distinto, para exercitar
  // a fronteira por responsável da 0011 dentro das tags.
  const funilTagA = await umaLinha(
    `select id from public.pipelines where organization_id = $1 and is_default`,
    [ORG_A]
  );
  const etapaTagA = await umaLinha(
    `select id from public.pipeline_stages where pipeline_id = $1 and not is_won_stage and not is_lost_stage order by order_index limit 1`,
    [funilTagA.id]
  );
  const funilTagB = await umaLinha(
    `select id from public.pipelines where organization_id = $1 and is_default`,
    [ORG_B]
  );
  const etapaTagB = await umaLinha(
    `select id from public.pipeline_stages where pipeline_id = $1 and not is_won_stage and not is_lost_stage order by order_index limit 1`,
    [funilTagB.id]
  );

  const leadDoSeller = await umaLinha(
    `insert into public.deals (organization_id, pipeline_id, stage_id, title, responsible_id, status)
       values ($1,$2,$3,'Lead do Sergio',$4,'open') returning id`,
    [ORG_A, funilTagA.id, etapaTagA.id, pSellerA]
  );
  const leadDoAdmin = await umaLinha(
    `insert into public.deals (organization_id, pipeline_id, stage_id, title, responsible_id, status)
       values ($1,$2,$3,'Lead da Ana',$4,'open') returning id`,
    [ORG_A, funilTagA.id, etapaTagA.id, pAdminA]
  );
  const leadDaB = await umaLinha(
    `insert into public.deals (organization_id, pipeline_id, stage_id, title, status)
       values ($1,$2,$3,'Lead da empresa B','open') returning id`,
    [ORG_B, funilTagB.id, etapaTagB.id]
  );

  // ---- Catálogo: normalização e unicidade ----
  const tagA = await umaLinha(
    `insert into public.deal_tags (organization_id, name, category, tone)
       values ($1, '  Aguardando documento  ', '  Pendências  ', 'amber') returning id, name, category`,
    [ORG_A]
  );
  if (tagA.name === "Aguardando documento" && tagA.category === "Pendências")
    ok("nome e categoria são normalizados (btrim) na gravação");
  else fail("normalização do catálogo", JSON.stringify(tagA));

  await esperaErro(
    "nome repetido com outra caixa é recusado na mesma empresa",
    () =>
      db.query(`insert into public.deal_tags (organization_id, name) values ($1, 'aguardando DOCUMENTO')`, [
        ORG_A,
      ]),
    /deal_tags_org_nome_key|duplicate/i
  );

  const mesmoNomeOutraEmpresa = await db.query(
    `insert into public.deal_tags (organization_id, name) values ($1, 'Aguardando documento') returning id`,
    [ORG_B]
  );
  if (mesmoNomeOutraEmpresa.rows.length === 1)
    ok("o mesmo nome é aceito em OUTRA empresa (unicidade é por organização)");
  else fail("unicidade vazou entre organizações");
  const tagB = mesmoNomeOutraEmpresa.rows[0];

  await esperaErro(
    "tom fora da paleta do Badge é recusado",
    () =>
      db.query(`insert into public.deal_tags (organization_id, name, tone) values ($1, 'Roxa', 'fuchsia')`, [
        ORG_A,
      ]),
    /deal_tags_tone_check|check constraint/i
  );

  await esperaErro(
    "nome vazio é recusado",
    () => db.query(`insert into public.deal_tags (organization_id, name) values ($1, '   ')`, [ORG_A]),
    /deal_tags_name_nao_vazio|check constraint/i
  );

  // ---- A FK composta: o vínculo entre empresas é IMPOSSÍVEL ----
  //
  // É o achado central do desenho: `organization_id` da associativa é um valor
  // que o cliente envia, então uma policy que confiasse nele aceitaria a tag
  // de outra empresa. As duas FKs compartilham a coluna.
  await esperaErro(
    "tag da empresa B não se liga a lead da empresa A, nem por service_role",
    () =>
      db.query(
        `insert into public.deal_tag_assignments (deal_id, tag_id, organization_id) values ($1,$2,$3)`,
        [leadDoSeller.id, tagB.id, ORG_A]
      ),
    /deal_tag_assignments_tag_fkey|foreign key/i
  );

  await esperaErro(
    "nem mentindo o organization_id para o da empresa B",
    () =>
      db.query(
        `insert into public.deal_tag_assignments (deal_id, tag_id, organization_id) values ($1,$2,$3)`,
        [leadDoSeller.id, tagB.id, ORG_B]
      ),
    /deal_tag_assignments_deal_fkey|foreign key/i
  );

  // ---- Aplicação e idempotência ----
  await db.query(
    `insert into public.deal_tag_assignments (deal_id, tag_id, organization_id) values ($1,$2,$3)`,
    [leadDoSeller.id, tagA.id, ORG_A]
  );
  await db.query(
    `insert into public.deal_tag_assignments (deal_id, tag_id, organization_id) values ($1,$2,$3)
     on conflict (deal_id, tag_id) do nothing`,
    [leadDoSeller.id, tagA.id, ORG_A]
  );
  const vinculos = await umaLinha(
    `select count(*) as n from public.deal_tag_assignments where deal_id = $1 and tag_id = $2`,
    [leadDoSeller.id, tagA.id]
  );
  if (Number(vinculos.n) === 1) ok("aplicar a mesma tag duas vezes não duplica o vínculo");
  else fail("vínculo duplicado", JSON.stringify(vinculos));

  // ---- Tag inativa ----
  const tagInativa = await umaLinha(
    `insert into public.deal_tags (organization_id, name, is_active) values ($1, 'Aposentada', false) returning id`,
    [ORG_A]
  );
  await esperaErro(
    "tag inativa não pode ser aplicada a nada novo",
    () =>
      db.query(
        `insert into public.deal_tag_assignments (deal_id, tag_id, organization_id) values ($1,$2,$3)`,
        [leadDoAdmin.id, tagInativa.id, ORG_A]
      ),
    /inativa e não pode ser aplicada/i
  );

  // Desativar tag JÁ aplicada preserva o vínculo — é o ponto do is_active.
  await db.query(`update public.deal_tags set is_active = false where id = $1`, [tagA.id]);
  const sobreviveu = await umaLinha(
    `select count(*) as n from public.deal_tag_assignments where tag_id = $1`,
    [tagA.id]
  );
  if (Number(sobreviveu.n) === 1) ok("desativar a tag NÃO remove os vínculos existentes");
  else fail("vínculos perdidos ao desativar", JSON.stringify(sobreviveu));
  await db.query(`update public.deal_tags set is_active = true where id = $1`, [tagA.id]);

  // ---- Exclusão bloqueada, com mensagem ----
  await comoUsuario(adminA, async () => {
    await esperaErro(
      "excluir tag em uso é recusado com explicação em português",
      () => db.query(`select public.delete_deal_tag($1)`, [tagA.id]),
      /está aplicada em 1 negociação/i
    );
  });

  await comoUsuario(sellerA, async () => {
    await esperaErro(
      "seller não exclui tag",
      () => db.query(`select public.delete_deal_tag($1)`, [tagInativa.id]),
      /Somente administradores/i
    );
  });

  // ---- Papéis na associativa ----
  await comoUsuario(sellerA, async () => {
    const meus = await db.query(
      `select tag_id from public.deal_tag_assignments where deal_id = $1`,
      [leadDoSeller.id]
    );
    if (meus.rows.length === 1) ok("seller LÊ as tags do lead pelo qual é responsável");
    else fail("seller não leu as tags do próprio lead", JSON.stringify(meus.rows));

    const alheias = await db.query(
      `select tag_id from public.deal_tag_assignments where deal_id = $1`,
      [leadDoAdmin.id]
    );
    if (alheias.rows.length === 0) ok("seller NÃO lê vínculos de lead de outro responsável (0011)");
    else fail("vazamento de vínculos entre responsáveis", JSON.stringify(alheias.rows));

    await esperaErro(
      "seller não aplica tag em lead que não é dele",
      () =>
        db.query(
          `insert into public.deal_tag_assignments (deal_id, tag_id, organization_id) values ($1,$2,$3)`,
          [leadDoAdmin.id, tagA.id, ORG_A]
        ),
      /row-level security|violates/i
    );

    await esperaErro(
      "seller não cadastra tag",
      () => db.query(`insert into public.deal_tags (organization_id, name) values ($1, 'Do seller')`, [ORG_A]),
      /row-level security|violates/i
    );
  });

  // `viewer` enxerga todos os leads (0011) mas é somente leitura: a policy de
  // escrita precisa de `has_org_write`, que NÃO o inclui. Copiar a policy de
  // leitura daria escrita a ele.
  const viewerTag = await uid("viewer.a@teste.com");
  const pViewerTag = await perfil(viewerTag);
  await db.query(
    `update public.organization_members set role = 'viewer', is_active = true
      where organization_id = $1 and profile_id = $2`,
    [ORG_A, pViewerTag]
  );
  await comoUsuario(viewerTag, async () => {
    const leitura = await db.query(
      `select tag_id from public.deal_tag_assignments where deal_id = $1`,
      [leadDoSeller.id]
    );
    if (leitura.rows.length === 1) ok("viewer LÊ as tags de qualquer lead da empresa");
    else fail("viewer não leu vínculos", JSON.stringify(leitura.rows));

    await esperaErro(
      "viewer NÃO aplica tag, mesmo enxergando o lead",
      () =>
        db.query(
          `insert into public.deal_tag_assignments (deal_id, tag_id, organization_id) values ($1,$2,$3)`,
          [leadDoAdmin.id, tagA.id, ORG_A]
        ),
      /row-level security|violates/i
    );

    const remocao = await db.query(
      `delete from public.deal_tag_assignments where deal_id = $1 returning tag_id`,
      [leadDoSeller.id]
    );
    if (remocao.rows.length === 0) ok("viewer NÃO remove tag");
    else fail("viewer removeu vínculo", JSON.stringify(remocao.rows));
  });

  // ---- Métricas ----
  await comoUsuario(adminA, async () => {
    const totais = await db.query(`select * from public.deal_tag_totals($1)`, [ORG_A]);
    const linhaA = totais.rows.find((r) => r.tag_id === tagA.id);
    if (linhaA && Number(linhaA.deals_total) === 1)
      ok("deal_tag_totals conta a negociação da tag");
    else fail("contagem por tag", JSON.stringify(totais.rows));

    const zerada = totais.rows.find((r) => r.tag_id === tagInativa.id);
    if (zerada && Number(zerada.deals_total) === 0)
      ok("tag sem negociação aparece com 0 em vez de sumir (left join)");
    else fail("tag zerada sumiu do relatório");
  });

  await comoUsuario(sellerA, async () => {
    const totais = await db.query(`select * from public.deal_tag_totals($1)`, [ORG_A]);
    const linhaA = totais.rows.find((r) => r.tag_id === tagA.id);
    if (linhaA && Number(linhaA.deals_total) === 1)
      ok("seller vê nas métricas apenas os leads dele");
    else fail("recorte de visibilidade nas métricas", JSON.stringify(totais.rows));

    await esperaErro(
      "seller NÃO abre a distribuição por responsável (é relatório de gestão)",
      () => db.query(`select * from public.deal_tag_by_responsible($1)`, [ORG_A]),
      /disponível para administradores/i
    );
  });

  // A checagem que impede uma função DEFINER de virar porta dos fundos.
  await comoUsuario(adminB, async () => {
    await esperaErro(
      "admin da empresa B não lê as métricas da empresa A passando o uuid",
      () => db.query(`select * from public.deal_tag_totals($1)`, [ORG_A]),
      /Sem acesso a esta organização/i
    );
  });

  await comoUsuario(adminA, async () => {
    await esperaErro(
      "agrupamento inválido na evolução é recusado com mensagem, não erro cru",
      () =>
        db.query(`select * from public.deal_tag_evolution($1, now() - interval '30 days', now(), null, 'trimestre')`, [
          ORG_A,
        ]),
      /Agrupamento inválido/i
    );
  });

  // ---- set_deal_tags: conjunto final, numa transação ----
  await comoUsuario(sellerA, async () => {
    await db.query(`select public.set_deal_tags($1, $2::uuid[])`, [leadDoSeller.id, []]);
    const vazio = await umaLinha(
      `select count(*) as n from public.deal_tag_assignments where deal_id = $1`,
      [leadDoSeller.id]
    );
    if (Number(vazio.n) === 0) ok("set_deal_tags com lista vazia remove todas as tags do lead");
    else fail("set_deal_tags não limpou", JSON.stringify(vazio));

    await db.query(`select public.set_deal_tags($1, array[$2]::uuid[])`, [leadDoSeller.id, tagA.id]);
    const uma = await umaLinha(
      `select count(*) as n from public.deal_tag_assignments where deal_id = $1`,
      [leadDoSeller.id]
    );
    if (Number(uma.n) === 1) ok("set_deal_tags aplica o conjunto pedido");
    else fail("set_deal_tags não aplicou", JSON.stringify(uma));
  });

  // ---- 0020: tag desativada DEPOIS de aplicada não trava a edição ----
  //
  // O trigger BEFORE INSERT da 0019 dispara para toda linha proposta, antes da
  // resolução do ON CONFLICT. Enquanto `set_deal_tags` repropunha o vínculo
  // que já existia, a guarda derrubava a transação inteira e o lead ficava
  // impossível de editar. A UI precisa mandar a tag inativa de volta para
  // preservá-la — é este ciclo que o teste prende.
  const tagQueSeraDesativada = await umaLinha(
    `insert into public.deal_tags (organization_id, name) values ($1, 'Sem documento') returning id`,
    [ORG_A]
  );
  const tagNova = await umaLinha(
    `insert into public.deal_tags (organization_id, name) values ($1, 'Proposta enviada') returning id`,
    [ORG_A]
  );
  // Segundo lead do mesmo seller: prova que a guarda continua recusando a tag
  // inativa onde o vínculo ainda NÃO existe.
  const outroLeadDoSeller = await umaLinha(
    `insert into public.deals (organization_id, pipeline_id, stage_id, title, responsible_id, status)
       values ($1,$2,$3,'Outro lead do Sergio',$4,'open') returning id`,
    [ORG_A, funilTagA.id, etapaTagA.id, pSellerA]
  );
  await comoUsuario(sellerA, async () => {
    await db.query(`select public.set_deal_tags($1, array[$2]::uuid[])`, [
      leadDoSeller.id,
      tagQueSeraDesativada.id,
    ]);
  });
  await db.query(`update public.deal_tags set is_active = false where id = $1`, [
    tagQueSeraDesativada.id,
  ]);

  await comoUsuario(sellerA, async () => {
    // Manter a inativa e acrescentar uma ativa: o caminho normal da tela.
    // Sem a 0020 isto levanta P0001 de dentro da guarda; o try/catch existe
    // para reportar `FAIL` legível em vez de matar a suíte com dump de PL/pgSQL
    // antes dos blocos seguintes.
    try {
      await db.query(`select public.set_deal_tags($1, array[$2, $3]::uuid[])`, [
        leadDoSeller.id,
        tagQueSeraDesativada.id,
        tagNova.id,
      ]);
    } catch (e) {
      fail("0020: salvar tags travou na guarda BEFORE INSERT", e.message);
      return;
    }
    const ambas = await db.query(
      `select tag_id from public.deal_tag_assignments where deal_id = $1 order by tag_id`,
      [leadDoSeller.id]
    );
    if (ambas.rows.length === 2) ok("0020: manter tag inativa e acrescentar uma ativa funciona");
    else fail("0020: edição travada pela guarda", JSON.stringify(ambas.rows));

    const inativaSobreviveu = ambas.rows.some((r) => r.tag_id === tagQueSeraDesativada.id);
    if (inativaSobreviveu) ok("0020: o vínculo da tag inativa é PRESERVADO ao salvar");
    else fail("0020: vínculo histórico apagado ao salvar");
  });

  // A guarda continua valendo para vínculo realmente novo.
  await comoUsuario(sellerA, async () => {
    await esperaErro(
      "0020: aplicar tag inativa AINDA é recusado quando o vínculo é novo",
      () =>
        db.query(`select public.set_deal_tags($1, array[$2, $3]::uuid[])`, [
          outroLeadDoSeller.id,
          tagQueSeraDesativada.id,
          tagNova.id,
        ]),
      /inativa e não pode ser aplicada/i
    );

    // Desmarcar a inativa de propósito continua removendo o vínculo.
    try {
      await db.query(`select public.set_deal_tags($1, array[$2]::uuid[])`, [
        leadDoSeller.id,
        tagNova.id,
      ]);
    } catch (e) {
      fail("0020: remoção deliberada da tag inativa falhou", e.message);
      return;
    }
    const restou = await db.query(
      `select tag_id from public.deal_tag_assignments where deal_id = $1`,
      [leadDoSeller.id]
    );
    if (restou.rows.length === 1 && restou.rows[0].tag_id === tagNova.id)
      ok("0020: desmarcar a tag inativa de propósito remove o vínculo");
    else fail("0020: remoção deliberada não funcionou", JSON.stringify(restou.rows));
  });

  // ---- Cascatas ----
  await db.query(`delete from public.deals where id = $1`, [leadDoSeller.id]);
  const apagou = await umaLinha(
    `select count(*) as n from public.deal_tag_assignments where deal_id = $1`,
    [leadDoSeller.id]
  );
  if (Number(apagou.n) === 0) ok("apagar a negociação leva os vínculos junto (cascade)");
  else fail("vínculo órfão após apagar o lead");

  // `no action` na FK da tag não pode impedir a exclusão da organização.
  await db.query(
    `insert into public.deal_tag_assignments (deal_id, tag_id, organization_id) values ($1,$2,$3)`,
    [leadDaB.id, tagB.id, ORG_B]
  );
  try {
    await db.query(`delete from public.organizations where id = $1`, [ORG_B]);
    ok("excluir a organização funciona mesmo com tags aplicadas (por isso `no action`, não `restrict`)");
  } catch (e) {
    fail("a FK da tag bloqueou a exclusão da organização", e.message.split("\n")[0]);
  }
}

// ============================================================
// 0024 — um contato por WhatsApp, e o reparo das duplicatas
//
// Não basta afirmar que o índice existe: o valor desta migration está no
// REPARO, e reparo só se prova com dado sujo. Como as migrations rodam em
// ordem sobre um banco vazio, aqui a gente derruba o índice de propósito,
// recria a sujeira que a produção tinha (duplicata com histórico pendurado) e
// reaplica o arquivo inteiro.
// ============================================================
console.log("\n== 0024: contato único por WhatsApp ==");
{
  const ORG_E = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const ORG_F = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  await db.query(
    `insert into public.organizations (id, name) values ($1,'Empresa E'), ($2,'Empresa F')`,
    [ORG_E, ORG_F]
  );

  // ---- A trava, com o índice já criado pela migration ----
  await db.query(
    `insert into public.contacts (organization_id, name, whatsapp_phone) values ($1,'Maria','5511999999999')`,
    [ORG_E]
  );
  try {
    await db.query(
      `insert into public.contacts (organization_id, name, whatsapp_phone) values ($1,'Maria de novo','5511999999999')`,
      [ORG_E]
    );
    fail("0024: o mesmo WhatsApp foi aceito duas vezes na MESMA empresa");
  } catch (e) {
    if (String(e.message).includes("contacts_org_whatsapp_key"))
      ok("0024: o mesmo WhatsApp é recusado na mesma empresa");
    else fail("0024: recusado, mas por outro motivo", e.message.split("\n")[0]);
  }

  // Isolamento: a unicidade é POR ORGANIZAÇÃO. Sem esta asserção, alguém
  // "simplifica" o índice para só o telefone e quebra a base multiempresa.
  try {
    await db.query(
      `insert into public.contacts (organization_id, name, whatsapp_phone) values ($1,'Maria da outra empresa','5511999999999')`,
      [ORG_F]
    );
    ok("0024: o mesmo WhatsApp é aceito em OUTRA empresa");
  } catch (e) {
    fail("0024: a unicidade vazou entre organizações", e.message.split("\n")[0]);
  }

  // Nulo não colide com nulo: contato sem WhatsApp continua livre. É por isso
  // que o índice não precisa (nem deve) ser parcial.
  try {
    await db.query(
      `insert into public.contacts (organization_id, name, whatsapp_phone) values ($1,'Sem zap 1',null), ($1,'Sem zap 2',null)`,
      [ORG_E]
    );
    ok("0024: vários contatos sem WhatsApp convivem (nulos são distintos)");
  } catch (e) {
    fail("0024: o índice barrou contatos sem WhatsApp", e.message.split("\n")[0]);
  }

  // ---- O reparo, sobre sujeira recriada ----
  await db.exec(`drop index if exists public.contacts_org_whatsapp_key;`);

  const sujo = "5511888888888";
  const antigo = (
    await db.query(
      `insert into public.contacts (organization_id, name, whatsapp_phone, created_at)
       values ($1,'Cliente Antigo',$2, now() - interval '10 days') returning id`,
      [ORG_E, sujo]
    )
  ).rows[0].id;
  // A duplicata mais nova carrega o e-mail que alguém digitou à mão: o merge
  // precisa preservá-lo, senão o reparo joga fora dado do usuário.
  const novo = (
    await db.query(
      `insert into public.contacts (organization_id, name, whatsapp_phone, email, created_at)
       values ($1,'Cliente Novo',$2,'cliente@teste.com', now()) returning id`,
      [ORG_E, sujo]
    )
  ).rows[0].id;

  // Histórico pendurado na duplicata. `activity_logs` é `on delete cascade`:
  // se o reparo apagar antes de repontar, esta linha some sem erro nenhum.
  await db.query(
    `insert into public.activity_logs (organization_id, contact_id, type, title)
     values ($1,$2,'note','Conversa importante')`,
    [ORG_E, novo]
  );

  const antesDoReparo = Number(
    (
      await db.query(`select count(*) as n from public.activity_logs where organization_id = $1`, [
        ORG_E,
      ])
    ).rows[0].n
  );

  await db.exec(readFileSync(path.join(MIG, "0024_contato_unico_por_whatsapp.sql"), "utf8"));

  const sobraram = await db.query(
    `select id, email from public.contacts where organization_id = $1 and whatsapp_phone = $2`,
    [ORG_E, sujo]
  );
  if (sobraram.rows.length === 1) ok("0024: o reparo deixou um único contato para o telefone");
  else fail(`0024: sobraram ${sobraram.rows.length} contatos para o mesmo telefone`);

  if (sobraram.rows[0]?.id === antigo) ok("0024: o sobrevivente é o mais antigo");
  else fail("0024: o sobrevivente errado venceu — as FKs já apontavam para o mais antigo");

  if (sobraram.rows[0]?.email === "cliente@teste.com")
    ok("0024: o merge preservou o e-mail que só existia na duplicata");
  else fail("0024: o reparo jogou fora dado digitado pelo usuário", String(sobraram.rows[0]?.email));

  const depoisDoReparo = Number(
    (
      await db.query(`select count(*) as n from public.activity_logs where organization_id = $1`, [
        ORG_E,
      ])
    ).rows[0].n
  );
  if (depoisDoReparo === antesDoReparo)
    ok("0024: o histórico sobreviveu — nada foi levado pelo cascade");
  else fail(`0024: o cascade comeu histórico (${antesDoReparo} -> ${depoisDoReparo})`);

  const repontado = await db.query(
    `select contact_id from public.activity_logs where organization_id = $1 and title = 'Conversa importante'`,
    [ORG_E]
  );
  if (repontado.rows[0]?.contact_id === antigo)
    ok("0024: o histórico da duplicata foi repontado para o sobrevivente");
  else fail("0024: o histórico ficou órfão ou apontando para linha apagada");

  // Reaplicar com o dado já limpo não pode falhar nem mexer em nada.
  try {
    await db.exec(readFileSync(path.join(MIG, "0024_contato_unico_por_whatsapp.sql"), "utf8"));
    ok("0024 roda duas vezes sem erro");
  } catch (e) {
    fail("0024 não é idempotente", e.message.split("\n")[0]);
  }
}

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
await db.close();
process.exit(falhas === 0 ? 0 : 1);
