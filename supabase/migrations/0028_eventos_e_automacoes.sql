-- ============================================================
-- CRM JID Mídia — 0028: Eventos do CRM e automações
--
-- Arquitetura (event log leve):
--   triggers Postgres  →  crm_events (fila)  →  motor no servidor
--   (/api/cron/automations e /api/automations/dispatch)  →  ações
--
-- Trigger NUNCA faz HTTP: ela só registra o fato. É o servidor quem lê a fila
-- e executa as ações (WhatsApp, webhook para o n8n, tarefa, etapa…). Assim o
-- evento existe para todo caminho de escrita — Kanban no navegador, detalhe
-- do lead, API, IA — sem que cada um precise lembrar de avisar alguém.
--
-- Aditiva e idempotente. Nenhuma tabela existente é alterada.
-- ============================================================

-- ------------------------------------------------------------
-- FILA DE EVENTOS
-- ------------------------------------------------------------
create table if not exists public.crm_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_type      text not null,
  deal_id         uuid references public.deals (id) on delete cascade,
  contact_id      uuid references public.contacts (id) on delete set null,
  conversation_id uuid references public.whatsapp_conversations (id) on delete set null,
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'pending'
                    check (status in ('pending', 'processing', 'done', 'error', 'skipped')),
  attempts        integer not null default 0,
  run_after       timestamptz not null default now(),
  locked_at       timestamptz,
  processed_at    timestamptz,
  error           text,
  created_at      timestamptz not null default now()
);

create index if not exists crm_events_queue_idx
  on public.crm_events (run_after)
  where status = 'pending';
create index if not exists crm_events_org_idx
  on public.crm_events (organization_id, created_at desc);

-- ------------------------------------------------------------
-- REGRAS
-- ------------------------------------------------------------
create table if not exists public.automation_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  description     text,
  is_active       boolean not null default true,
  trigger_event   text not null
                    check (trigger_event in (
                      'deal.created', 'deal.stage_changed', 'deal.won', 'deal.lost',
                      'deal.assigned', 'message.received', 'conversation.no_reply'
                    )),
  -- Filtros próprios do gatilho: { pipeline_id, stage_id, hours, step }.
  trigger_config  jsonb not null default '{}'::jsonb,
  -- [{ "field": "deal.source", "op": "eq|neq|contains", "value": "..." }]
  conditions      jsonb not null default '[]'::jsonb,
  -- [{ "type": "send_whatsapp", "config": { ... } }, ...]
  actions         jsonb not null default '[]'::jsonb,
  run_count       integer not null default 0,
  last_run_at     timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists automation_rules_org_idx
  on public.automation_rules (organization_id, trigger_event)
  where is_active;

drop trigger if exists automation_rules_updated_at on public.automation_rules;
create trigger automation_rules_updated_at
  before update on public.automation_rules
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- EXECUÇÕES (auditoria + idempotência)
-- ------------------------------------------------------------
create table if not exists public.automation_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  rule_id         uuid not null references public.automation_rules (id) on delete cascade,
  -- Evento da fila, ou null nas execuções de follow-up (varredura).
  event_id        uuid references public.crm_events (id) on delete set null,
  deal_id         uuid references public.deals (id) on delete set null,
  conversation_id uuid references public.whatsapp_conversations (id) on delete set null,
  -- Chave de idempotência: evento:<id> ou followup:<conversa>:<passo>:<data>.
  dedupe_key      text not null,
  status          text not null check (status in ('success', 'partial', 'failed', 'skipped')),
  results         jsonb not null default '[]'::jsonb,
  error           text,
  created_at      timestamptz not null default now(),
  unique (rule_id, dedupe_key)
);

create index if not exists automation_runs_org_idx
  on public.automation_runs (organization_id, created_at desc);
create index if not exists automation_runs_rule_deal_idx
  on public.automation_runs (rule_id, deal_id, created_at desc);

-- ------------------------------------------------------------
-- TRIGGERS QUE EMITEM EVENTOS
-- ------------------------------------------------------------
create or replace function public.crm_emit_deal_events()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_events (organization_id, event_type, deal_id, contact_id, payload)
    values (new.organization_id, 'deal.created', new.id, new.contact_id,
            jsonb_build_object('stage_id', new.stage_id, 'pipeline_id', new.pipeline_id,
                               'source', new.source));
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id then
    insert into public.crm_events (organization_id, event_type, deal_id, contact_id, payload)
    values (new.organization_id, 'deal.stage_changed', new.id, new.contact_id,
            jsonb_build_object('from_stage_id', old.stage_id, 'stage_id', new.stage_id,
                               'pipeline_id', new.pipeline_id));
  end if;

  if new.status is distinct from old.status and new.status in ('won', 'lost') then
    insert into public.crm_events (organization_id, event_type, deal_id, contact_id, payload)
    values (new.organization_id, 'deal.' || new.status, new.id, new.contact_id,
            jsonb_build_object('stage_id', new.stage_id, 'pipeline_id', new.pipeline_id,
                               'value', new.value));
  end if;

  if new.responsible_id is distinct from old.responsible_id and new.responsible_id is not null then
    insert into public.crm_events (organization_id, event_type, deal_id, contact_id, payload)
    values (new.organization_id, 'deal.assigned', new.id, new.contact_id,
            jsonb_build_object('responsible_id', new.responsible_id,
                               'previous_responsible_id', old.responsible_id));
  end if;

  return new;
end;
$$;

drop trigger if exists deals_emit_crm_events on public.deals;
create trigger deals_emit_crm_events
  after insert or update of stage_id, status, responsible_id on public.deals
  for each row execute function public.crm_emit_deal_events();

create or replace function public.crm_emit_message_events()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_deal_id uuid;
  v_contact_id uuid;
begin
  if new.direction <> 'inbound' then
    return new;
  end if;

  select deal_id, contact_id into v_deal_id, v_contact_id
    from public.whatsapp_conversations
   where id = new.conversation_id
     and organization_id = new.organization_id;

  insert into public.crm_events
    (organization_id, event_type, deal_id, contact_id, conversation_id, payload)
  values
    (new.organization_id, 'message.received', v_deal_id, v_contact_id, new.conversation_id,
     jsonb_build_object('message_id', new.id, 'message_type', new.message_type,
                        'content', left(coalesce(new.content, ''), 1000)));
  return new;
end;
$$;

drop trigger if exists whatsapp_messages_emit_crm_events on public.whatsapp_messages;
create trigger whatsapp_messages_emit_crm_events
  after insert on public.whatsapp_messages
  for each row execute function public.crm_emit_message_events();

-- ------------------------------------------------------------
-- Reserva atômica de eventos para o motor (sem corrida entre workers)
-- ------------------------------------------------------------
create or replace function public.claim_crm_events(
  p_limit integer default 25,
  p_organization_id uuid default null
)
returns setof public.crm_events
language sql
set search_path = public
as $$
  update public.crm_events e
     set status = 'processing',
         locked_at = now(),
         attempts = e.attempts + 1
   where e.id in (
     select id from public.crm_events
      where status = 'pending'
        and run_after <= now()
        and (p_organization_id is null or organization_id = p_organization_id)
      order by run_after
      limit greatest(1, least(coalesce(p_limit, 25), 100))
      for update skip locked
   )
  returning e.*;
$$;

revoke all on function public.claim_crm_events(integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_crm_events(integer, uuid) to service_role;

-- Eventos presos em 'processing' (worker morreu no meio) voltam para a fila.
create or replace function public.requeue_stale_crm_events(p_older_than_minutes integer default 10)
returns integer
language sql
set search_path = public
as $$
  with moved as (
    update public.crm_events
       set status = case when attempts >= 5 then 'error' else 'pending' end,
           error = case when attempts >= 5 then 'Excedeu 5 tentativas.' else error end
     where status = 'processing'
       and locked_at < now() - make_interval(mins => p_older_than_minutes)
    returning 1
  )
  select count(*)::integer from moved;
$$;

revoke all on function public.requeue_stale_crm_events(integer) from public, anon, authenticated;
grant execute on function public.requeue_stale_crm_events(integer) to service_role;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.crm_events enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;

drop policy if exists "crm_events: org_admin lê" on public.crm_events;
create policy "crm_events: org_admin lê"
  on public.crm_events for select
  using (public.is_org_admin(organization_id));

drop policy if exists "automation_rules: membros leem" on public.automation_rules;
create policy "automation_rules: membros leem"
  on public.automation_rules for select
  using (public.has_org_access(organization_id));

drop policy if exists "automation_rules: org_admin cria" on public.automation_rules;
create policy "automation_rules: org_admin cria"
  on public.automation_rules for insert
  with check (public.is_org_admin(organization_id));

drop policy if exists "automation_rules: org_admin edita" on public.automation_rules;
create policy "automation_rules: org_admin edita"
  on public.automation_rules for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "automation_rules: org_admin remove" on public.automation_rules;
create policy "automation_rules: org_admin remove"
  on public.automation_rules for delete
  using (public.is_org_admin(organization_id));

drop policy if exists "automation_runs: org_admin lê" on public.automation_runs;
create policy "automation_runs: org_admin lê"
  on public.automation_runs for select
  using (public.is_org_admin(organization_id));

-- Fila e execuções são escritas só pelo servidor/trigger.
revoke insert, update, delete on public.crm_events, public.automation_runs from authenticated;
revoke all on public.crm_events, public.automation_runs, public.automation_rules from anon;
grant select on public.crm_events, public.automation_runs to authenticated;
grant select, insert, update, delete on public.automation_rules to authenticated;
grant all on public.crm_events, public.automation_rules, public.automation_runs to service_role;
