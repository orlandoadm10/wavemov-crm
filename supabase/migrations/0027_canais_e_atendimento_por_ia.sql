-- ============================================================
-- CRM JID Mídia — 0027: Canais (UAZAPI + Meta Cloud API) e atendimento por IA
--
-- Aditiva e idempotente. Só ACRESCENTA colunas com default e uma trigger;
-- nenhuma coluna existente muda de tipo e nenhum dado é apagado.
--
-- 1. whatsapp_instances ganha o necessário para a API oficial da Meta
--    (phone_number_id, business_account_id). O token continua em
--    `token_encrypted` e o verify token do webhook é o `webhook_secret` da
--    própria instância (0010) — nenhum segredo novo por instância.
-- 2. whatsapp_conversations ganha o modo de atendimento (ai | human), o agente
--    responsável, o motivo do handoff e o estado de follow-up.
-- 3. whatsapp_messages ganha `sender_type` (quem escreveu: contato, equipe,
--    IA, automação, sistema) e `delivery_status` (status da Meta/UAZAPI).
-- 4. pipeline_stages ganha `requires_human`: lead nessa etapa nunca é
--    respondido pela IA.
-- 5. deals ganha `ai_qualification` (extração estruturada do agente).
-- 6. Trigger em whatsapp_messages mantém na conversa a direção da última
--    mensagem e a hora do último inbound — insumo do follow-up e da janela
--    de 24h da Meta — para TODO caminho de escrita, não só o que lembrar.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Instâncias
-- ------------------------------------------------------------
alter table public.whatsapp_instances
  add column if not exists phone_number_id text,
  add column if not exists business_account_id text,
  add column if not exists display_phone text;

-- Um phone_number_id da Meta pertence a uma única instância: é por ele que o
-- webhook descobre a empresa. Sem unicidade, a mensagem de uma empresa poderia
-- ser gravada em outra.
create unique index if not exists whatsapp_instances_phone_number_id_key
  on public.whatsapp_instances (phone_number_id)
  where phone_number_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_instances_provider_check'
      and conrelid = 'public.whatsapp_instances'::regclass
  ) then
    alter table public.whatsapp_instances
      add constraint whatsapp_instances_provider_check
      check (provider in ('uazapi', 'meta_cloud')) not valid;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 2. Conversas
-- ------------------------------------------------------------
alter table public.whatsapp_conversations
  add column if not exists handling_mode text not null default 'human',
  add column if not exists ai_agent_id uuid references public.ai_agents (id) on delete set null,
  add column if not exists handoff_reason text,
  add column if not exists handoff_at timestamptz,
  add column if not exists last_message_direction text,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists followup_count integer not null default 0,
  add column if not exists last_followup_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_conversations_handling_mode_check'
      and conrelid = 'public.whatsapp_conversations'::regclass
  ) then
    alter table public.whatsapp_conversations
      add constraint whatsapp_conversations_handling_mode_check
      check (handling_mode in ('ai', 'human'));
  end if;
end;
$$;

create index if not exists whatsapp_conversations_followup_idx
  on public.whatsapp_conversations (organization_id, last_message_at)
  where last_message_direction = 'outbound' and status in ('open', 'pending');

-- ------------------------------------------------------------
-- 3. Mensagens
-- ------------------------------------------------------------
alter table public.whatsapp_messages
  add column if not exists sender_type text,
  add column if not exists delivery_status text;

-- Preenche o histórico de forma conservadora: entrada é do contato, saída é
-- da equipe (IA e automação não existiam antes desta migration).
update public.whatsapp_messages
   set sender_type = case when direction = 'inbound' then 'contact' else 'user' end
 where sender_type is null;

alter table public.whatsapp_messages
  alter column sender_type set default 'contact';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_messages_sender_type_check'
      and conrelid = 'public.whatsapp_messages'::regclass
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_sender_type_check
      check (sender_type in ('contact', 'user', 'ai', 'automation', 'system'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'whatsapp_messages_delivery_status_check'
      and conrelid = 'public.whatsapp_messages'::regclass
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_delivery_status_check
      check (delivery_status is null
             or delivery_status in ('pending', 'sent', 'delivered', 'read', 'failed'));
  end if;
end;
$$;

-- Status da Meta chega pelo id do provedor, sem a conversa: índice para achar.
create index if not exists whatsapp_messages_provider_lookup_idx
  on public.whatsapp_messages (organization_id, provider_message_id)
  where provider_message_id is not null;

-- ------------------------------------------------------------
-- 4. Etapas que exigem humano
-- ------------------------------------------------------------
alter table public.pipeline_stages
  add column if not exists requires_human boolean not null default false;

-- ------------------------------------------------------------
-- 5. Qualificação estruturada do lead
-- ------------------------------------------------------------
alter table public.deals
  add column if not exists ai_qualification jsonb not null default '{}'::jsonb;

-- ------------------------------------------------------------
-- 6. Estado derivado da última mensagem
-- ------------------------------------------------------------
create or replace function public.whatsapp_message_touch_conversation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.direction = 'inbound' then
    -- O lead respondeu: a régua de follow-up recomeça do zero.
    update public.whatsapp_conversations
       set last_message_direction = 'inbound',
           last_inbound_at = new.created_at,
           followup_count = 0
     where id = new.conversation_id
       and organization_id = new.organization_id;
  else
    update public.whatsapp_conversations
       set last_message_direction = 'outbound'
     where id = new.conversation_id
       and organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_messages_touch_conversation on public.whatsapp_messages;
create trigger whatsapp_messages_touch_conversation
  after insert on public.whatsapp_messages
  for each row execute function public.whatsapp_message_touch_conversation();

-- Backfill do estado derivado para as conversas que já existem.
update public.whatsapp_conversations c
   set last_message_direction = m.direction
  from (
    select distinct on (conversation_id) conversation_id, direction
      from public.whatsapp_messages
     order by conversation_id, created_at desc
  ) m
 where m.conversation_id = c.id
   and c.last_message_direction is null;

update public.whatsapp_conversations c
   set last_inbound_at = m.last_in
  from (
    select conversation_id, max(created_at) as last_in
      from public.whatsapp_messages
     where direction = 'inbound'
     group by conversation_id
  ) m
 where m.conversation_id = c.id
   and c.last_inbound_at is null;
