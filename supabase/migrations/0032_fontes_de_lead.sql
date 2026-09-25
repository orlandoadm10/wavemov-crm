-- ============================================================
-- CRM JID Mídia — 0032: Fontes de lead (conexões nativas)
--
-- O cliente precisa ligar Typeform, Meta Lead Ads e qualquer ferramenta que
-- dispare HTTP sem montar fluxo no n8n. `POST /api/ingest/leads` (0014) não
-- serve para isso sem intermediário: exige um corpo no contrato do CRM e um
-- cabeçalho de segredo que o Typeform e a maioria das ferramentas simples não
-- deixam configurar.
--
-- Uma FONTE é uma conexão com uma origem. Ela tem:
--   - uma URL própria, com o segredo no caminho (`/api/inbound/<token>`),
--     porque é o único lugar que toda origem consegue carregar;
--   - um tradutor (`provider`) que entende o payload daquela origem;
--   - um mapeamento de campos editável na tela;
--   - um FORMULÁRIO de destino. É ele que continua decidindo funil, etapa,
--     responsável, campos aceitos, deduplicação, distribuição e saúde — nada
--     disso foi reescrito, a fonte só alimenta o caminho que já existia.
--
-- Por que um segredo POR FONTE e não o da empresa (0014): a URL fica colada
-- num painel de terceiro. Trocá-la ou desligá-la não pode derrubar as outras
-- conexões da empresa, que é exatamente o que a rotação da 0014 faz.
--
-- Aditiva e idempotente. Sem tabela temporária e sem begin/commit: o cliente
-- cola este arquivo no painel do Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Chave composta em `forms` para a FK da fonte
--
-- A fonte aponta para (form_id, organization_id). Com a FK composta o banco
-- recusa, sozinho, uma fonte da empresa A ligada a um formulário da B — sem
-- trigger e sem confiar na aplicação. `id` já é único; o índice é só o alvo
-- que a FK composta exige.
-- ------------------------------------------------------------
create unique index if not exists forms_id_organization_key
  on public.forms (id, organization_id);

-- ------------------------------------------------------------
-- 2. Fontes
-- ------------------------------------------------------------
create table if not exists public.lead_sources (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  form_id         uuid not null,
  name            text not null check (char_length(btrim(name)) between 2 and 80),
  provider        text not null check (provider in ('typeform', 'webhook', 'meta_lead_ads')),
  is_active       boolean not null default true,
  -- { "<chave recebida>": "<field_key do formulário>" | "" }. "" = só nas
  -- informações do lead. Chave ausente = sugestão automática.
  field_mapping   jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(field_mapping) = 'object'),
  last_event_at   timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint lead_sources_form_same_org_fkey
    foreign key (form_id, organization_id)
    references public.forms (id, organization_id) on delete cascade
);

create index if not exists lead_sources_org_idx
  on public.lead_sources (organization_id, created_at desc);
create index if not exists lead_sources_form_idx
  on public.lead_sources (form_id);

comment on table public.lead_sources is
  'Conexão nativa com uma origem de leads (Typeform, webhook genérico, Meta Lead Ads). Recebe em /api/inbound/<token> e entrega ao formulário de destino, que decide funil, etapa e responsável.';

alter table public.lead_sources enable row level security;

drop policy if exists "lead_sources: org_admin lê" on public.lead_sources;
create policy "lead_sources: org_admin lê"
  on public.lead_sources for select
  using (public.is_org_admin(organization_id));

drop policy if exists "lead_sources: org_admin cria" on public.lead_sources;
create policy "lead_sources: org_admin cria"
  on public.lead_sources for insert
  with check (public.is_org_admin(organization_id));

drop policy if exists "lead_sources: org_admin altera" on public.lead_sources;
create policy "lead_sources: org_admin altera"
  on public.lead_sources for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "lead_sources: org_admin exclui" on public.lead_sources;
create policy "lead_sources: org_admin exclui"
  on public.lead_sources for delete
  using (public.is_org_admin(organization_id));

revoke all on public.lead_sources from anon;
grant select, insert, update, delete on public.lead_sources to authenticated;
grant all on public.lead_sources to service_role;

-- ------------------------------------------------------------
-- 3. Segredo da fonte
--
-- Mesmo isolamento da `organization_ingest_secrets` (0014): tabela revogada
-- de anon e authenticated, RLS ligado SEM policy. Só o servidor lê, com
-- service_role, e a tela só monta a URL para org_admin. Separado de
-- `lead_sources` porque aquela é legível pelo PostgREST — um `select *` do
-- navegador não pode trazer o token junto.
-- ------------------------------------------------------------
create table if not exists public.lead_source_secrets (
  lead_source_id  uuid primary key references public.lead_sources (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  token           text not null default public.generate_webhook_secret(),
  created_at      timestamptz not null default now(),
  rotated_at      timestamptz
);

create unique index if not exists lead_source_secrets_token_key
  on public.lead_source_secrets (token);

comment on table public.lead_source_secrets is
  'Token que compõe a URL /api/inbound/<token> de UMA fonte de lead. Nunca sai do servidor (revogada de anon e authenticated, RLS sem policy). Rotação por fonte, sem período de compatibilidade.';

revoke all on table public.lead_source_secrets from anon;
revoke all on table public.lead_source_secrets from authenticated;
grant all on table public.lead_source_secrets to service_role;
alter table public.lead_source_secrets enable row level security;

-- ------------------------------------------------------------
-- 4. Eventos recebidos
--
-- Cada chamada autenticada vira uma linha, com o resultado e o motivo. É o
-- que permite a quem não é técnico ver "chegou, mas faltou o telefone" em vez
-- de "parou de chegar lead", testar a conexão ao vivo e reprocessar depois de
-- corrigir o mapeamento. `fields` guarda o payload JÁ TRADUZIDO (lista de
-- chave/rótulo/valor), nunca o corpo cru: é o que a tela precisa, e o cru da
-- Meta ou do Typeform carrega dezenas de campos técnicos sem uso.
--
-- Contém dado pessoal do lead. A aplicação apaga eventos com mais de 30 dias
-- a cada entrega da fonte; o lead em si continua em contacts/deals.
--
-- Só org_admin lê. Ninguém escreve pelo PostgREST: a rota grava com
-- service_role.
-- ------------------------------------------------------------
create table if not exists public.lead_source_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lead_source_id  uuid not null references public.lead_sources (id) on delete cascade,
  received_at     timestamptz not null default now(),
  status          text not null check (status in ('processed', 'duplicate', 'failed')),
  event_key       text,
  fields          jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  error           text,
  deal_id         uuid references public.deals (id) on delete set null,
  deduplicated    boolean not null default false
);

create index if not exists lead_source_events_source_idx
  on public.lead_source_events (lead_source_id, received_at desc);

comment on table public.lead_source_events is
  'Registro de cada entrega recebida por uma fonte de lead: resultado, motivo da falha e campos traduzidos. Retenção de 30 dias, aplicada pela rota.';

alter table public.lead_source_events enable row level security;

drop policy if exists "lead_source_events: org_admin lê" on public.lead_source_events;
create policy "lead_source_events: org_admin lê"
  on public.lead_source_events for select
  using (public.is_org_admin(organization_id));

revoke all on public.lead_source_events from anon;
revoke insert, update, delete on public.lead_source_events from authenticated;
grant select on public.lead_source_events to authenticated;
grant all on public.lead_source_events to service_role;

-- Registro no ledger — rode junto ao aplicar pelo painel:
-- insert into supabase_migrations.schema_migrations (version, name)
-- values ('0032', 'fontes_de_lead')
-- on conflict (version) do nothing;
