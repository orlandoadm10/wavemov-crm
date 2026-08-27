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

  for (const invalido of ["Meta-Lead", "com espaco", "ab", "-comeca-com-hifen", "acentuaç"]) {
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

console.log(`\n${falhas === 0 ? "TODOS OS TESTES PASSARAM" : `${falhas} FALHA(S)`}`);
await db.close();
process.exit(falhas === 0 ? 0 : 1);
