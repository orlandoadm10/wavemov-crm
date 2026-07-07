-- ============================================================
-- Wavemov CRM — 0001: Extensões, helpers e tabelas principais
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Trigger genérico de updated_at
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- ORGANIZAÇÕES (empresas/tenants)
-- ------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  logo_url    text,
  segment     text,
  owner_name  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- PERFIS (1:1 com auth.users)
-- ------------------------------------------------------------
create table public.profiles (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique references auth.users (id) on delete cascade,
  first_name      text not null default '',
  last_name       text not null default '',
  email           text not null default '',
  phone           text,
  avatar_url      text,
  job_title       text,
  is_global_admin boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index profiles_auth_user_id_idx on public.profiles (auth_user_id);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Cria profile automaticamente quando um usuário se registra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (auth_user_id, email, first_name, last_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- MEMBROS DA ORGANIZAÇÃO
-- roles: org_admin | seller | agent | viewer
-- ------------------------------------------------------------
create table public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  role            text not null default 'seller'
                    check (role in ('org_admin', 'seller', 'agent', 'viewer')),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, profile_id)
);

create index organization_members_org_idx on public.organization_members (organization_id);
create index organization_members_profile_idx on public.organization_members (profile_id);

-- ------------------------------------------------------------
-- FUNIS E ETAPAS
-- ------------------------------------------------------------
create table public.pipelines (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  description     text,
  created_at      timestamptz not null default now()
);

create index pipelines_org_idx on public.pipelines (organization_id);

create table public.pipeline_stages (
  id            uuid primary key default gen_random_uuid(),
  pipeline_id   uuid not null references public.pipelines (id) on delete cascade,
  name          text not null,
  order_index   integer not null default 0,
  color         text not null default '#2563eb',
  is_won_stage  boolean not null default false,
  is_lost_stage boolean not null default false,
  created_at    timestamptz not null default now()
);

create index pipeline_stages_pipeline_idx on public.pipeline_stages (pipeline_id, order_index);

-- ------------------------------------------------------------
-- CONTATOS
-- ------------------------------------------------------------
create table public.contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  email           text,
  phone           text,
  whatsapp_phone  text,
  avatar_url      text,
  document        text,
  city            text,
  state           text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index contacts_org_idx on public.contacts (organization_id);
create index contacts_whatsapp_idx on public.contacts (organization_id, whatsapp_phone);

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- MOTIVOS DE PERDA
-- ------------------------------------------------------------
create table public.lost_reasons (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  created_at      timestamptz not null default now()
);

create index lost_reasons_org_idx on public.lost_reasons (organization_id);

-- ------------------------------------------------------------
-- NEGOCIAÇÕES (deals)
-- ------------------------------------------------------------
create table public.deals (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  pipeline_id         uuid not null references public.pipelines (id) on delete cascade,
  stage_id            uuid not null references public.pipeline_stages (id) on delete restrict,
  contact_id          uuid references public.contacts (id) on delete set null,
  company_id          uuid references public.organizations (id) on delete set null,
  responsible_id      uuid references public.profiles (id) on delete set null,
  title               text not null,
  value               numeric(14, 2) not null default 0,
  status              text not null default 'open'
                        check (status in ('open', 'won', 'lost', 'archived')),
  source              text,
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  utm_content         text,
  utm_term            text,
  temperature         text not null default 'cold'
                        check (temperature in ('cold', 'warm', 'hot')),
  ai_status           text not null default 'none'
                        check (ai_status in ('none', 'qualifying', 'qualified', 'handoff')),
  expected_close_date date,
  won_at              timestamptz,
  lost_at             timestamptz,
  lost_reason_id      uuid references public.lost_reasons (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index deals_org_idx on public.deals (organization_id);
create index deals_stage_idx on public.deals (stage_id);
create index deals_pipeline_idx on public.deals (pipeline_id);
create index deals_contact_idx on public.deals (contact_id);
create index deals_status_idx on public.deals (organization_id, status);

create trigger deals_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

-- Histórico de movimentação entre etapas
create table public.deal_stage_history (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals (id) on delete cascade,
  from_stage_id uuid references public.pipeline_stages (id) on delete set null,
  to_stage_id   uuid references public.pipeline_stages (id) on delete set null,
  changed_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index deal_stage_history_deal_idx on public.deal_stage_history (deal_id, created_at);

-- ------------------------------------------------------------
-- TAREFAS
-- ------------------------------------------------------------
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  deal_id         uuid references public.deals (id) on delete cascade,
  contact_id      uuid references public.contacts (id) on delete set null,
  assigned_to     uuid references public.profiles (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  title           text not null,
  description     text,
  due_at          timestamptz,
  priority        text not null default 'medium'
                    check (priority in ('low', 'medium', 'high')),
  status          text not null default 'pending'
                    check (status in ('pending', 'done')),
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index tasks_org_idx on public.tasks (organization_id, status, due_at);
create index tasks_deal_idx on public.tasks (deal_id);

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- HISTÓRICO / ATIVIDADES
-- ------------------------------------------------------------
create table public.activity_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id        uuid references public.profiles (id) on delete set null,
  deal_id         uuid references public.deals (id) on delete cascade,
  contact_id      uuid references public.contacts (id) on delete cascade,
  type            text not null,
  title           text not null,
  description     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index activity_logs_org_idx on public.activity_logs (organization_id, created_at desc);
create index activity_logs_deal_idx on public.activity_logs (deal_id, created_at desc);

-- ------------------------------------------------------------
-- CAMPOS PERSONALIZADOS
-- ------------------------------------------------------------
create table public.custom_fields (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_type     text not null check (entity_type in ('deal', 'contact', 'company')),
  label           text not null,
  field_key       text not null,
  field_type      text not null default 'text'
                    check (field_type in ('text', 'number', 'date', 'select', 'boolean')),
  options         jsonb not null default '[]'::jsonb,
  is_required     boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (organization_id, entity_type, field_key)
);

create table public.custom_field_values (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_type     text not null check (entity_type in ('deal', 'contact', 'company')),
  entity_id       uuid not null,
  field_id        uuid not null references public.custom_fields (id) on delete cascade,
  value           text,
  created_at      timestamptz not null default now(),
  unique (field_id, entity_id)
);

create index custom_field_values_entity_idx on public.custom_field_values (entity_type, entity_id);
