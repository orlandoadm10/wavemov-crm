-- ============================================================
-- Wavemov CRM — 0012: Funil padrão e administração segura de funis
--
-- Pré-requisito da Frente A (criação/exclusão de funis pela interface).
-- Sem esta migration, excluir um funil apagaria em cascata todas as
-- negociações vinculadas, e o "funil padrão" continuaria sendo apenas
-- "o mais antigo por created_at", sem marca explícita no banco.
--
-- O que esta migration garante:
--   1. Existe no máximo um funil padrão por organização — e, para toda
--      organização que tenha funis, exatamente um.
--   2. Excluir funil nunca apaga nem desassocia negociações e formulários.
--   3. Somente org_admin (e admin global) cria, renomeia, torna padrão,
--      exclui ou altera a estrutura de funis e etapas.
--   4. A organização nunca fica sem funil, e o funil padrão só sai depois
--      que outro assume o posto.
--
-- Efeito colateral consciente: com deals.pipeline_id em `restrict`, excluir
-- uma organização inteira por SQL manual passa a exigir apagar antes as
-- negociações dela. O app nunca exclui organização, e perder negociações em
-- cascata é justamente o risco que esta migration existe para eliminar.
--
-- Idempotente: pode ser executada duas vezes sem efeito colateral.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Coluna is_default
-- ------------------------------------------------------------
alter table public.pipelines
  add column if not exists is_default boolean not null default false;

-- ------------------------------------------------------------
-- 2. Backfill — exatamente um padrão por organização que já tem funis.
--    Critério determinístico: o mais antigo (created_at, id como desempate).
--    Organizações que já tenham um padrão marcado são preservadas.
-- ------------------------------------------------------------
with escolhido as (
  select distinct on (organization_id)
         id,
         organization_id
    from public.pipelines
   order by organization_id, created_at, id
)
update public.pipelines p
   set is_default = true
  from escolhido e
 where p.id = e.id
   and not exists (
     select 1
       from public.pipelines outro
      where outro.organization_id = p.organization_id
        and outro.is_default
   );

-- ------------------------------------------------------------
-- 3. No máximo um padrão por organização (índice único parcial)
-- ------------------------------------------------------------
create unique index if not exists pipelines_default_por_org_idx
  on public.pipelines (organization_id)
  where is_default;

-- ------------------------------------------------------------
-- 4. deals.pipeline_id: on delete cascade -> on delete restrict
--    Excluir funil jamais pode apagar negociações.
--    O nome do constraint é descoberto no catálogo, em vez de suposto.
-- ------------------------------------------------------------
do $$
declare
  nome_constraint text;
begin
  select con.conname
    into nome_constraint
    from pg_constraint con
   where con.conrelid = 'public.deals'::regclass
     and con.confrelid = 'public.pipelines'::regclass
     and con.contype = 'f'
     and con.conkey = array[
       (select a.attnum
          from pg_attribute a
         where a.attrelid = 'public.deals'::regclass
           and a.attname = 'pipeline_id')
     ]::smallint[];

  if nome_constraint is not null then
    execute format('alter table public.deals drop constraint %I', nome_constraint);
  end if;

  alter table public.deals
    add constraint deals_pipeline_id_fkey
    foreign key (pipeline_id) references public.pipelines (id) on delete restrict;
end;
$$;

-- ------------------------------------------------------------
-- 5. forms.pipeline_id: on delete set null -> on delete restrict
--    Funil usado por formulário não pode ser apagado silenciosamente.
-- ------------------------------------------------------------
do $$
declare
  nome_constraint text;
begin
  select con.conname
    into nome_constraint
    from pg_constraint con
   where con.conrelid = 'public.forms'::regclass
     and con.confrelid = 'public.pipelines'::regclass
     and con.contype = 'f'
     and con.conkey = array[
       (select a.attnum
          from pg_attribute a
         where a.attrelid = 'public.forms'::regclass
           and a.attname = 'pipeline_id')
     ]::smallint[];

  if nome_constraint is not null then
    execute format('alter table public.forms drop constraint %I', nome_constraint);
  end if;

  alter table public.forms
    add constraint forms_pipeline_id_fkey
    foreign key (pipeline_id) references public.pipelines (id) on delete restrict;
end;
$$;

-- ------------------------------------------------------------
-- 6. Invariantes do funil padrão, no banco
--
-- INSERT: o primeiro funil da organização nasce padrão; qualquer funil
--         adicional nasce comum, independente do que o cliente enviar.
--         Vale também para provision_organization_defaults() (0004).
-- UPDATE: is_default só muda por set_default_pipeline(), que sinaliza a
--         troca com um GUC local à transação. Assim nenhuma chamada
--         direta ao PostgREST deixa a organização sem padrão.
--         organization_id é imutável — mover um funil de empresa deixaria
--         negociações apontando para o funil de outra organização.
-- ------------------------------------------------------------
create or replace function public.pipelines_default_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.is_default := not exists (
      select 1
        from public.pipelines p
       where p.organization_id = new.organization_id
    );
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'Um funil não pode mudar de organização.'
      using errcode = '42501';
  end if;

  if new.is_default is distinct from old.is_default
     and coalesce(current_setting('wavemov.pipeline_default_switch', true), 'off') <> 'on' then
    raise exception 'O funil padrão é definido pela função set_default_pipeline().'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists pipelines_default_guard on public.pipelines;
create trigger pipelines_default_guard
  before insert or update on public.pipelines
  for each row execute function public.pipelines_default_guard();

-- ------------------------------------------------------------
-- 7. A organização nunca fica sem funil, e o padrão só sai depois que
--    outro assume. Vale para qualquer caminho de exclusão (inclusive
--    chamada direta ao PostgREST), não só para delete_pipeline().
-- ------------------------------------------------------------
create or replace function public.pipelines_delete_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Cascata da exclusão da própria organização: não há funil a preservar.
  -- A organização já saiu da tabela quando a cascata chega aqui.
  if not exists (
    select 1 from public.organizations o where o.id = old.organization_id
  ) then
    return old;
  end if;

  if old.is_default then
    raise exception 'Defina outro funil como padrão antes de excluir este.'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
      from public.pipelines p
     where p.organization_id = old.organization_id
       and p.id <> old.id
  ) then
    raise exception 'A organização precisa manter pelo menos um funil.'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

drop trigger if exists pipelines_delete_guard on public.pipelines;
create trigger pipelines_delete_guard
  before delete on public.pipelines
  for each row execute function public.pipelines_delete_guard();

-- ------------------------------------------------------------
-- 8. Policies — estrutura de funil é assunto de administrador
--
-- Leitura continua para todo membro (has_org_access): seller e agent
-- precisam enxergar funis e etapas para trabalhar seus leads.
-- Criar, renomear e alterar etapas passa a exigir org_admin.
-- As policies de exclusão já exigiam org_admin desde a 0003.
-- ------------------------------------------------------------
drop policy if exists "pipelines: escrita por membros" on public.pipelines;
drop policy if exists "pipelines: edição por membros" on public.pipelines;
drop policy if exists "pipelines: criação por org_admin" on public.pipelines;
drop policy if exists "pipelines: edição por org_admin" on public.pipelines;

create policy "pipelines: criação por org_admin"
  on public.pipelines for insert
  with check (public.is_org_admin(organization_id));

create policy "pipelines: edição por org_admin"
  on public.pipelines for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "stages: escrita" on public.pipeline_stages;
drop policy if exists "stages: edição" on public.pipeline_stages;
drop policy if exists "stages: criação por org_admin" on public.pipeline_stages;
drop policy if exists "stages: edição por org_admin" on public.pipeline_stages;

create policy "stages: criação por org_admin"
  on public.pipeline_stages for insert
  with check (exists (
    select 1 from public.pipelines p
    where p.id = pipeline_id and public.is_org_admin(p.organization_id)
  ));

create policy "stages: edição por org_admin"
  on public.pipeline_stages for update
  using (exists (
    select 1 from public.pipelines p
    where p.id = pipeline_id and public.is_org_admin(p.organization_id)
  ))
  with check (exists (
    select 1 from public.pipelines p
    where p.id = pipeline_id and public.is_org_admin(p.organization_id)
  ));

-- ------------------------------------------------------------
-- 9. Criação de funil com etapas mínimas, em uma transação
--
-- deals.stage_id é obrigatório: funil sem etapa aberta é inutilizável.
-- Por isso a etapa "Lead Novo" é criada mesmo com with_default_stages
-- desligado. SECURITY DEFINER roda como dono da tabela e ignora RLS —
-- daí a checagem explícita de is_org_admin() logo na entrada.
-- ------------------------------------------------------------
create or replace function public.create_pipeline(
  org_id uuid,
  pipeline_name text,
  pipeline_description text default null,
  with_default_stages boolean default true
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  novo_id uuid;
  nome text := nullif(btrim(coalesce(pipeline_name, '')), '');
  descricao text := nullif(btrim(coalesce(pipeline_description, '')), '');
begin
  if org_id is null then
    raise exception 'Organização não informada.' using errcode = 'P0001';
  end if;

  if not public.is_org_admin(org_id) then
    raise exception 'Somente administradores da organização podem criar funis.'
      using errcode = '42501';
  end if;

  if nome is null then
    raise exception 'Informe o nome do funil.' using errcode = 'P0001';
  end if;

  -- is_default é decidido pelo trigger pipelines_default_guard:
  -- padrão apenas se a organização ainda não tiver nenhum funil.
  insert into public.pipelines (organization_id, name, description)
  values (org_id, nome, descricao)
  returning id into novo_id;

  if coalesce(with_default_stages, true) then
    insert into public.pipeline_stages
      (pipeline_id, name, order_index, color, is_won_stage, is_lost_stage)
    values
      (novo_id, 'Lead Novo', 0, '#2563eb', false, false),
      (novo_id, 'Ganho',     1, '#10b981', true,  false),
      (novo_id, 'Perdido',   2, '#ef4444', false, true);
  else
    insert into public.pipeline_stages
      (pipeline_id, name, order_index, color, is_won_stage, is_lost_stage)
    values
      (novo_id, 'Lead Novo', 0, '#2563eb', false, false);
  end if;

  return novo_id;
end;
$$;

-- ------------------------------------------------------------
-- 10. Tornar padrão (ação explícita do administrador)
-- ------------------------------------------------------------
create or replace function public.set_default_pipeline(target_pipeline_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  org uuid;
begin
  select p.organization_id
    into org
    from public.pipelines p
   where p.id = target_pipeline_id;

  if org is null then
    raise exception 'Funil não encontrado.' using errcode = 'P0001';
  end if;

  if not public.is_org_admin(org) then
    raise exception 'Somente administradores da organização podem definir o funil padrão.'
      using errcode = '42501';
  end if;

  -- Libera a troca para o trigger pipelines_default_guard; o GUC é local
  -- à transação e volta a 'off' antes de a função retornar.
  perform set_config('wavemov.pipeline_default_switch', 'on', true);

  update public.pipelines
     set is_default = false
   where organization_id = org
     and is_default
     and id <> target_pipeline_id;

  update public.pipelines
     set is_default = true
   where id = target_pipeline_id
     and not is_default;

  perform set_config('wavemov.pipeline_default_switch', 'off', true);

  return target_pipeline_id;
end;
$$;

-- ------------------------------------------------------------
-- 11. O que impede a exclusão de um funil
--
-- Serve para a interface explicar o bloqueio antes de tentar excluir,
-- em vez de traduzir erro cru do PostgREST. SECURITY DEFINER porque a
-- contagem de negociações precisa ser a da organização inteira — sob RLS
-- um seller enxerga apenas os próprios leads e o número sairia menor.
-- ------------------------------------------------------------
create or replace function public.pipeline_delete_blockers(target_pipeline_id uuid)
returns table (
  deals_count      bigint,
  forms_count      bigint,
  is_default       boolean,
  is_last_pipeline boolean
)
language plpgsql security definer set search_path = public
as $$
declare
  org uuid;
  padrao boolean;
begin
  select p.organization_id, p.is_default
    into org, padrao
    from public.pipelines p
   where p.id = target_pipeline_id;

  if org is null then
    raise exception 'Funil não encontrado.' using errcode = 'P0001';
  end if;

  if not public.is_org_admin(org) then
    raise exception 'Somente administradores da organização podem administrar funis.'
      using errcode = '42501';
  end if;

  return query
  select
    (select count(*)
       from public.deals d
      where d.organization_id = org
        and d.pipeline_id = target_pipeline_id),
    (select count(*)
       from public.forms f
      where f.organization_id = org
        and (
          f.pipeline_id = target_pipeline_id
          or f.stage_id in (
            select s.id from public.pipeline_stages s
             where s.pipeline_id = target_pipeline_id
          )
        )),
    padrao,
    not exists (
      select 1 from public.pipelines p
       where p.organization_id = org
         and p.id <> target_pipeline_id
    );
end;
$$;

-- ------------------------------------------------------------
-- 12. Exclusão de funil
--
-- Recusa antes de tocar em qualquer linha. As FKs restrict das etapas 4 e 5
-- continuam sendo a última linha de defesa para caminhos que não passem
-- por aqui. Formulário que aponta para uma etapa deste funil também bloqueia:
-- forms.stage_id é `on delete set null` e as etapas caem em cascata com o
-- funil, então a exclusão silenciaria a configuração do formulário.
-- ------------------------------------------------------------
create or replace function public.delete_pipeline(target_pipeline_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  org uuid;
  padrao boolean;
  total_deals bigint;
  total_forms bigint;
begin
  select p.organization_id, p.is_default
    into org, padrao
    from public.pipelines p
   where p.id = target_pipeline_id;

  if org is null then
    raise exception 'Funil não encontrado.' using errcode = 'P0001';
  end if;

  if not public.is_org_admin(org) then
    raise exception 'Somente administradores da organização podem excluir funis.'
      using errcode = '42501';
  end if;

  if padrao then
    raise exception 'Defina outro funil como padrão antes de excluir este.'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.pipelines p
     where p.organization_id = org
       and p.id <> target_pipeline_id
  ) then
    raise exception 'A organização precisa manter pelo menos um funil.'
      using errcode = 'P0001';
  end if;

  select count(*)
    into total_deals
    from public.deals d
   where d.organization_id = org
     and d.pipeline_id = target_pipeline_id;

  if total_deals > 0 then
    raise exception 'Este funil tem % negociação(ões) vinculada(s). Mova-as antes de excluir.', total_deals
      using errcode = 'P0001';
  end if;

  select count(*)
    into total_forms
    from public.forms f
   where f.organization_id = org
     and (
       f.pipeline_id = target_pipeline_id
       or f.stage_id in (
         select s.id from public.pipeline_stages s
          where s.pipeline_id = target_pipeline_id
       )
     );

  if total_forms > 0 then
    raise exception 'Este funil é usado por % formulário(s). Aponte-os para outro funil antes de excluir.', total_forms
      using errcode = 'P0001';
  end if;

  delete from public.pipelines where id = target_pipeline_id;
end;
$$;

-- ------------------------------------------------------------
-- 13. Privilégios das funções novas
--
-- No Postgres, EXECUTE em função nasce concedido a PUBLIC. Como estas são
-- SECURITY DEFINER, o acesso é revogado e concedido explicitamente.
-- ------------------------------------------------------------
revoke all on function public.create_pipeline(uuid, text, text, boolean) from public;
revoke all on function public.set_default_pipeline(uuid) from public;
revoke all on function public.pipeline_delete_blockers(uuid) from public;
revoke all on function public.delete_pipeline(uuid) from public;

grant execute on function public.create_pipeline(uuid, text, text, boolean)
  to authenticated, service_role;
grant execute on function public.set_default_pipeline(uuid)
  to authenticated, service_role;
grant execute on function public.pipeline_delete_blockers(uuid)
  to authenticated, service_role;
grant execute on function public.delete_pipeline(uuid)
  to authenticated, service_role;

-- A resolução do funil padrão (`organization_id = ? and is_default`) já é
-- servida pelo índice único parcial da etapa 3. Nenhum índice novo aqui.

notify pgrst, 'reload schema';
