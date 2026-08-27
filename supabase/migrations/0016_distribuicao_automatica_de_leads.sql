-- ============================================================
-- Wavemov CRM — 0016: distribuição automática de leads
--
-- PROBLEMA
-- Lead que entra sem responsável é INVISÍVEL para quem deveria atendê-lo. A
-- policy de leitura da 0011 devolve a negociação para `org_admin`/`viewer`/
-- admin global, ou para quem é o `responsible_id` — mais ninguém. E hoje o
-- lead nasce órfão em dois dos três caminhos de entrada:
--   * `register-form-lead.ts` grava `responsible_id: form.default_responsible_id`,
--     que é opcional e nasce vazio na tela de formulários;
--   * o webhook da UAZAPI nem passa o campo no insert.
-- Pior: quando esse lead responde no WhatsApp, o trigger da 0011 copia o
-- `responsible_id` nulo para `whatsapp_conversations.assigned_to` e a conversa
-- some da lista do vendedor também.
--
-- A Frente B multiplicou a vazão de entrada (Typeform e Meta via n8n) sem
-- tocar na vazão de atendimento. Este é o degrau que quebra primeiro.
--
-- SOLUÇÃO
-- Um módulo configurável, não uma regra fixa em código. O administrador define
-- REGRAS ordenadas por prioridade; a primeira que casa com o lead vence. Cada
-- regra tem método, participantes e peso. Toda distribuição é registrada para
-- auditoria.
--
-- POR QUE REGRAS ORDENADAS, E NÃO UMA CONFIGURAÇÃO ÚNICA
-- "Leads do formulário da campanha X vão para a Ana; o resto entra no rodízio"
-- é o primeiro pedido que aparece depois de qualquer distribuição automática
-- existir. Uma configuração única por empresa não expressa isso e viraria
-- migration nova em duas semanas.
--
-- POR QUE NÃO EXISTE MÉTODO "RESPONSÁVEL FIXO"
-- Uma regra com UM participante já é responsável fixo. Um método a mais seria
-- um caminho de código a mais fazendo o que o rodízio de um elemento faz.
--
-- ESCOPO POR ORGANIZAÇÃO
-- "Filtro por empresa" é isolamento, não condição: cada organização tem as
-- próprias regras e o `org_admin` só enxerga as dela. As condições
-- configuráveis são ORIGEM e FORMULÁRIO.
--
-- Idempotente: pode ser executada duas vezes sem efeito colateral.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Regras de distribuição
--
-- `priority` menor é avaliada primeiro. Não há índice único sobre ela de
-- propósito: reordenar por swap exigiria constraint deferrable, e o desempate
-- por `created_at` já torna a ordem determinística.
--
-- `is_fallback` marca a regra que pega o que nenhuma outra pegou. No máximo
-- uma por organização (índice único parcial), e ela é sempre avaliada por
-- último, independentemente da prioridade — quem escreve a regra não deveria
-- precisar lembrar de deixá-la no fim.
--
-- `assignments_count` é o bilhete do rodízio. O motor faz
-- `update ... set assignments_count = assignments_count + 1 returning` — uma
-- única instrução, atômica: duas ingestões simultâneas recebem números
-- diferentes e não caem no mesmo vendedor. Guardar "o último escolhido" em
-- vez de um contador exigiria ler-decidir-escrever, que é exatamente onde a
-- corrida aconteceria.
-- ------------------------------------------------------------
create table if not exists public.lead_distribution_rules (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  name              text not null,
  priority          integer not null default 100,
  is_active         boolean not null default true,
  is_fallback       boolean not null default false,

  -- Método. Hoje só há um implementado; a coluna existe para que acrescentar
  -- outro seja uma migration com `check` novo e um ramo no motor, não uma
  -- reescrita do schema.
  method            text not null default 'weighted_round_robin'
                      check (method in ('weighted_round_robin')),

  -- Condições. Nulo = "qualquer". Combinadas com E: regra com origem e
  -- formulário preenchidos só casa quando os dois batem.
  origin            text
                      check (origin is null or origin in ('public_form', 'external_ingest', 'whatsapp')),
  form_id           uuid references public.forms (id) on delete cascade,

  assignments_count bigint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists lead_distribution_rules_org_idx
  on public.lead_distribution_rules (organization_id, is_active, priority);

-- No máximo uma regra padrão por organização.
create unique index if not exists lead_distribution_rules_fallback_key
  on public.lead_distribution_rules (organization_id)
  where is_fallback;

-- `form_id` precisa ser da MESMA organização da regra. Sem esta guarda, um
-- `org_admin` que chame o PostgREST direto aponta a condição para o formulário
-- de outra empresa: não vaza dado, mas cria uma regra que nunca casa e um
-- vínculo entre organizações que ninguém consegue explicar depois.
create or replace function public.lead_distribution_rule_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  form_org uuid;
begin
  if new.form_id is not null then
    select organization_id into form_org from public.forms where id = new.form_id;
    if form_org is null or form_org <> new.organization_id then
      raise exception 'O formulário escolhido não pertence a esta organização.'
        using errcode = 'P0001';
    end if;
  end if;

  -- A regra padrão pega o que sobrou: condição nela seria contraditória.
  if new.is_fallback and (new.origin is not null or new.form_id is not null) then
    raise exception 'A regra padrão não pode ter condições — ela existe para receber o que nenhuma outra regra pegou.'
      using errcode = 'P0001';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lead_distribution_rules_guard on public.lead_distribution_rules;
create trigger lead_distribution_rules_guard
  before insert or update on public.lead_distribution_rules
  for each row execute function public.lead_distribution_rule_guard();

comment on table public.lead_distribution_rules is
  'Regras de distribuição automática de leads, avaliadas por prioridade crescente; a regra is_fallback é sempre a última. Escopo por organização. assignments_count é o bilhete do rodízio, incrementado atomicamente pelo motor.';

-- ------------------------------------------------------------
-- 2. Participantes e peso
--
-- O peso multiplica a frequência: peso 2 recebe o dobro de peso 1. O teto de
-- 100 não é arbitrário — o motor expande a lista por peso para montar a
-- sequência do rodízio, e sem teto um peso digitado errado (10000) viraria uma
-- lista de dez mil elementos em memória a cada lead.
--
-- `is_active` desliga alguém sem apagar o histórico nem perder o peso
-- configurado: férias e afastamento são temporários.
--
-- A pertinência do participante à organização é garantida pelo trigger: o
-- perfil precisa ser membro ATIVO da organização da regra. Sem isso, um
-- `profile_id` de outra empresa entraria como participante e passaria a
-- receber leads que não pode nem ler.
-- ------------------------------------------------------------
create table if not exists public.lead_distribution_participants (
  id         uuid primary key default gen_random_uuid(),
  rule_id    uuid not null references public.lead_distribution_rules (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  weight     integer not null default 1 check (weight between 1 and 100),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (rule_id, profile_id)
);

create index if not exists lead_distribution_participants_rule_idx
  on public.lead_distribution_participants (rule_id, is_active);

create or replace function public.lead_distribution_participant_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  rule_org uuid;
  membro   record;
begin
  select organization_id into rule_org
    from public.lead_distribution_rules where id = new.rule_id;

  select om.role, om.is_active into membro
    from public.organization_members om
   where om.organization_id = rule_org and om.profile_id = new.profile_id;

  if membro is null then
    raise exception 'A pessoa escolhida não é membro desta organização.'
      using errcode = 'P0001';
  end if;

  if not membro.is_active then
    raise exception 'A pessoa escolhida está inativa nesta organização.'
      using errcode = 'P0001';
  end if;

  -- `viewer` é somente leitura desde a 0003: receber lead seria receber um
  -- registro que ele não pode trabalhar.
  if membro.role = 'viewer' then
    raise exception 'Perfil somente leitura não pode receber leads.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists lead_distribution_participants_guard on public.lead_distribution_participants;
create trigger lead_distribution_participants_guard
  before insert or update on public.lead_distribution_participants
  for each row execute function public.lead_distribution_participant_guard();

comment on table public.lead_distribution_participants is
  'Quem entra no rodízio de uma regra e com que peso (1..100). Só membro ativo e não-viewer da organização da regra, garantido por trigger.';

-- ------------------------------------------------------------
-- 3. Histórico de distribuição — auditoria
--
-- Tabela própria, e não `activity_logs`, porque as perguntas são outras:
-- "por que este lead foi para o João?", "a Ana está recebendo menos que o
-- peso dela?", "quantos leads caíram sem ninguém no mês passado?".
-- `activity_logs` continua ganhando a linha na timeline do lead; aqui fica o
-- que sustenta a auditoria.
--
-- SNAPSHOTS SÃO O PONTO DA TABELA
-- `rule_name`, `assigned_to_name` e `candidates` são cópias do estado no
-- momento da decisão. Auditoria que se reescreve quando alguém renomeia uma
-- regra ou sai da empresa não é auditoria — e as FKs são `on delete set null`
-- justamente para que apagar a regra não apague a história dela.
--
-- `reason` explica também os casos em que NÃO houve distribuição, que são os
-- que o administrador precisa enxergar para corrigir a configuração.
-- ------------------------------------------------------------
create table if not exists public.lead_distribution_log (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  deal_id          uuid references public.deals (id) on delete cascade,

  rule_id          uuid references public.lead_distribution_rules (id) on delete set null,
  rule_name        text,
  method           text,

  origin           text not null,
  form_id          uuid references public.forms (id) on delete set null,

  assigned_to      uuid references public.profiles (id) on delete set null,
  assigned_to_name text,

  -- [{profile_id, name, weight}] — quem estava elegível na hora da decisão.
  candidates       jsonb not null default '[]'::jsonb,
  -- Bilhete do rodízio usado. Permite reconstruir a escolha e provar a ordem.
  ticket           bigint,

  reason           text not null
                     check (reason in (
                       'rule_matched',      -- distribuído por uma regra
                       'form_default',      -- responsável padrão do formulário venceu
                       'no_rule',           -- nenhuma regra casou
                       'no_candidates'      -- regra casou, mas sem ninguém elegível
                     )),
  created_at       timestamptz not null default now()
);

create index if not exists lead_distribution_log_org_idx
  on public.lead_distribution_log (organization_id, created_at desc);
create index if not exists lead_distribution_log_deal_idx
  on public.lead_distribution_log (deal_id);
create index if not exists lead_distribution_log_assigned_idx
  on public.lead_distribution_log (organization_id, assigned_to, created_at desc);

comment on table public.lead_distribution_log is
  'Auditoria da distribuição automática. rule_name, assigned_to_name e candidates são SNAPSHOTS do momento da decisão: renomear ou apagar uma regra não reescreve a história. reason cobre também os casos sem distribuição.';

-- ------------------------------------------------------------
-- 4. RLS
--
-- Regras e participantes: leitura por qualquer membro (o vendedor tem direito
-- de saber se está no rodízio e com que peso), escrita só por `org_admin` —
-- mesmo desenho das policies de `pipelines` na 0012.
--
-- Log: leitura restrita a quem já enxerga todos os leads
-- (`has_full_lead_visibility`, da 0011). Ele revela quem mais recebeu lead e
-- quanto — informação de gestão, não de vendedor. Escrita, nenhuma: só o
-- motor, com `service_role`.
-- ------------------------------------------------------------
alter table public.lead_distribution_rules enable row level security;
alter table public.lead_distribution_participants enable row level security;
alter table public.lead_distribution_log enable row level security;

drop policy if exists "distribuicao: leitura por membros" on public.lead_distribution_rules;
create policy "distribuicao: leitura por membros"
  on public.lead_distribution_rules for select
  using (public.has_org_access(organization_id));

drop policy if exists "distribuicao: escrita por org_admin" on public.lead_distribution_rules;
create policy "distribuicao: escrita por org_admin"
  on public.lead_distribution_rules for insert
  with check (public.is_org_admin(organization_id));

drop policy if exists "distribuicao: edicao por org_admin" on public.lead_distribution_rules;
create policy "distribuicao: edicao por org_admin"
  on public.lead_distribution_rules for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists "distribuicao: exclusao por org_admin" on public.lead_distribution_rules;
create policy "distribuicao: exclusao por org_admin"
  on public.lead_distribution_rules for delete
  using (public.is_org_admin(organization_id));

drop policy if exists "participantes: leitura por membros" on public.lead_distribution_participants;
create policy "participantes: leitura por membros"
  on public.lead_distribution_participants for select
  using (exists (
    select 1 from public.lead_distribution_rules r
    where r.id = rule_id and public.has_org_access(r.organization_id)
  ));

drop policy if exists "participantes: gerencia por org_admin" on public.lead_distribution_participants;
create policy "participantes: gerencia por org_admin"
  on public.lead_distribution_participants for all
  using (exists (
    select 1 from public.lead_distribution_rules r
    where r.id = rule_id and public.is_org_admin(r.organization_id)
  ))
  with check (exists (
    select 1 from public.lead_distribution_rules r
    where r.id = rule_id and public.is_org_admin(r.organization_id)
  ));

drop policy if exists "distribuicao log: leitura por gestao" on public.lead_distribution_log;
create policy "distribuicao log: leitura por gestao"
  on public.lead_distribution_log for select
  using (public.has_full_lead_visibility(organization_id));

-- Sem policy de escrita: só `service_role`, que contorna o RLS. O motor roda
-- nas rotas de ingestão e no webhook, todos com service role.

-- ------------------------------------------------------------
-- 5. Privilégios
--
-- A 0006 concede select/insert/update/delete de todas as tabelas a
-- `authenticated`, e as default privileges repetem isso para tabelas novas. O
-- log precisa ser somente leitura para quem está logado: sem o revoke abaixo,
-- um membro poderia inserir ou apagar linhas de auditoria pelo PostgREST.
-- ------------------------------------------------------------
revoke insert, update, delete on table public.lead_distribution_log from authenticated;
revoke all on table public.lead_distribution_log from anon;
revoke all on table public.lead_distribution_rules from anon;
revoke all on table public.lead_distribution_participants from anon;

-- ------------------------------------------------------------
-- 6. Regra padrão para as organizações existentes
--
-- Cada organização que já tem membros elegíveis nasce com uma regra padrão
-- ATIVA e com todos eles no rodízio, peso 1. É o comportamento que o cliente
-- espera ao ligar o recurso: "distribua entre quem já está aqui".
--
-- Organização sem ninguém elegível não ganha regra: uma regra vazia só
-- produziria log de `no_candidates` a cada lead.
-- ------------------------------------------------------------
insert into public.lead_distribution_rules (organization_id, name, priority, is_fallback)
select o.id, 'Distribuição padrão', 1000, true
  from public.organizations o
 where exists (
   select 1 from public.organization_members om
    where om.organization_id = o.id
      and om.is_active
      and om.role in ('org_admin', 'seller', 'agent')
 )
   and not exists (
     select 1 from public.lead_distribution_rules r
      where r.organization_id = o.id and r.is_fallback
   );

insert into public.lead_distribution_participants (rule_id, profile_id, weight)
select r.id, om.profile_id, 1
  from public.lead_distribution_rules r
  join public.organization_members om
    on om.organization_id = r.organization_id
   and om.is_active
   and om.role in ('org_admin', 'seller', 'agent')
 where r.is_fallback
on conflict (rule_id, profile_id) do nothing;

-- ------------------------------------------------------------
-- 7. Organizações e membros criados DEPOIS desta migration
--
-- O backfill acima só alcança quem já existe. Sem os dois gatilhos abaixo, uma
-- empresa nova nasceria sem regra nenhuma e voltaria ao defeito que esta
-- migration existe para fechar: lead sem responsável, invisível para o
-- vendedor. Não dá para deixar isso na mão de alguém lembrar de configurar.
-- ------------------------------------------------------------

-- A regra padrão nasce junto com a organização, vazia. `provision_
-- organization_defaults` é o caminho por onde toda organização passa (0004,
-- linhas 82 e 109, e o seed) — por isso a criação mora aqui e não num trigger
-- sobre `organizations`, que também dispararia em importação de dados.
create or replace function public.provision_organization_defaults(org_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_pipeline_id uuid;
begin
  insert into public.pipelines (organization_id, name, description)
  values (org_id, 'Funil de Vendas', 'Funil padrão de negociações')
  returning id into new_pipeline_id;

  insert into public.pipeline_stages (pipeline_id, name, order_index, color, is_won_stage, is_lost_stage)
  values
    (new_pipeline_id, 'Lead Novo',            0,  '#2563eb', false, false),
    (new_pipeline_id, 'Tentando Contato',     1,  '#3b82f6', false, false),
    (new_pipeline_id, 'Primeiro Contato',     2,  '#6366f1', false, false),
    (new_pipeline_id, 'Contato Realizado',    3,  '#8b5cf6', false, false),
    (new_pipeline_id, 'Aguardando Documento', 4,  '#f59e0b', false, false),
    (new_pipeline_id, 'Em Qualificação',      5,  '#eab308', false, false),
    (new_pipeline_id, 'Cotação Enviada',      6,  '#06b6d4', false, false),
    (new_pipeline_id, 'Cotação em andamento', 7,  '#0ea5e9', false, false),
    (new_pipeline_id, 'Follow-up',            8,  '#64748b', false, false),
    (new_pipeline_id, 'Ganho',                9,  '#10b981', true,  false),
    (new_pipeline_id, 'Perdido',              10, '#ef4444', false, true);

  insert into public.lost_reasons (organization_id, name)
  values
    (org_id, 'Preço alto'),
    (org_id, 'Sem resposta'),
    (org_id, 'Fechou com concorrente'),
    (org_id, 'Sem interesse'),
    (org_id, 'Fora do perfil');

  insert into public.quick_replies (organization_id, title, content)
  values
    (org_id, 'Saudação', 'Olá! Tudo bem? Aqui é da equipe comercial. Como posso ajudar?'),
    (org_id, 'Follow-up', 'Oi! Passando para saber se você teve tempo de analisar nossa proposta. Fico à disposição!'),
    (org_id, 'Encerramento', 'Obrigado pelo contato! Qualquer dúvida estamos por aqui. Tenha um ótimo dia!');

  -- Acrescentado pela 0016. `on conflict do nothing` porque o índice único
  -- parcial já garante uma padrão por organização, e a função precisa
  -- continuar reexecutável.
  insert into public.lead_distribution_rules (organization_id, name, priority, is_fallback)
  values (org_id, 'Distribuição padrão', 1000, true)
  on conflict do nothing;

  -- Inscreve quem JÁ é membro.
  --
  -- Não é redundante com o trigger de `organization_members`:
  -- `create_organization_for_current_user` (0004) insere o `org_admin` ANTES
  -- de chamar esta função, então naquele momento não existia regra para o
  -- trigger encontrar. Sem estas linhas, quem cria a empresa fica de fora do
  -- próprio rodízio e a primeira empresa nova já nasce com o defeito.
  insert into public.lead_distribution_participants (rule_id, profile_id, weight)
  select r.id, om.profile_id, 1
    from public.lead_distribution_rules r
    join public.organization_members om
      on om.organization_id = r.organization_id
     and om.is_active
     and om.role in ('org_admin', 'seller', 'agent')
   where r.organization_id = org_id and r.is_fallback
  on conflict (rule_id, profile_id) do nothing;

  return new_pipeline_id;
end;
$$;

-- Quem entra na equipe entra no rodízio padrão.
--
-- Só no INSERT da associação, de propósito. Se disparasse no UPDATE, o
-- administrador que tirasse alguém do rodízio o veria voltar na próxima vez
-- que qualquer campo da associação mudasse — a configuração não seria dele.
-- Tirar do rodízio é apagar o participante; readmitir é a tela.
create or replace function public.lead_distribution_enroll_member()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  regra_padrao uuid;
begin
  if not new.is_active or new.role not in ('org_admin', 'seller', 'agent') then
    return new;
  end if;

  select id into regra_padrao
    from public.lead_distribution_rules
   where organization_id = new.organization_id and is_fallback;

  if regra_padrao is null then
    return new;
  end if;

  insert into public.lead_distribution_participants (rule_id, profile_id, weight)
  values (regra_padrao, new.profile_id, 1)
  on conflict (rule_id, profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists organization_members_enroll_distribution on public.organization_members;
create trigger organization_members_enroll_distribution
  after insert on public.organization_members
  for each row execute function public.lead_distribution_enroll_member();

-- PostgREST precisa reler o schema para enxergar as tabelas novas
notify pgrst, 'reload schema';
