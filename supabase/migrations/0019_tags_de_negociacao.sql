-- ============================================================
-- Wavemov CRM — 0019: tags de negociação
--
-- O QUE ENTRA
-- Um catálogo de tags por organização (nome, categoria, tom, ativo), uma
-- tabela associativa N:N com `deals`, e três agregações de relatório feitas
-- NO BANCO.
--
-- POR QUE A ASSOCIATIVA GUARDA `organization_id`
-- O contrato do projeto exige `.eq("organization_id", …)` em toda consulta, e
-- as agregações precisam recortar por empresa sem passar por `deals`. Só que
-- coluna denormalizada é valor que o CLIENTE envia: uma policy que confiasse
-- nela aceitaria `{deal_id de A, tag_id de B, organization_id = A}` e colaria
-- a tag de outra empresa num lead — passando por `has_org_write`, que olharia
-- só o `A`.
--
-- Por isso a co-tenancy é garantida por CHAVES ESTRANGEIRAS COMPOSTAS que
-- compartilham a MESMA coluna `organization_id`. Vincular entre empresas fica
-- impossível por construção, e vale inclusive para `service_role`, que ignora
-- RLS mas não ignora FK. Um trigger faria o mesmo pior: mais código, custo por
-- linha, e uma regra que alguém pode desligar.
--
-- POR QUE O TOM É UMA LISTA FECHADA, E NÃO HEX
-- `components/ui/badge.tsx` já expõe oito tons com contraste conferido e
-- aderentes ao DESIGN_GUIDE. Guardar o NOME do tom em vez de `#rrggbb` faz a
-- tag reusar o componente existente, elimina `style` inline e torna impossível
-- cadastrar texto branco sobre amarelo. Limite aceito: a nona tag repete cor —
-- e uma operação que precisa de nove cores no mesmo card tem tags demais.
-- (`pipeline_stages.color` guarda hex livre desde a 0001. É inconsistência
-- existente; não foi replicada de propósito.)
--
-- POR QUE APAGAR TAG NÃO É CASCATA
-- `cascade` reescreveria os relatórios do passado: o número de leads com a tag
-- "Sem documento" em março mudaria hoje. A tag tem `is_active` exatamente para
-- ser aposentada sem perder história. Mesmo raciocínio da 0012 com funis.
--
-- Idempotente: pode ser executada duas vezes sem efeito colateral.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Catálogo
--
-- `category` é texto normalizado, não tabela: o pedido não administra
-- categorias (sem cor, sem ordem, sem regra própria), e uma entidade a mais
-- custaria tabela, RLS, CRUD e tela para guardar uma string de agrupamento.
-- Quando isso mudar, uma migration converte a coluna em FK — os valores já
-- estarão aparados e sem vazios.
--
-- `unique (id, organization_id)` é redundante como unicidade (o `id` já é PK):
-- existe só para ser o ALVO da FK composta da associativa.
-- ------------------------------------------------------------
create table if not exists public.deal_tags (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  category        text,
  tone            text not null default 'slate',
  is_active       boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint deal_tags_name_nao_vazio
    check (btrim(name) <> '' and length(btrim(name)) <= 32),
  constraint deal_tags_category_nao_vazia
    check (category is null or btrim(category) <> ''),
  -- Os oito tons de `components/ui/badge.tsx`. Um valor fora da lista
  -- renderizaria sem estilo e passaria despercebido até alguém reclamar da
  -- tag "invisível".
  constraint deal_tags_tone_check
    check (tone in ('blue', 'green', 'red', 'amber', 'slate', 'violet', 'cyan', 'orange')),
  constraint deal_tags_id_org_key
    unique (id, organization_id)
);

-- Nome único por ORGANIZAÇÃO, sem a categoria na chave.
--
-- Incluir a categoria permitiria "Urgente" em duas categorias: no card viram o
-- mesmo chip, e no relatório "quantidade por tag" viram DUAS linhas com o mesmo
-- rótulo, dividindo a contagem. É o defeito que o cliente reporta como "o
-- relatório está quebrando minhas tags".
--
-- `lower()` pelo mesmo motivo, contra "Urgente"/"urgente". Total, e não parcial
-- por `is_active`: uma tag ativa não pode repetir o nome de uma inativa que
-- ainda carrega histórico nos relatórios.
--
-- `lower` e `btrim` são imutáveis, então servem em índice. `unaccent` NÃO é
-- imutável sem wrapper e ficou de fora.
create unique index if not exists deal_tags_org_nome_key
  on public.deal_tags (organization_id, lower(btrim(name)));

-- Ordenação do seletor no card e da tela de administração.
create index if not exists deal_tags_org_idx
  on public.deal_tags (organization_id, is_active, category, name);

drop trigger if exists deal_tags_updated_at on public.deal_tags;
create trigger deal_tags_updated_at
  before update on public.deal_tags
  for each row execute function public.set_updated_at();

-- Normalização na porta de entrada: o índice único é sobre o nome APARADO, e
-- gravar " Urgente " deixaria o dado divergente do que a unicidade enxerga.
create or replace function public.deal_tags_normalize()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := btrim(new.name);
  new.category := nullif(btrim(coalesce(new.category, '')), '');

  -- Mover a tag de empresa deixaria vínculos apontando para a tag de outra
  -- organização. As FKs compostas já barrariam, mas com mensagem críptica.
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'Uma tag não pode mudar de organização.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists deal_tags_normalize on public.deal_tags;
create trigger deal_tags_normalize
  before insert or update on public.deal_tags
  for each row execute function public.deal_tags_normalize();

comment on table public.deal_tags is
  'Catálogo de tags de negociação por organização. Nome único por empresa, sem diferenciar caixa e independente da categoria — nome repetido dividiria a contagem no relatório. `tone` é um dos oito tons de components/ui/badge.tsx. Aposentar tag é is_active = false, não delete.';

-- ------------------------------------------------------------
-- 2. Alvo da FK composta do lado de `deals`
--
-- ATENÇÃO OPERACIONAL: este `alter table` toma ACCESS EXCLUSIVE em `deals` e
-- constrói um índice. É rápido no volume atual, mas não é invisível — rode
-- fora do horário de pico.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'deals_id_org_key'
       and conrelid = 'public.deals'::regclass
  ) then
    alter table public.deals
      add constraint deals_id_org_key unique (id, organization_id);
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 3. Associativa
--
-- PK COMPOSTA, sem `id` próprio: impede duplicata de graça (dois cliques
-- rápidos no card inflariam a contagem por tag), dá idempotência com
-- `on conflict do nothing`, e o índice da PK já é o acesso "tags deste lead".
-- Um `id` surrogate aqui só existiria para ser ignorado.
--
-- Não há `updated_at` nem policy de UPDATE: as duas colunas de negócio SÃO a
-- chave primária. Trocar tag é remover e aplicar.
--
-- A FK da tag fica em `no action` (o default), e não `restrict`. `restrict`
-- dispara imediatamente: ao apagar uma ORGANIZAÇÃO, o cascade alcança `deals`
-- e `deal_tags` em ordem não garantida, e se `deal_tags` vier primeiro o
-- `restrict` abortaria a exclusão da empresa inteira. `no action` é verificado
-- no fim da instrução, quando o cascade de `deals` já removeu os vínculos —
-- e para o caso que importa (`delete` direto na tag) o bloqueio é idêntico.
-- ------------------------------------------------------------
create table if not exists public.deal_tag_assignments (
  deal_id         uuid not null,
  tag_id          uuid not null,
  organization_id uuid not null,
  assigned_by     uuid references public.profiles (id) on delete set null,
  assigned_at     timestamptz not null default now(),

  primary key (deal_id, tag_id),

  -- A MESMA coluna `organization_id` nas duas FKs: é isso que torna
  -- impossível vincular a tag de uma empresa ao lead de outra.
  constraint deal_tag_assignments_deal_fkey
    foreign key (deal_id, organization_id)
    references public.deals (id, organization_id)
    on delete cascade,

  constraint deal_tag_assignments_tag_fkey
    foreign key (tag_id, organization_id)
    references public.deal_tags (id, organization_id)
);

-- Serve TRÊS consultas:
--   1. filtro por tag em /negociacoes;
--   2. contagem por tag — as três colunas estão no índice, então é index-only
--      scan, sem tocar na heap;
--   3. a verificação da FK `(tag_id, organization_id)` ao apagar uma tag.
-- "Tags desta negociação" já é servida pela PK. A evolução por período usa o
-- `deals_org_created_idx` da 0009 e a distribuição por responsável o
-- `deals_responsible_idx` da 0011 — nenhum índice novo para elas.
create index if not exists deal_tag_assignments_tag_idx
  on public.deal_tag_assignments (organization_id, tag_id, deal_id);

-- Tag inativa não é aplicada a nada novo, mas os vínculos que já existem
-- PERMANECEM — é esse o ponto do `is_active`. Sem esta guarda, uma aba aberta
-- há uma hora com a lista antiga aplica uma tag desativada, e o status vira
-- decoração.
create or replace function public.deal_tag_assignment_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  ativa boolean;
begin
  select is_active into ativa from public.deal_tags where id = new.tag_id;

  if ativa is null then
    raise exception 'Tag não encontrada.' using errcode = 'P0001';
  end if;

  if not ativa then
    raise exception 'Esta tag está inativa e não pode ser aplicada a novas negociações.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists deal_tag_assignments_guard on public.deal_tag_assignments;
create trigger deal_tag_assignments_guard
  before insert on public.deal_tag_assignments
  for each row execute function public.deal_tag_assignment_guard();

comment on table public.deal_tag_assignments is
  'Vínculo N:N entre negociações e tags. PK composta impede duplicata. As FKs compostas compartilham organization_id: tag de uma empresa NUNCA se liga a lead de outra, nem por service_role. Sem UPDATE — trocar tag é remover e aplicar.';

-- ------------------------------------------------------------
-- 4. RLS do catálogo — cadastrar tag é assunto de administrador
--
-- Leitura para todo membro, inclusive `viewer`: sem o catálogo ninguém aplica
-- nem filtra. Escrita só `org_admin`, como `pipelines` (0012) e
-- `lead_distribution_rules` (0016).
-- ------------------------------------------------------------
alter table public.deal_tags enable row level security;

drop policy if exists "tags: leitura por membros" on public.deal_tags;
create policy "tags: leitura por membros"
  on public.deal_tags for select
  using (public.has_org_access(organization_id));

drop policy if exists "tags: criação por org_admin" on public.deal_tags;
create policy "tags: criação por org_admin"
  on public.deal_tags for insert
  with check (public.is_org_admin(organization_id));

drop policy if exists "tags: edição por org_admin" on public.deal_tags;
create policy "tags: edição por org_admin"
  on public.deal_tags for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "tags: exclusão por org_admin" on public.deal_tags;
create policy "tags: exclusão por org_admin"
  on public.deal_tags for delete
  using (public.is_org_admin(organization_id));

-- ------------------------------------------------------------
-- 5. RLS da associativa — herda a fronteira por responsável da 0011
--
-- Uma linha aqui é informação SOBRE UM LEAD. Se qualquer membro pudesse
-- listá-la, um `seller` descobriria ids de negociações que a 0011 esconde
-- dele — e, com o embed do PostgREST, leria título e valor junto.
--
-- `can_access_deal` (0011) é `security definer` e re-deriva a organização a
-- partir da própria `deals`: ela NÃO confia no `organization_id` da linha.
--
-- ARMADILHA: `has_full_lead_visibility` inclui `viewer`. Escrever a policy de
-- escrita copiando a de leitura daria escrita a um perfil somente leitura. O
-- `has_org_write` nas duas policies de escrita é o que impede isso.
--
-- Remover tag é trabalho diário de quem atende o lead, não ato administrativo:
-- por isso `has_org_write` e não `is_org_admin`, ao contrário do padrão de
-- delete da 0003.
-- ------------------------------------------------------------
alter table public.deal_tag_assignments enable row level security;

drop policy if exists "tags do lead: leitura pelo lead" on public.deal_tag_assignments;
create policy "tags do lead: leitura pelo lead"
  on public.deal_tag_assignments for select
  using (public.can_access_deal(deal_id));

drop policy if exists "tags do lead: aplicação pelo lead" on public.deal_tag_assignments;
create policy "tags do lead: aplicação pelo lead"
  on public.deal_tag_assignments for insert
  with check (
    public.has_org_write(organization_id)
    and public.can_access_deal(deal_id)
  );

drop policy if exists "tags do lead: remoção pelo lead" on public.deal_tag_assignments;
create policy "tags do lead: remoção pelo lead"
  on public.deal_tag_assignments for delete
  using (
    public.has_org_write(organization_id)
    and public.can_access_deal(deal_id)
  );

-- Sem policy de UPDATE, de propósito.

-- ------------------------------------------------------------
-- 6. Privilégios
--
-- A 0006 concede tudo a `authenticated` via default privileges, mas isso só
-- vale quando a migration roda como `postgres`. O grant explícito não depende
-- disso. Os revokes são a parte que importa: `update` sem policy é inofensivo
-- hoje e vira armadilha no dia em que alguém acrescentar uma policy `for all`.
-- ------------------------------------------------------------
grant select, insert, update, delete on table public.deal_tags to authenticated;
grant select, insert, delete on table public.deal_tag_assignments to authenticated;

revoke update on table public.deal_tag_assignments from authenticated;
revoke all on table public.deal_tags from anon;
revoke all on table public.deal_tag_assignments from anon;

-- ------------------------------------------------------------
-- 7. Exclusão de tag, com o bloqueio explicado
--
-- A FK já bloqueia; esta função existe para a interface explicar o impedimento
-- em português e sugerir a desativação — que é o que o cliente quase sempre
-- quer. Mesmo papel de `delete_pipeline` (0012).
--
-- `security definer` porque a contagem precisa ser da organização INTEIRA: sob
-- RLS um `seller` enxerga só os próprios leads e o número sairia menor.
-- Daí a checagem de `is_org_admin` logo na entrada.
-- ------------------------------------------------------------
create or replace function public.delete_deal_tag(target_tag_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  org    uuid;
  em_uso bigint;
begin
  select organization_id into org from public.deal_tags where id = target_tag_id;

  if org is null then
    raise exception 'Tag não encontrada.' using errcode = 'P0001';
  end if;

  if not public.is_org_admin(org) then
    raise exception 'Somente administradores da organização podem excluir tags.'
      using errcode = '42501';
  end if;

  select count(*) into em_uso
    from public.deal_tag_assignments a
   where a.tag_id = target_tag_id
     and a.organization_id = org;

  if em_uso > 0 then
    raise exception 'Esta tag está aplicada em % negociação(ões). Desative-a para parar de oferecê-la sem apagar o histórico dos relatórios.', em_uso
      using errcode = 'P0001';
  end if;

  delete from public.deal_tags where id = target_tag_id;
end;
$$;

-- ------------------------------------------------------------
-- 8. Aplicar o conjunto de tags de uma negociação, numa transação
--
-- O card envia o conjunto FINAL. Fazer isso com dois `fetch` do navegador (um
-- insert, um delete) não é transacional: se o segundo falhar, o card fica num
-- estado que ninguém pediu.
--
-- `security INVOKER` de propósito: cada instrução passa pelas policies do
-- item 5, então não há caminho de bypass a auditar. Lead que o chamador não
-- enxerga não tem linha para apagar, e o insert é recusado pelo `with check`.
-- `organization_id` vem de `deals`, nunca do cliente.
-- ------------------------------------------------------------
create or replace function public.set_deal_tags(target_deal_id uuid, tag_ids uuid[])
returns void
language plpgsql security invoker set search_path = public
as $$
begin
  delete from public.deal_tag_assignments a
   where a.deal_id = target_deal_id
     and not (a.tag_id = any (coalesce(tag_ids, '{}'::uuid[])));

  insert into public.deal_tag_assignments (deal_id, tag_id, organization_id, assigned_by)
  select d.id, t.id, d.organization_id, public.current_profile_id()
    from public.deals d
    join public.deal_tags t
      on t.organization_id = d.organization_id
     and t.id = any (coalesce(tag_ids, '{}'::uuid[]))
   where d.id = target_deal_id
  on conflict (deal_id, tag_id) do nothing;
end;
$$;

-- ------------------------------------------------------------
-- 9. Métricas — agregação NO BANCO
--
-- `/relatorios/vendedores` já foi corrigido depois de agregar em memória sobre
-- um recorte truncado pelo `max_rows = 1000` do PostgREST. Estas funções
-- devolvem UMA LINHA POR TAG (ou por tag × balde), então o teto não é
-- alcançado pelo volume de leads.
--
-- POR QUE RPC E NÃO VIEW `security_invoker` COMO A 0009
--   1. Custo: numa view invoker o RLS chamaria `can_access_deal` uma vez POR
--      LINHA agregada. Aqui a visibilidade é resolvida UMA vez, na entrada.
--   2. Semântica: "distribuição por responsável" não deve existir para um
--      `seller`. Uma view não sabe recusar; uma função sabe.
--
-- AS DUAS CHECAGENS QUE NÃO PODEM FALTAR
--   * `has_org_access(org_id)`: sem ela, uma função DEFINER devolve as
--     métricas de QUALQUER empresa para quem souber o uuid.
--   * o ramo de visibilidade: sem ele, o `seller` conta os leads dos colegas.
--
-- PERÍODO SOBRE `deals.created_at`, não sobre `assigned_at`: é a base de todos
-- os outros relatórios do produto, é o que combina com a contagem por tag no
-- mesmo recorte, e evita que uma faxina de tags numa terça-feira vire um pico
-- no gráfico. `assigned_at` continua gravado para o histórico do lead.
--
-- AVISO DE LEITURA: um lead com 3 tags aparece em 3 linhas. Somar as contagens
-- NÃO dá o total de negociações — a tela precisa dizer isso.
-- ------------------------------------------------------------
create or replace function public.deal_tag_totals(
  org_id      uuid,
  period_from timestamptz default null,
  period_to   timestamptz default null
)
returns table (
  tag_id      uuid,
  name        text,
  category    text,
  tone        text,
  is_active   boolean,
  deals_total bigint,
  deals_open  bigint,
  deals_won   bigint,
  deals_lost  bigint,
  value_won   numeric
)
language plpgsql stable security definer set search_path = public
as $$
declare
  visao_completa boolean;
  meu_perfil     uuid;
begin
  if org_id is null then
    raise exception 'Organização não informada.' using errcode = 'P0001';
  end if;

  if not public.has_org_access(org_id) then
    raise exception 'Sem acesso a esta organização.' using errcode = '42501';
  end if;

  -- Resolvido UMA vez; dentro do join seria uma chamada por linha.
  visao_completa := public.has_full_lead_visibility(org_id);
  meu_perfil     := public.current_profile_id();

  return query
  -- `left join` a partir do catálogo: tag sem negociação aparece com 0 em vez
  -- de sumir da lista. `count(d.id)` sem `distinct` porque a PK composta já
  -- garante um vínculo por par (deal, tag).
  select t.id, t.name, t.category, t.tone, t.is_active,
         count(d.id),
         count(d.id) filter (where d.status = 'open'),
         count(d.id) filter (where d.status = 'won'),
         count(d.id) filter (where d.status = 'lost'),
         coalesce(sum(d.value) filter (where d.status = 'won'), 0)
    from public.deal_tags t
    left join public.deal_tag_assignments a
      on a.tag_id = t.id
     and a.organization_id = t.organization_id
    left join public.deals d
      on d.id = a.deal_id
     and d.organization_id = t.organization_id
     and (period_from is null or d.created_at >= period_from)
     and (period_to   is null or d.created_at <  period_to)
     -- O recorte da 0011 aplicado na agregação. No `join`, e não no `where`,
     -- para não anular o `left join` e sumir com as tags de contagem zero.
     and (visao_completa or d.responsible_id = meu_perfil)
   where t.organization_id = org_id
   group by t.id, t.name, t.category, t.tone, t.is_active
   order by count(d.id) desc, t.name;
end;
$$;

create or replace function public.deal_tag_evolution(
  org_id      uuid,
  period_from timestamptz,
  period_to   timestamptz,
  target_tag  uuid default null,
  bucket      text default 'day',
  tz          text default 'America/Sao_Paulo'
)
returns table (
  tag_id       uuid,
  name         text,
  bucket_start date,
  deals_total  bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare
  visao_completa boolean;
  meu_perfil     uuid;
begin
  if org_id is null then
    raise exception 'Organização não informada.' using errcode = 'P0001';
  end if;

  if not public.has_org_access(org_id) then
    raise exception 'Sem acesso a esta organização.' using errcode = '42501';
  end if;

  -- Lista fechada: `date_trunc` aceita texto, e um valor errado viraria erro
  -- cru do Postgres na tela.
  if bucket not in ('day', 'week', 'month') then
    raise exception 'Agrupamento inválido. Use day, week ou month.' using errcode = 'P0001';
  end if;

  if period_from is null or period_to is null then
    raise exception 'Informe o período.' using errcode = 'P0001';
  end if;

  visao_completa := public.has_full_lead_visibility(org_id);
  meu_perfil     := public.current_profile_id();

  return query
  -- `at time zone tz` ANTES do truncamento: `created_at` é timestamptz e a
  -- sessão do Postgres roda em UTC. Sem isso, o lead das 22h do dia 31 em São
  -- Paulo cai no mês seguinte no gráfico.
  select t.id,
         t.name,
         date_trunc(bucket, d.created_at at time zone tz)::date,
         count(*)
    from public.deal_tag_assignments a
    join public.deal_tags t
      on t.id = a.tag_id
     and t.organization_id = a.organization_id
    join public.deals d
      on d.id = a.deal_id
     and d.organization_id = a.organization_id
   where a.organization_id = org_id
     and d.created_at >= period_from
     and d.created_at <  period_to
     and (target_tag is null or a.tag_id = target_tag)
     and (visao_completa or d.responsible_id = meu_perfil)
   group by t.id, t.name, 3
   order by 3, t.name;
  -- TETO: `max_rows = 1000` vale para o retorno da RPC. 40 tags × 90 dias =
  -- 3.600 linhas seriam TRUNCADAS EM SILÊNCIO. Por isso `target_tag` existe e
  -- a tela desenha a evolução de UMA tag por vez.
end;
$$;

create or replace function public.deal_tag_by_responsible(
  org_id      uuid,
  period_from timestamptz default null,
  period_to   timestamptz default null
)
returns table (
  tag_id           uuid,
  name             text,
  tone             text,
  responsible_id   uuid,
  responsible_name text,
  deals_total      bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if org_id is null then
    raise exception 'Organização não informada.' using errcode = 'P0001';
  end if;

  -- Sem ramo de visibilidade: este relatório É a comparação entre pessoas.
  -- Para quem enxerga só os próprios leads (0011) ele não é uma versão
  -- reduzida — é uma tela que não existe. Mesma decisão de
  -- /relatorios/vendedores.
  if not public.has_full_lead_visibility(org_id) then
    raise exception 'Este relatório mostra os números de toda a equipe e está disponível para administradores.'
      using errcode = '42501';
  end if;

  return query
  select t.id,
         t.name,
         t.tone,
         d.responsible_id,
         nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
         count(*)
    from public.deal_tag_assignments a
    join public.deal_tags t
      on t.id = a.tag_id
     and t.organization_id = a.organization_id
    join public.deals d
      on d.id = a.deal_id
     and d.organization_id = a.organization_id
    left join public.profiles p on p.id = d.responsible_id
   where a.organization_id = org_id
     and (period_from is null or d.created_at >= period_from)
     and (period_to   is null or d.created_at <  period_to)
   group by t.id, t.name, t.tone, d.responsible_id, p.first_name, p.last_name
   order by t.name, count(*) desc;
end;
$$;

-- ------------------------------------------------------------
-- 10. Privilégios das funções
--
-- `execute` nasce concedido a PUBLIC no Postgres. Como quase todas são
-- `security definer`, revogamos e concedemos explicitamente — mesmo
-- procedimento da 0012. `anon` fica de fora: nenhuma tem uso público.
-- ------------------------------------------------------------
revoke all on function public.delete_deal_tag(uuid) from public;
revoke all on function public.set_deal_tags(uuid, uuid[]) from public;
revoke all on function public.deal_tag_totals(uuid, timestamptz, timestamptz) from public;
revoke all on function public.deal_tag_evolution(uuid, timestamptz, timestamptz, uuid, text, text) from public;
revoke all on function public.deal_tag_by_responsible(uuid, timestamptz, timestamptz) from public;

grant execute on function public.delete_deal_tag(uuid) to authenticated, service_role;
grant execute on function public.set_deal_tags(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.deal_tag_totals(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.deal_tag_evolution(uuid, timestamptz, timestamptz, uuid, text, text) to authenticated, service_role;
grant execute on function public.deal_tag_by_responsible(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- PostgREST precisa reler o schema para enxergar as tabelas e funções novas
notify pgrst, 'reload schema';
