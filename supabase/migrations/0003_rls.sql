-- ============================================================
-- Wavemov CRM — 0003: Row Level Security
-- Isolamento total por organização + papéis.
-- ============================================================

-- ------------------------------------------------------------
-- Funções auxiliares (SECURITY DEFINER para evitar recursão de RLS)
-- ------------------------------------------------------------

-- Profile do usuário autenticado
create or replace function public.current_profile_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid();
$$;

-- É admin global?
create or replace function public.is_global_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select is_global_admin from public.profiles where auth_user_id = auth.uid()),
    false
  );
$$;

-- Organizações às quais o usuário pertence (membro ativo)
create or replace function public.user_org_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select om.organization_id
  from public.organization_members om
  join public.profiles p on p.id = om.profile_id
  where p.auth_user_id = auth.uid() and om.is_active;
$$;

-- Pode ler dados da organização?
create or replace function public.has_org_access(org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_global_admin()
      or org_id in (select public.user_org_ids());
$$;

-- Pode escrever (viewer é somente leitura)?
create or replace function public.has_org_write(org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_global_admin()
      or exists (
        select 1
        from public.organization_members om
        join public.profiles p on p.id = om.profile_id
        where p.auth_user_id = auth.uid()
          and om.organization_id = org_id
          and om.is_active
          and om.role in ('org_admin', 'seller', 'agent')
      );
$$;

-- É admin da organização?
create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_global_admin()
      or exists (
        select 1
        from public.organization_members om
        join public.profiles p on p.id = om.profile_id
        where p.auth_user_id = auth.uid()
          and om.organization_id = org_id
          and om.is_active
          and om.role = 'org_admin'
      );
$$;

-- ------------------------------------------------------------
-- ORGANIZATIONS
-- ------------------------------------------------------------
alter table public.organizations enable row level security;

create policy "org: membros e admin global leem"
  on public.organizations for select
  using (public.has_org_access(id));

create policy "org: admin global cria"
  on public.organizations for insert
  with check (public.is_global_admin());

create policy "org: org_admin edita"
  on public.organizations for update
  using (public.is_org_admin(id));

create policy "org: admin global exclui"
  on public.organizations for delete
  using (public.is_global_admin());

-- ------------------------------------------------------------
-- PROFILES
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

-- Vê o próprio perfil, perfis de colegas de organização, ou tudo se global admin
create policy "profiles: leitura"
  on public.profiles for select
  using (
    auth_user_id = auth.uid()
    or public.is_global_admin()
    or exists (
      select 1 from public.organization_members om
      where om.profile_id = profiles.id
        and om.organization_id in (select public.user_org_ids())
    )
  );

create policy "profiles: edita o próprio ou admin"
  on public.profiles for update
  using (
    auth_user_id = auth.uid()
    or public.is_global_admin()
    or exists (
      select 1 from public.organization_members om
      where om.profile_id = profiles.id
        and public.is_org_admin(om.organization_id)
    )
  );

create policy "profiles: admin global cria"
  on public.profiles for insert
  with check (public.is_global_admin() or auth_user_id = auth.uid());

-- ------------------------------------------------------------
-- ORGANIZATION MEMBERS
-- ------------------------------------------------------------
alter table public.organization_members enable row level security;

create policy "members: membros leem"
  on public.organization_members for select
  using (public.has_org_access(organization_id));

create policy "members: org_admin gerencia"
  on public.organization_members for insert
  with check (public.is_org_admin(organization_id));

create policy "members: org_admin edita"
  on public.organization_members for update
  using (public.is_org_admin(organization_id));

create policy "members: org_admin remove"
  on public.organization_members for delete
  using (public.is_org_admin(organization_id));

-- ------------------------------------------------------------
-- Macro de policies padrão por organização
-- (leitura = membro; escrita = membro não-viewer; delete = org_admin)
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'pipelines', 'contacts', 'lost_reasons', 'deals', 'tasks',
    'activity_logs', 'custom_fields', 'custom_field_values', 'forms',
    'whatsapp_instances', 'whatsapp_conversations', 'whatsapp_messages',
    'quick_replies'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%s: leitura por membros" on public.%I for select using (public.has_org_access(organization_id))',
      t, t);
    execute format(
      'create policy "%s: escrita por membros" on public.%I for insert with check (public.has_org_write(organization_id))',
      t, t);
    execute format(
      'create policy "%s: edição por membros" on public.%I for update using (public.has_org_write(organization_id))',
      t, t);
    execute format(
      'create policy "%s: exclusão por org_admin" on public.%I for delete using (public.is_org_admin(organization_id))',
      t, t);
  end loop;
end;
$$;

-- Ajuste: tarefas podem ser excluídas por quem pode escrever
drop policy "tasks: exclusão por org_admin" on public.tasks;
create policy "tasks: exclusão por membros"
  on public.tasks for delete
  using (public.has_org_write(organization_id));

-- ------------------------------------------------------------
-- Tabelas filhas (herdam acesso via join com o pai)
-- ------------------------------------------------------------
alter table public.pipeline_stages enable row level security;

create policy "stages: leitura"
  on public.pipeline_stages for select
  using (exists (
    select 1 from public.pipelines p
    where p.id = pipeline_id and public.has_org_access(p.organization_id)
  ));

create policy "stages: escrita"
  on public.pipeline_stages for insert
  with check (exists (
    select 1 from public.pipelines p
    where p.id = pipeline_id and public.has_org_write(p.organization_id)
  ));

create policy "stages: edição"
  on public.pipeline_stages for update
  using (exists (
    select 1 from public.pipelines p
    where p.id = pipeline_id and public.has_org_write(p.organization_id)
  ));

create policy "stages: exclusão"
  on public.pipeline_stages for delete
  using (exists (
    select 1 from public.pipelines p
    where p.id = pipeline_id and public.is_org_admin(p.organization_id)
  ));

alter table public.deal_stage_history enable row level security;

create policy "deal_history: leitura"
  on public.deal_stage_history for select
  using (exists (
    select 1 from public.deals d
    where d.id = deal_id and public.has_org_access(d.organization_id)
  ));

create policy "deal_history: escrita"
  on public.deal_stage_history for insert
  with check (exists (
    select 1 from public.deals d
    where d.id = deal_id and public.has_org_write(d.organization_id)
  ));

alter table public.form_fields enable row level security;

create policy "form_fields: leitura"
  on public.form_fields for select
  using (exists (
    select 1 from public.forms f
    where f.id = form_id and public.has_org_access(f.organization_id)
  ));

create policy "form_fields: gerencia"
  on public.form_fields for all
  using (exists (
    select 1 from public.forms f
    where f.id = form_id and public.has_org_write(f.organization_id)
  ))
  with check (exists (
    select 1 from public.forms f
    where f.id = form_id and public.has_org_write(f.organization_id)
  ));

alter table public.form_submissions enable row level security;

create policy "submissions: leitura"
  on public.form_submissions for select
  using (exists (
    select 1 from public.forms f
    where f.id = form_id and public.has_org_access(f.organization_id)
  ));
-- Inserção de submissions acontece apenas via service role (página pública)
