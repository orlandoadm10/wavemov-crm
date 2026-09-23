-- ============================================================
-- CRM JID Mídia — 0026: Agentes de IA e base de conhecimento (RAG)
--
-- Aditiva e idempotente: só cria objetos novos. Nenhuma tabela existente é
-- alterada aqui.
--
-- Modelo:
--   ai_agents            — um agente por "persona" da empresa: prompt, modelo,
--                          ferramentas do CRM que pode usar, regras de handoff.
--   knowledge_documents  — material que a empresa ensina ao agente.
--   knowledge_chunks     — trechos com embedding (pgvector) para a busca.
--   ai_runs              — trilha de cada turno do agente (auditoria e custo).
--
-- Segurança:
--   * leitura por membro da organização; escrita de configuração só por
--     org_admin (mesmo contrato de /distribuicao e /tags);
--   * `knowledge_chunks` e `ai_runs` não têm policy de escrita para
--     `authenticated`: só o servidor (service_role) grava, sempre filtrando
--     organization_id de fonte confiável;
--   * `match_knowledge_chunks` recebe a organização como parâmetro e só pode
--     ser executada por service_role — nunca exposta ao navegador.
--
-- Aplicação manual pelo painel: nenhuma instrução depende de estado de sessão
-- (sem tabela temporária, sem begin/commit), como exige o HANDOFF.
-- ============================================================

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- ------------------------------------------------------------
-- AGENTES
-- ------------------------------------------------------------
create table if not exists public.ai_agents (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete cascade,
  name                      text not null,
  description               text,
  is_active                 boolean not null default false,
  is_default                boolean not null default false,
  model                     text not null default 'gpt-4o-mini',
  temperature               numeric(3, 2) not null default 0.40
                              check (temperature >= 0 and temperature <= 1.5),
  system_prompt             text not null default '',
  -- Ferramentas do CRM liberadas para o agente (ver lib/features/crm-tools).
  enabled_tools             text[] not null default array[
                              'get_lead_context', 'update_contact', 'update_deal',
                              'move_deal_stage', 'add_note', 'create_task',
                              'search_knowledge', 'save_qualification', 'handoff_to_human'
                            ]::text[],
  use_knowledge_base        boolean not null default true,
  -- Conversa nova começa atendida por IA quando este agente é o padrão ativo.
  auto_reply_new_conversations boolean not null default true,
  -- Espera antes de responder: agrupa mensagens picadas do lead num turno só.
  reply_delay_seconds       integer not null default 4
                              check (reply_delay_seconds between 0 and 30),
  handoff_on_request        boolean not null default true,
  handoff_on_legal          boolean not null default true,
  handoff_on_uncertainty    boolean not null default false,
  handoff_message           text,
  -- Campos que o agente deve extrair e salvar em deals.ai_qualification.
  -- Formato: [{ "key": "orcamento", "label": "Orçamento", "description": "..." }]
  qualification_fields      jsonb not null default '[]'::jsonb,
  created_by                uuid references public.profiles (id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists ai_agents_org_idx on public.ai_agents (organization_id);
-- No máximo um agente padrão por empresa.
create unique index if not exists ai_agents_one_default_per_org
  on public.ai_agents (organization_id) where is_default;

drop trigger if exists ai_agents_updated_at on public.ai_agents;
create trigger ai_agents_updated_at
  before update on public.ai_agents
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- BASE DE CONHECIMENTO
-- ------------------------------------------------------------
create table if not exists public.knowledge_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- null = material de todos os agentes da empresa.
  agent_id        uuid references public.ai_agents (id) on delete cascade,
  title           text not null,
  source_type     text not null default 'text'
                    check (source_type in ('text', 'faq', 'url')),
  source_url      text,
  content         text not null default '',
  status          text not null default 'pending'
                    check (status in ('pending', 'indexing', 'ready', 'error')),
  error           text,
  chunk_count     integer not null default 0,
  indexed_at      timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists knowledge_documents_org_idx
  on public.knowledge_documents (organization_id, created_at desc);

drop trigger if exists knowledge_documents_updated_at on public.knowledge_documents;
create trigger knowledge_documents_updated_at
  before update on public.knowledge_documents
  for each row execute function public.set_updated_at();

create table if not exists public.knowledge_chunks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id     uuid not null references public.knowledge_documents (id) on delete cascade,
  chunk_index     integer not null,
  content         text not null,
  embedding       extensions.vector(1536) not null,
  created_at      timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists knowledge_chunks_org_idx
  on public.knowledge_chunks (organization_id);
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ------------------------------------------------------------
-- TRILHA DOS TURNOS
-- ------------------------------------------------------------
create table if not exists public.ai_runs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  agent_id          uuid references public.ai_agents (id) on delete set null,
  conversation_id   uuid references public.whatsapp_conversations (id) on delete set null,
  deal_id           uuid references public.deals (id) on delete set null,
  trigger           text not null default 'inbound'
                      check (trigger in ('inbound', 'manual', 'automation', 'test')),
  status            text not null
                      check (status in ('success', 'handoff', 'skipped', 'error')),
  input_text        text,
  output_text       text,
  tool_calls        jsonb not null default '[]'::jsonb,
  model             text,
  prompt_tokens     integer not null default 0,
  completion_tokens integer not null default 0,
  latency_ms        integer,
  error             text,
  created_at        timestamptz not null default now()
);

create index if not exists ai_runs_org_idx on public.ai_runs (organization_id, created_at desc);
create index if not exists ai_runs_conversation_idx on public.ai_runs (conversation_id, created_at desc);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.ai_agents enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.ai_runs enable row level security;

drop policy if exists "ai_agents: membros leem" on public.ai_agents;
create policy "ai_agents: membros leem"
  on public.ai_agents for select
  using (public.has_org_access(organization_id));

drop policy if exists "ai_agents: org_admin cria" on public.ai_agents;
create policy "ai_agents: org_admin cria"
  on public.ai_agents for insert
  with check (public.is_org_admin(organization_id));

drop policy if exists "ai_agents: org_admin edita" on public.ai_agents;
create policy "ai_agents: org_admin edita"
  on public.ai_agents for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "ai_agents: org_admin remove" on public.ai_agents;
create policy "ai_agents: org_admin remove"
  on public.ai_agents for delete
  using (public.is_org_admin(organization_id));

drop policy if exists "knowledge_documents: membros leem" on public.knowledge_documents;
create policy "knowledge_documents: membros leem"
  on public.knowledge_documents for select
  using (public.has_org_access(organization_id));

drop policy if exists "knowledge_documents: org_admin cria" on public.knowledge_documents;
create policy "knowledge_documents: org_admin cria"
  on public.knowledge_documents for insert
  with check (public.is_org_admin(organization_id));

drop policy if exists "knowledge_documents: org_admin edita" on public.knowledge_documents;
create policy "knowledge_documents: org_admin edita"
  on public.knowledge_documents for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "knowledge_documents: org_admin remove" on public.knowledge_documents;
create policy "knowledge_documents: org_admin remove"
  on public.knowledge_documents for delete
  using (public.is_org_admin(organization_id));

-- Trechos: leitura para quem administra; escrita apenas service_role.
drop policy if exists "knowledge_chunks: org_admin lê" on public.knowledge_chunks;
create policy "knowledge_chunks: org_admin lê"
  on public.knowledge_chunks for select
  using (public.is_org_admin(organization_id));

-- Turnos: visão gerencial vê a empresa; seller/agent vê os das próprias conversas.
drop policy if exists "ai_runs: leitura por visibilidade" on public.ai_runs;
create policy "ai_runs: leitura por visibilidade"
  on public.ai_runs for select
  using (
    public.has_full_lead_visibility(organization_id)
    or (conversation_id is not null and public.can_access_conversation(conversation_id))
  );

-- ------------------------------------------------------------
-- Busca semântica — somente servidor
-- ------------------------------------------------------------
create or replace function public.match_knowledge_chunks(
  p_organization_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 5,
  p_agent_id uuid default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  title text,
  content text,
  similarity double precision
)
language sql stable
set search_path = public, extensions
as $$
  select
    c.id,
    c.document_id,
    d.title,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
  where c.organization_id = p_organization_id
    and d.organization_id = p_organization_id
    and d.status = 'ready'
    and (d.agent_id is null or p_agent_id is null or d.agent_id = p_agent_id)
  order by c.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 5), 20));
$$;

revoke all on function public.match_knowledge_chunks(uuid, extensions.vector, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks(uuid, extensions.vector, integer, uuid)
  to service_role;

grant select, insert, update, delete on public.ai_agents to authenticated;
grant select, insert, update, delete on public.knowledge_documents to authenticated;
-- Os default privileges da 0006 dão escrita a `authenticated` em toda tabela
-- nova. Aqui a escrita é só do servidor: revogar é a segunda trava, além da
-- ausência de policy.
revoke insert, update, delete on public.knowledge_chunks, public.ai_runs from authenticated;
revoke all on public.knowledge_chunks, public.ai_runs from anon;
grant select on public.knowledge_chunks to authenticated;
grant select on public.ai_runs to authenticated;
grant all on public.ai_agents, public.knowledge_documents, public.knowledge_chunks, public.ai_runs
  to service_role;
