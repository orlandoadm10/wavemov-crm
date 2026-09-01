-- ============================================================
-- Wavemov CRM — 0025: a carteira de leads sem tratativa
--
-- Responde a pergunta do administrador: **quem está esperando por nós?**
--
-- ============================================================
-- A DEFINIÇÃO DE "TRATATIVA" — leia antes de mexer em qualquer linha
--
-- Tratativa é AÇÃO DA EQUIPE. Ela vem de DUAS fontes, e usar só a primeira
-- produz um relatório que mente:
--
-- 1. `activity_logs` nos tipos listados em `tipos_de_tratativa` abaixo.
--    Fora ficam `whatsapp_inbound` (o lead escrevendo), `lead_assigned` (a
--    máquina distribuindo — lead distribuído e nunca tocado é justamente o
--    alvo deste relatório), `form_submission` e `deal_created` (a entrada;
--    contá-los daria a todo lead novo um "toque" falso em t=0).
--
-- 2. `whatsapp_messages.direction = 'outbound'`, alcançado por
--    `whatsapp_conversations.deal_id`. **Esta fonte não é opcional.**
--
-- POR QUE A SEGUNDA FONTE EXISTE, com o número medido em 31/08/2026:
-- `whatsapp_messages` tinha 466 mensagens enviadas; `activity_logs` tinha 4 do
-- tipo `whatsapp_outbound`. O webhook só grava log quando `!msg.fromMe`, então
-- **461 das 466 respostas — as que a equipe manda pelo próprio celular — são
-- invisíveis em `activity_logs`**. Um relatório construído só sobre aquela
-- tabela acusaria a equipe de abandonar praticamente toda a carteira enquanto
-- ela respondia. É a mesma classe de erro que escondeu o incidente de 26/08:
-- ler a coluna errada.
--
-- LISTA DE INCLUSÃO, NUNCA DE EXCLUSÃO. Os dois modos de falha não são
-- simétricos: uma lista de inclusão desatualizada gera alarme falso, que
-- alguém percebe e reclama; excluir `whatsapp_inbound` e aceitar o resto faria
-- uma mensagem DO LEAD contar como tratativa e esconderia, em silêncio, o lead
-- abandonado. Todo tipo novo precisa ser classificado aqui de propósito.
--
-- ============================================================
-- POR QUE RPC, E NÃO VIEW NEM EMBED DO POSTGREST
--
-- A tela ordena por "há mais tempo sem tratativa" E pagina. Isso decide a
-- arquitetura sozinho:
--
-- - **Embed do PostgREST está descartado.** Ele não ordena o recurso pai por
--   agregado de embed *to-many*. `range(0,24)` escolheria 25 leads por
--   `created_at` e só então calcularia o agregado: a página 1 mostraria uma
--   amostra arbitrária e o lead mais abandonado poderia não estar nela.
--   Errado com cara de certo — a mesma classe de defeito da busca sobre o
--   `limit(1000)` que `/contatos` tinha.
--
-- - **View com `security_invoker = on` funcionaria**, mas a policy da `0011`
--   chamaria `can_access_deal()` — `security definer` com três joins — uma vez
--   POR LINHA de `activity_logs`, a maior tabela do schema.
--
-- - **Coluna denormalizada em `deals` mantida por trigger** é superior no
--   limite, e foi recusada agora: o trigger rodaria dentro da transação do
--   webhook do WhatsApp, com ~86% de execuções que não fazem nada, e
--   congelaria a definição de tratativa no corpo dele. Reabrir quando o p95
--   desta função passar de ~500 ms ou uma organização passar de ~50 mil leads
--   abertos.
--
-- `security definer` desliga a RLS, então a `0011` é reimplementada aqui — uma
-- vez, no lugar certo: o recorte acontece em `deals`, e como a `0011` concede
-- acesso a `activity_logs`/`tasks` exatamente quando concede acesso ao lead,
-- filtrar no lead reproduz a policy inteira e mais barato.
--
-- ADITIVA E IDEMPOTENTE: `create index if not exists`, `create or replace
-- function`. Não toca dado, policy existente, publicação — nem tabela
-- temporária (o SQL Editor não garante mesma sessão entre instruções; lição da
-- `0024`).
--
-- AO APLICAR, REGISTRE O LEDGER NO MESMO ATO:
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('0025', 'carteira_sem_tratativa') on conflict (version) do nothing;
-- ============================================================

-- ------------------------------------------------------------
-- Índice: `max(created_at)` e `count` por lead, filtrando por tipo.
--
-- Os dois índices que a `0001` criou em `activity_logs` não têm `type`
-- (`activity_logs_deal_idx` é `(deal_id, created_at desc)`). Sem este, a
-- consulta por lead lê TODO o log dele e descarta por tipo linha a linha — num
-- lead com 500 mensagens recebidas, 500 linhas para achar 4 relevantes. É a
-- proporção real medida: 527 de 612.
--
-- `type` é COLUNA-CHAVE e não predicado parcial de propósito: um índice
-- parcial amarrado à lista de tipos deixaria de ser usado no dia em que alguém
-- acrescentasse um tipo — e o relatório ficaria lento sem ninguém saber por
-- quê. Com `type` na chave, o índice é indiferente ao vocabulário.
--
-- `where deal_id is not null` porque log sem lead nunca entra neste relatório,
-- e `deal_id = X` implica o predicado trivialmente.
--
-- `activity_logs_deal_idx` CONTINUA: ele serve a timeline do detalhe do lead,
-- que lê todos os tipos e que este índice não atende bem.
-- ------------------------------------------------------------
create index if not exists activity_logs_deal_type_idx
  on public.activity_logs (deal_id, type, created_at desc)
  where deal_id is not null;

comment on index public.activity_logs_deal_type_idx is
  'Carteira de leads: ultima tratativa e contagem de notas por lead. `type` na '
  'chave (nao parcial) para o indice nao depender do vocabulario de tipos.';

create or replace function public.carteira_sem_tratativa(
  org_id       uuid,
  ordem        text default 'parados',
  dias_minimos integer default null,
  apenas_nunca boolean default false,
  busca        text default null,
  pagina       integer default 0,
  tamanho      integer default 25
)
returns table (
  deal_id                uuid,
  titulo                 text,
  valor                  numeric,
  origem                 text,
  criado_em              timestamptz,
  contato_id             uuid,
  contato_nome           text,
  etapa_nome             text,
  funil_nome             text,
  responsavel_id         uuid,
  responsavel_nome       text,
  equipe_tratou_em       timestamptz,
  ultima_tratativa_tipo  text,
  lead_falou_em          timestamptz,
  notas                  bigint,
  tarefas                bigint,
  negociacoes_do_contato bigint,
  total                  bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare
  visao_completa boolean;
  meu_perfil     uuid;
  limite         integer;
  deslocamento   integer;
  termo          text;
  -- Ver o cabeçalho: lista de INCLUSÃO. Todo tipo novo precisa ser
  -- classificado aqui de propósito.
  tipos_de_tratativa text[] := array[
    'whatsapp_outbound', 'note', 'task_created', 'task_done',
    'stage_changed', 'responsible_changed', 'lead_info_updated',
    'deal_won', 'deal_lost', 'deal_archived'
  ];
begin
  if org_id is null then
    raise exception 'Organização não informada.' using errcode = 'P0001';
  end if;

  if not public.has_org_access(org_id) then
    raise exception 'Sem acesso a esta organização.' using errcode = '42501';
  end if;

  -- Resolvidos UMA vez; dentro do join seriam uma chamada por linha. É o mesmo
  -- cuidado que a 0019 documenta.
  visao_completa := public.has_full_lead_visibility(org_id);
  meu_perfil     := public.current_profile_id();

  -- Teto rígido: a agregação percorre a carteira aberta da organização antes
  -- do corte, e uma página gigante transformaria isso em varredura completa
  -- servida ao navegador.
  limite       := least(greatest(coalesce(tamanho, 25), 1), 100);
  deslocamento := greatest(coalesce(pagina, 0), 0) * limite;
  termo        := nullif(btrim(coalesce(busca, '')), '');

  return query
  with base as (
    select d.id, d.title, d.value, d.source, d.created_at,
           d.contact_id, d.stage_id, d.pipeline_id, d.responsible_id
      from public.deals d
     where d.organization_id = org_id
       and d.status = 'open'
       -- A 0011 reimplementada como predicado simples: sargável, servido por
       -- `deals_responsible_idx`. Lead que o vendedor não pode ver não produz
       -- linha nenhuma — o oráculo de contagem some por construção.
       and (visao_completa or d.responsible_id = meu_perfil)
  ),
  medido as (
    select b.*,
           -- `greatest` ignora nulos: devolve a mais recente das duas fontes, e
           -- nulo só quando as duas faltam.
           greatest(al.tratou_em, wa.tratou_em) as equipe_tratou_em,
           case
             when wa.tratou_em is not null
              and (al.tratou_em is null or wa.tratou_em >= al.tratou_em)
               then 'whatsapp_outbound'
             else al.tipo
           end as ultima_tratativa_tipo,
           inb.falou_em as lead_falou_em,
           coalesce(nt.total, 0) as notas,
           coalesce(tf.total, 0) as tarefas,
           coalesce(dc.total, 1) as negociacoes_do_contato
      from base b
      -- Laterais SEPARADOS, um por agregado. Um `left join` direto das duas
      -- tabelas multiplicaria linhas: 3 notas x 2 tarefas devolveria 6 e 6.
      left join lateral (
        select a.created_at as tratou_em, a.type as tipo
          from public.activity_logs a
         where a.deal_id = b.id
           and a.organization_id = org_id
           and a.type = any(tipos_de_tratativa)
         order by a.created_at desc
         limit 1
      ) al on true
      left join lateral (
        select max(m.created_at) as tratou_em
          from public.whatsapp_messages m
          join public.whatsapp_conversations c on c.id = m.conversation_id
         where c.deal_id = b.id
           and c.organization_id = org_id
           and m.organization_id = org_id
           and m.direction = 'outbound'
      ) wa on true
      left join lateral (
        select max(m.created_at) as falou_em
          from public.whatsapp_messages m
          join public.whatsapp_conversations c on c.id = m.conversation_id
         where c.deal_id = b.id
           and c.organization_id = org_id
           and m.organization_id = org_id
           and m.direction = 'inbound'
      ) inb on true
      left join lateral (
        select count(*) as total
          from public.activity_logs a
         where a.deal_id = b.id and a.organization_id = org_id and a.type = 'note'
      ) nt on true
      left join lateral (
        select count(*) as total
          from public.tasks t
         where t.deal_id = b.id and t.organization_id = org_id and t.status = 'pending'
      ) tf on true
      -- Marcador de "2ª negociação deste contato": sinaliza a repetição em vez
      -- de escondê-la. A lista NÃO agrupa — duas entradas do mesmo contato são
      -- dois recebimentos reais, e agrupar já escondeu defeito de dado uma vez.
      left join lateral (
        select count(*) as total
          from public.deals d2
         where d2.organization_id = org_id
           and d2.contact_id = b.contact_id
           and b.contact_id is not null
      ) dc on true
  ),
  filtrado as (
    select m.*,
           -- Nunca tratado conta desde a CRIAÇÃO. Sem o `coalesce`, o
           -- `order by ... asc` usaria `nulls last` e o lead mais abandonado da
           -- carteira cairia na ÚLTIMA página.
           coalesce(m.equipe_tratou_em, m.created_at) as parado_desde
      from medido m
     where (not apenas_nunca or m.equipe_tratou_em is null)
       and (
         dias_minimos is null
         or coalesce(m.equipe_tratou_em, m.created_at) <= now() - make_interval(days => dias_minimos)
       )
  ),
  buscado as (
    select f.*, c.name as contato_nome
      from filtrado f
      left join public.contacts c
        on c.id = f.contact_id and c.organization_id = org_id
     where termo is null
        or f.title ilike '%' || termo || '%'
        or c.name  ilike '%' || termo || '%'
  )
  select b.id,
         b.title,
         b.value,
         b.source,
         b.created_at,
         b.contact_id,
         b.contato_nome,
         s.name,
         p.name,
         b.responsible_id,
         nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
         b.equipe_tratou_em,
         b.ultima_tratativa_tipo,
         b.lead_falou_em,
         b.notas,
         b.tarefas,
         b.negociacoes_do_contato,
         count(*) over () as total
    from buscado b
    left join public.pipeline_stages s on s.id = b.stage_id
    left join public.pipelines p       on p.id = b.pipeline_id
    left join public.profiles pr       on pr.id = b.responsible_id
   order by
     case when ordem = 'recentes' then b.created_at end desc nulls last,
     case when ordem <> 'recentes' then b.parado_desde end asc nulls last
   limit limite offset deslocamento;
end;
$$;

comment on function public.carteira_sem_tratativa(uuid, text, integer, boolean, text, integer, integer) is
  'Carteira de leads abertos com a ultima tratativa da EQUIPE (activity_logs de '
  'trabalho UNIAO whatsapp_messages outbound) e a ultima fala do lead. '
  'security definer: a visibilidade da 0011 e reimplementada no recorte de deals.';

-- `security definer` atravessa a RLS: o grant precisa ser explícito e `anon`
-- fica de fora, como a 0005 estabeleceu.
revoke all on function public.carteira_sem_tratativa(uuid, text, integer, boolean, text, integer, integer) from public;
revoke all on function public.carteira_sem_tratativa(uuid, text, integer, boolean, text, integer, integer) from anon;
grant execute on function public.carteira_sem_tratativa(uuid, text, integer, boolean, text, integer, integer) to authenticated;
grant execute on function public.carteira_sem_tratativa(uuid, text, integer, boolean, text, integer, integer) to service_role;

-- Sem isto o PostgREST não enxerga a função nova. Foi para isso que a 0007 e a
-- 0008 existiram.
notify pgrst, 'reload schema';
