-- ============================================================
-- Wavemov CRM — 0024: um contato por WhatsApp, e o reparo das duplicatas
--
-- O DEFEITO
-- Em 31/08/2026 a produção tinha 246 contatos para 59 telefones distintos.
-- Um único número acumulou 118 contatos — exatamente uma linha por mensagem
-- trocada (117 mensagens), nas duas direções.
--
-- O laço: `app/api/webhooks/uazapi/route.ts` procurava o contato com
-- `.maybeSingle()`, que **falha quando encontra mais de uma linha**, e o erro
-- era descartado na desestruturação. Duas linhas viravam `contact === null`, o
-- `insert` criava a terceira, e a terceira garantia que a próxima mensagem
-- também caísse no `insert`. Cada mensagem somava um contato, para sempre.
--
-- A porta de entrada foi a ausência desta trava: a `0001` criou
-- `contacts_whatsapp_idx (organization_id, whatsapp_phone)` **sem `unique`**.
--
-- A prova por contraste está no mesmo arquivo de rota: `whatsapp_conversations`
-- e `whatsapp_messages` usam o MESMO `maybeSingle()` e nunca duplicaram —
-- porque a `0002` e a `0011` lhes deram índice único.
--
-- ============================================================
-- POR QUE ESTE ARQUIVO NÃO USA TABELA TEMPORÁRIA
--
-- A primeira versão montava o mapa duplicata→sobrevivente numa
-- `create temporary table` e a consultava nas instruções seguintes. No SQL
-- Editor da Supabase isso falha com:
--
--   ERROR: 42P01: relation "contato_duplicado" does not exist
--
-- O editor não garante que as instruções de um script rodem na MESMA sessão —
-- o pooler pode entregar cada uma a um backend diferente, e tabela temporária
-- morre com a sessão que a criou. Pela mesma razão, `begin`/`commit` no meio
-- do script também não é confiável ali.
--
-- A solução é não guardar estado entre instruções: cada `update` abaixo
-- **recalcula** o mapa no próprio CTE. É repetitivo de propósito. Cada
-- instrução passa a ser independente e idempotente, o script sobrevive a ser
-- rodado em pedaços, e reexecutar depois de uma falha no meio é seguro.
--
-- O custo é recomputar uma janela sobre algumas centenas de linhas cinco
-- vezes. Irrelevante aqui, e barato demais para justificar o estado partilhado
-- que quebrou.
--
-- MEXER NO MAPA EXIGE MEXER NAS CINCO CÓPIAS. A definição é sempre a mesma:
-- particiona por `(organization_id, whatsapp_phone)`, ordena por `created_at`
-- e desempata por `id`.
-- ============================================================
--
-- ============================================================
-- ORDEM DE EXECUÇÃO — NÃO INVERTA
--
-- O deploy do código corrigido vem ANTES desta migration. Não é preferência.
-- Sob o código antigo, o índice único faz o `insert` do webhook devolver
-- 23505 — e aquele erro também era descartado —, então a rota seguia adiante
-- gravando conversa e lead com `contact_id: null`. Você trocaria 246 contatos
-- duplicados, que este arquivo repara, por conversas e leads ÓRFÃOS DE
-- CONTATO, que nenhum SQL reconstrói. O índice sem a correção de código é
-- estritamente pior que o estado atual.
-- ============================================================
--
-- IDEMPOTENTE: com o dado já limpo, todo `update` e o `delete` não encontram
-- nada e o índice já existe. Pode rodar duas vezes sem efeito.

-- Bloqueia os inserts concorrentes do webhook enquanto o `delete` roda. Vale
-- só para a instrução seguinte quando o editor confirma cada uma
-- separadamente — e isso é aceitável porque o código corrigido já está em
-- produção e não cria mais duplicatas; o bloqueio aqui é cinto de segurança,
-- não a defesa principal.
lock table public.contacts in share row exclusive mode;

-- String vazia NÃO é nulo: duas colidiriam no índice único e o abortariam.
-- Nulo é permitido à vontade (o Postgres trata nulos como distintos), então
-- normalizar para nulo é o que preserva os contatos sem WhatsApp.
update public.contacts set whatsapp_phone = null where whatsapp_phone = '';

-- ------------------------------------------------------------
-- 1/7 — Merge dos campos, antes de qualquer exclusão.
--
-- O sobrevivente é o mais antigo, e o mais antigo nasceu do webhook: nome de
-- push e telefone, sem mais nada. Uma duplicata mais nova pode ter sido criada
-- no modal, com e-mail, documento e cidade digitados à mão. Sem este passo,
-- apagar as duplicatas jogaria fora exatamente o dado que alguém escreveu.
-- `coalesce` só preenche o que está vazio no sobrevivente.
-- ------------------------------------------------------------
with ranqueado as (
  select c.id, c.organization_id, c.whatsapp_phone,
         first_value(c.id) over (
           partition by c.organization_id, c.whatsapp_phone
           order by c.created_at asc, c.id asc
         ) as sobrevivente_id
    from public.contacts c
   where c.whatsapp_phone is not null
),
duplicado as (
  select id as duplicado_id, sobrevivente_id from ranqueado where id <> sobrevivente_id
),
agregado as (
  select d.sobrevivente_id,
         (array_remove(array_agg(c.email      order by c.created_at), null))[1] as email,
         (array_remove(array_agg(c.phone      order by c.created_at), null))[1] as phone,
         (array_remove(array_agg(c.document   order by c.created_at), null))[1] as document,
         (array_remove(array_agg(c.city       order by c.created_at), null))[1] as city,
         (array_remove(array_agg(c.state      order by c.created_at), null))[1] as state,
         (array_remove(array_agg(c.notes      order by c.created_at), null))[1] as notes,
         (array_remove(array_agg(c.avatar_url order by c.created_at), null))[1] as avatar_url
    from duplicado d
    join public.contacts c on c.id = d.duplicado_id
   group by d.sobrevivente_id
)
update public.contacts s
   set email      = coalesce(s.email, a.email),
       phone      = coalesce(s.phone, a.phone),
       document   = coalesce(s.document, a.document),
       city       = coalesce(s.city, a.city),
       state      = coalesce(s.state, a.state),
       notes      = coalesce(s.notes, a.notes),
       avatar_url = coalesce(s.avatar_url, a.avatar_url)
  from agregado a
 where s.id = a.sobrevivente_id;

-- ------------------------------------------------------------
-- 2/7 a 6/7 — Repontamento das CINCO chaves estrangeiras.
--
-- Quatro são `on delete set null` e perderiam o vínculo em silêncio. A quinta,
-- `activity_logs.contact_id`, é **`on delete cascade`** (0001): apagar as
-- duplicatas sem repontar antes APAGARIA o histórico delas junto, sem erro e
-- sem aviso. É a diferença entre reparo e perda de dados.
--
-- Todo `update` carrega o guard de organização — agrupar sem ele fundiria
-- contatos de empresas diferentes que usam o mesmo número.
-- ------------------------------------------------------------

-- 2/7 deals
with ranqueado as (
  select c.id, c.organization_id,
         first_value(c.id) over (
           partition by c.organization_id, c.whatsapp_phone
           order by c.created_at asc, c.id asc
         ) as sobrevivente_id
    from public.contacts c where c.whatsapp_phone is not null
),
duplicado as (
  select id as duplicado_id, sobrevivente_id, organization_id
    from ranqueado where id <> sobrevivente_id
)
update public.deals d
   set contact_id = m.sobrevivente_id
  from duplicado m
 where d.contact_id = m.duplicado_id
   and d.organization_id = m.organization_id;

-- 3/7 tasks
with ranqueado as (
  select c.id, c.organization_id,
         first_value(c.id) over (
           partition by c.organization_id, c.whatsapp_phone
           order by c.created_at asc, c.id asc
         ) as sobrevivente_id
    from public.contacts c where c.whatsapp_phone is not null
),
duplicado as (
  select id as duplicado_id, sobrevivente_id, organization_id
    from ranqueado where id <> sobrevivente_id
)
update public.tasks t
   set contact_id = m.sobrevivente_id
  from duplicado m
 where t.contact_id = m.duplicado_id
   and t.organization_id = m.organization_id;

-- 4/7 activity_logs — a do cascade. Se alguma instrução deste script tiver de
-- ser conferida à mão, é esta.
with ranqueado as (
  select c.id, c.organization_id,
         first_value(c.id) over (
           partition by c.organization_id, c.whatsapp_phone
           order by c.created_at asc, c.id asc
         ) as sobrevivente_id
    from public.contacts c where c.whatsapp_phone is not null
),
duplicado as (
  select id as duplicado_id, sobrevivente_id, organization_id
    from ranqueado where id <> sobrevivente_id
)
update public.activity_logs al
   set contact_id = m.sobrevivente_id
  from duplicado m
 where al.contact_id = m.duplicado_id
   and al.organization_id = m.organization_id;

-- 5/7 whatsapp_conversations
with ranqueado as (
  select c.id, c.organization_id,
         first_value(c.id) over (
           partition by c.organization_id, c.whatsapp_phone
           order by c.created_at asc, c.id asc
         ) as sobrevivente_id
    from public.contacts c where c.whatsapp_phone is not null
),
duplicado as (
  select id as duplicado_id, sobrevivente_id, organization_id
    from ranqueado where id <> sobrevivente_id
)
update public.whatsapp_conversations w
   set contact_id = m.sobrevivente_id
  from duplicado m
 where w.contact_id = m.duplicado_id
   and w.organization_id = m.organization_id;

-- 6/7 form_submissions — não tem `organization_id`; o guard passa por `forms`.
with ranqueado as (
  select c.id, c.organization_id,
         first_value(c.id) over (
           partition by c.organization_id, c.whatsapp_phone
           order by c.created_at asc, c.id asc
         ) as sobrevivente_id
    from public.contacts c where c.whatsapp_phone is not null
),
duplicado as (
  select id as duplicado_id, sobrevivente_id, organization_id
    from ranqueado where id <> sobrevivente_id
)
update public.form_submissions fs
   set contact_id = m.sobrevivente_id
  from duplicado m
 where fs.contact_id = m.duplicado_id
   and exists (
     select 1 from public.forms f
      where f.id = fs.form_id
        and f.organization_id = m.organization_id
   );

-- ------------------------------------------------------------
-- 7/7 — Rede de segurança e exclusão.
--
-- Se sobrou histórico apontando para duplicata, aborta em vez de deixar o
-- cascade agir. Prefira o erro a um `activity_logs` com buracos que ninguém
-- vai notar.
-- ------------------------------------------------------------
do $$
declare n integer;
begin
  select count(*) into n
    from public.activity_logs al
    join (
      select id
        from (
          select c.id,
                 first_value(c.id) over (
                   partition by c.organization_id, c.whatsapp_phone
                   order by c.created_at asc, c.id asc
                 ) as sobrevivente_id
            from public.contacts c
           where c.whatsapp_phone is not null
        ) r
       where r.id <> r.sobrevivente_id
    ) d on al.contact_id = d.id;
  if n > 0 then
    raise exception 'ABORTA: % activity_logs ainda apontam para contatos duplicados', n;
  end if;
end
$$;

with ranqueado as (
  select c.id, c.organization_id,
         first_value(c.id) over (
           partition by c.organization_id, c.whatsapp_phone
           order by c.created_at asc, c.id asc
         ) as sobrevivente_id
    from public.contacts c where c.whatsapp_phone is not null
)
delete from public.contacts c
 using ranqueado r
 where c.id = r.id
   and r.id <> r.sobrevivente_id;

-- ------------------------------------------------------------
-- A trava. NÃO é parcial, e isso é deliberado nas duas pontas:
--
-- 1. O Postgres trata nulos como distintos (`NULLS DISTINCT` é o padrão), então
--    o índice cheio já permite quantos contatos sem WhatsApp a empresa quiser.
-- 2. O Postgres **não infere índice parcial** em `on conflict (colunas)` sem
--    que o predicado seja repetido — e o PostgREST não emite predicado nenhum.
--    Índice parcial aqui quebraria qualquer `upsert` futuro sobre estas
--    colunas com "no unique or exclusion constraint matching".
--
-- A unicidade é por ORGANIZAÇÃO: o mesmo número em duas empresas continua
-- sendo dois contatos, como deve ser numa base multiempresa.
-- ------------------------------------------------------------
create unique index if not exists contacts_org_whatsapp_key
  on public.contacts (organization_id, whatsapp_phone);

-- `contacts_whatsapp_idx` (0001) tem as mesmas colunas na mesma ordem e virou
-- redundante: o índice único atende toda consulta que ele atendia, e manter os
-- dois custa escrita em toda inserção de contato.
drop index if exists public.contacts_whatsapp_idx;

comment on index public.contacts_org_whatsapp_key is
  'Um contato por WhatsApp por organização. A ausência desta trava permitiu '
  'que 59 telefones virassem 246 contatos em 6 dias (ver o cabeçalho da 0024).';
