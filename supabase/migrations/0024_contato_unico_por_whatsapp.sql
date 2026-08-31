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
-- Uma corrida entre duas mensagens simultâneas, em 25/08, criou a primeira
-- duplicata; o resto foi automático.
--
-- A prova por contraste está no mesmo arquivo de rota: `whatsapp_conversations`
-- e `whatsapp_messages` usam o MESMO `maybeSingle()` e nunca duplicaram —
-- porque a `0002` e a `0011` lhes deram índice único. Mesmo código, resultados
-- opostos; o que muda é a trava no banco.
--
-- ============================================================
-- ORDEM DE EXECUÇÃO — NÃO INVERTA
--
-- O deploy do código corrigido vem ANTES desta migration. Não é preferência.
-- Sob o código antigo, o índice único faz o `insert` do webhook devolver
-- 23505 — e aquele erro também era descartado, então a rota seguia adiante
-- gravando conversa e lead com `contact_id: null`. Você trocaria 246 contatos
-- duplicados, que este arquivo repara, por conversas e leads ÓRFÃOS DE
-- CONTATO, que nenhum SQL reconstrói: não sobra telefone em lugar nenhum para
-- reconciliar depois. O índice sem a correção de código é estritamente pior
-- que o estado atual.
-- ============================================================
--
-- IDEMPOTENTE: numa segunda execução `contato_duplicado` sai vazia, todo
-- `update` e o `delete` não encontram nada, e o índice já existe. Pode rodar
-- duas vezes sem efeito.
--
-- SEGURA COM O WEBHOOK ATIVO por causa do `lock table` abaixo. Sem ele, uma
-- mensagem que chegasse entre o `delete` e o `create unique index` inseriria
-- uma duplicata nova e o índice falharia — sem estrago, mas obrigando a
-- repetir. Com 246 linhas o bloqueio dura milissegundos.
-- ============================================================

lock table public.contacts in share row exclusive mode;

-- String vazia NÃO é nulo: duas colidiriam no índice único e o abortariam.
-- Nulo é permitido à vontade (o Postgres trata nulos como distintos), então
-- normalizar para nulo é o que preserva os contatos sem WhatsApp.
update public.contacts set whatsapp_phone = null where whatsapp_phone = '';

-- ------------------------------------------------------------
-- Sobrevivente de cada grupo: o MAIS ANTIGO, desempate por `id`.
--
-- Por que o mais antigo, e não "o que tem mais vínculos" nem "o que tem nome
-- real": é para ele que as chaves estrangeiras já apontam. A conversa foi
-- criada uma única vez (o índice único da 0011 a protegeu) apontando para o
-- contato que existia naquele instante, e nunca foi repontada. Escolher o mais
-- antigo minimiza o repontamento, que é a parte arriscada do reparo. O
-- desempate por `id` torna o resultado determinístico — e empate de
-- `created_at` é justamente o que uma corrida produz.
--
-- O agrupamento é por `(organization_id, whatsapp_phone)`, NUNCA só por
-- telefone: agrupar sem a organização fundiria o contato da empresa A com o da
-- empresa B que usam o mesmo número, quebrando o isolamento de forma
-- irreversível dentro de um script que ninguém revisa duas vezes.
-- ------------------------------------------------------------
drop table if exists contato_duplicado;
create temporary table contato_duplicado as
with ranqueado as (
  select c.id,
         c.organization_id,
         first_value(c.id) over (
           partition by c.organization_id, c.whatsapp_phone
           order by c.created_at asc, c.id asc
         ) as sobrevivente_id
    from public.contacts c
   where c.whatsapp_phone is not null
)
select id as duplicado_id, sobrevivente_id, organization_id
  from ranqueado
 where id <> sobrevivente_id;

-- ------------------------------------------------------------
-- Merge dos campos antes de apagar.
--
-- O sobrevivente é o mais antigo, e o mais antigo nasceu do webhook — com nome
-- de push e telefone, sem mais nada. Uma duplicata mais nova pode ter sido
-- criada no modal, com e-mail, documento e cidade preenchidos à mão. Sem este
-- passo, apagar as duplicatas jogaria fora exatamente o dado que alguém
-- digitou. `coalesce` só preenche o que está vazio no sobrevivente: nada que
-- ele já tenha é sobrescrito.
-- ------------------------------------------------------------
with agregado as (
  select m.sobrevivente_id,
         (array_remove(array_agg(c.email      order by c.created_at), null))[1] as email,
         (array_remove(array_agg(c.phone      order by c.created_at), null))[1] as phone,
         (array_remove(array_agg(c.document   order by c.created_at), null))[1] as document,
         (array_remove(array_agg(c.city       order by c.created_at), null))[1] as city,
         (array_remove(array_agg(c.state      order by c.created_at), null))[1] as state,
         (array_remove(array_agg(c.notes      order by c.created_at), null))[1] as notes,
         (array_remove(array_agg(c.avatar_url order by c.created_at), null))[1] as avatar_url
    from contato_duplicado m
    join public.contacts c on c.id = m.duplicado_id
   group by m.sobrevivente_id
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
-- Repontamento das CINCO chaves estrangeiras que apontam para `contacts`.
--
-- Quatro são `on delete set null` e perderiam o vínculo em silêncio. A quinta,
-- `activity_logs.contact_id`, é **`on delete cascade`** (0001): apagar as
-- duplicatas sem repontar antes APAGARIA o histórico delas junto, sem erro e
-- sem aviso. É a diferença entre reparo e perda de dados.
--
-- Todo `update` carrega o guard de organização. `form_submissions` não tem
-- `organization_id`; o guard passa por `forms`.
-- ------------------------------------------------------------
update public.deals d
   set contact_id = m.sobrevivente_id
  from contato_duplicado m
 where d.contact_id = m.duplicado_id
   and d.organization_id = m.organization_id;

update public.tasks t
   set contact_id = m.sobrevivente_id
  from contato_duplicado m
 where t.contact_id = m.duplicado_id
   and t.organization_id = m.organization_id;

update public.activity_logs al
   set contact_id = m.sobrevivente_id
  from contato_duplicado m
 where al.contact_id = m.duplicado_id
   and al.organization_id = m.organization_id;

update public.whatsapp_conversations w
   set contact_id = m.sobrevivente_id
  from contato_duplicado m
 where w.contact_id = m.duplicado_id
   and w.organization_id = m.organization_id;

update public.form_submissions fs
   set contact_id = m.sobrevivente_id
  from contato_duplicado m
 where fs.contact_id = m.duplicado_id
   and exists (
     select 1 from public.forms f
      where f.id = fs.form_id
        and f.organization_id = m.organization_id
   );

-- Rede de segurança: se sobrou histórico apontando para duplicata, aborta em
-- vez de deixar o cascade agir. Prefira a transação inteira revertida a um
-- `activity_logs` com buracos que ninguém vai notar.
do $$
declare n integer;
begin
  select count(*) into n
    from public.activity_logs al
    join contato_duplicado m on al.contact_id = m.duplicado_id;
  if n > 0 then
    raise exception 'ABORTA: % activity_logs ainda apontam para contatos duplicados', n;
  end if;
end
$$;

delete from public.contacts c
 using contato_duplicado m
 where c.id = m.duplicado_id
   and c.organization_id = m.organization_id;

drop table if exists contato_duplicado;

-- ------------------------------------------------------------
-- A trava. NÃO é parcial, e isso é deliberado nas duas pontas:
--
-- 1. O Postgres trata nulos como distintos (`NULLS DISTINCT` é o padrão), então
--    o índice cheio já permite quantos contatos sem WhatsApp a empresa quiser.
--    Um `where whatsapp_phone is not null` seria redundante.
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
