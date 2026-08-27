-- ============================================================
-- Wavemov CRM — 0017: fila ordenada e plantão
--
-- O QUE MUDA
-- A 0016 escolhia o responsável por uma sequência DERIVADA: participantes
-- ordenados por `profile_id` (um UUID), expandidos pelo peso, e um contador
-- que dava a volta por resto da divisão. Funcionava, mas tinha dois defeitos
-- de produto:
--
--   1. A ordem era um UUID. O administrador não escolhia quem vinha primeiro,
--      e não havia como explicar a ordem para a equipe.
--   2. Tirar alguém do rodízio remapeava TODO o resto. Com `ticket % n`, a
--      largura da sequência muda quando um participante sai, e o próximo lead
--      cai em alguém arbitrário — a continuidade do rodízio se perdia
--      exatamente no dia em que uma pessoa faltava.
--
-- Agora a fila é EXPLÍCITA: o administrador define a ordem, cada pessoa tem
-- status de plantão, e a régua guarda a última posição servida. Quem está fora
-- do plantão é PULADO, sem alterar a posição de ninguém — voltando, ela
-- retoma o lugar dela na fila.
--
-- POR QUE O PLANTÃO MORA EM `organization_members`
-- "Fulano está de plantão hoje" é sobre a pessoa, não sobre uma regra: quem
-- não está trabalhando não deve receber lead de campanha nenhuma. E a tabela
-- já tem exatamente as policies necessárias desde a 0003 — `select` para
-- qualquer membro, `update` só para `org_admin` —, então o controle pedido
-- ("só o administrador liga e desliga") sai sem policy nova.
--
-- PESO CONTINUA, COM OUTRO SIGNIFICADO
-- Antes o peso multiplicava a frequência numa sequência intercalada. Agora ele
-- é quantos leads CONSECUTIVOS a pessoa recebe antes de a fila avançar. É o
-- que o cliente pediu, e é o que faz sentido numa fila: peso 2 significa "dá
-- dois para ela e passa adiante".
--
-- Idempotente: pode ser executada duas vezes sem efeito colateral.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Plantão, por pessoa
--
-- `default true` porque a organização que já está distribuindo não pode parar
-- de distribuir por causa desta migration: quem estava recebendo continua
-- recebendo até o administrador dizer o contrário.
-- ------------------------------------------------------------
alter table public.organization_members
  add column if not exists on_duty boolean not null default true;

comment on column public.organization_members.on_duty is
  'Plantão: a pessoa está trabalhando e participa da distribuição de leads. Vale para TODAS as regras — quem não está de plantão não recebe lead de campanha nenhuma. Só org_admin altera (policy de update da 0003). Fora do plantão a pessoa é PULADA na fila, sem perder a posição dela.';

-- ------------------------------------------------------------
-- 2. Ordem manual da fila
--
-- Sem índice único sobre `(rule_id, position)`: reordenar por troca exigiria
-- constraint deferrable, e a tela renumera todos os participantes da regra de
-- uma vez. Posições repetidas não quebram nada — o desempate por `created_at`
-- mantém a ordem determinística —, apenas deixam de ser a ordem que o
-- administrador enxerga, e é a tela que garante que isso não aconteça.
-- ------------------------------------------------------------
alter table public.lead_distribution_participants
  add column if not exists position integer not null default 0;

create index if not exists lead_distribution_participants_order_idx
  on public.lead_distribution_participants (rule_id, position, created_at);

comment on column public.lead_distribution_participants.position is
  'Ordem manual na fila da regra, crescente. Quem está fora do plantão é pulado sem perder a posição.';

comment on column public.lead_distribution_participants.weight is
  'Quantos leads CONSECUTIVOS esta pessoa recebe antes de a fila avançar (1..100). Mudou de significado na 0017: antes multiplicava a frequência numa sequência intercalada.';

-- Backfill: a ordem de hoje é a que a 0016 produzia na prática — por
-- `created_at`, com `profile_id` desempatando. Ninguém percebe mudança de
-- comportamento no dia em que a migration roda; a partir daí o administrador
-- reordena como quiser.
-- Só numera regras que NUNCA foram numeradas — as que têm todos os
-- participantes na posição 0, o default da coluna.
--
-- A primeira versão condicionava por linha (`and p.position = 0`), e isso não
-- era idempotente: numa reexecução, a única linha ainda em 0 podia receber o
-- `row_number` de outra ordenação e colidir com uma posição já ocupada. O
-- efeito na PRIMEIRA execução é idêntico — quando todas as posições valem 0,
-- os dois filtros selecionam exatamente as mesmas linhas —, então esta
-- correção não altera nada em quem já aplicou a migration.
with nunca_numeradas as (
  select rule_id
    from public.lead_distribution_participants
   group by rule_id
  having count(*) > 1
     and count(distinct position) = 1
     and max(position) = 0
),
ordenados as (
  select p.id,
         row_number() over (partition by p.rule_id order by p.created_at, p.profile_id) - 1
           as nova_posicao
    from public.lead_distribution_participants p
    join nunca_numeradas n on n.rule_id = p.rule_id
)
update public.lead_distribution_participants p
   set position = o.nova_posicao
  from ordenados o
 where o.id = p.id;

-- ------------------------------------------------------------
-- 3. O cursor da fila
--
-- `queue_position` é a posição do ÚLTIMO servido; `queue_uses` é quantos leads
-- consecutivos essa posição já consumiu do peso dela.
--
-- Guardar a posição, e não "o último profile_id", é o que dá continuidade
-- quando alguém entra ou sai: a fila retoma de onde parou, no ponto da ordem,
-- em vez de perder a referência junto com a pessoa.
--
-- `-1` significa "ninguém foi servido ainda", para que o primeiro lead vá para
-- a primeira posição da fila e não para a segunda.
--
-- `assignments_count` continua existindo, mas deixou de ser o mecanismo de
-- escolha: agora é só o total distribuído pela regra, exibido na tela.
-- ------------------------------------------------------------
alter table public.lead_distribution_rules
  add column if not exists queue_position integer not null default -1;

alter table public.lead_distribution_rules
  add column if not exists queue_uses integer not null default 0;

comment on column public.lead_distribution_rules.queue_position is
  'Posição do último participante servido nesta regra. -1 = ninguém ainda. É o que garante a continuidade do rodízio entre um lead e o seguinte.';

comment on column public.lead_distribution_rules.queue_uses is
  'Quantos leads consecutivos a posição atual já consumiu do peso dela. Ao atingir o peso, a fila avança para a próxima posição com plantão ativo.';

comment on column public.lead_distribution_rules.assignments_count is
  'Total de leads distribuídos por esta regra. Deixou de ser o mecanismo de escolha na 0017 — quem escolhe é o par queue_position/queue_uses.';

-- ------------------------------------------------------------
-- 4. Método
--
-- O método antigo não tem mais implementação: deixá-lo aceito criaria uma
-- regra que o motor não sabe servir, e a falha apareceria como lead sem
-- responsável — silenciosa, do jeito que este projeto já pagou caro para
-- evitar.
--
-- ORDEM IMPORTA, E A PRIMEIRA VERSÃO DESTA MIGRATION ERRAVA AQUI.
-- O `check` antigo só aceita `weighted_round_robin`. Atualizar os dados antes
-- de removê-lo faz o próprio constraint recusar o valor novo:
--
--   ERROR: 23514: new row for relation "lead_distribution_rules" violates
--   check constraint "lead_distribution_rules_method_check"
--
-- O erro não apareceu no `test:db` porque lá as migrations rodam contra um
-- banco vazio — sem regra nenhuma, o `update` não atinge linha e passa. Só
-- explode em base com dado, que é a única que importa. O bloco 17 do teste
-- passou a reproduzir exatamente esse estado.
--
-- Então: derruba o check primeiro, migra os dados, e só então instala o novo.
-- ------------------------------------------------------------
alter table public.lead_distribution_rules
  drop constraint if exists lead_distribution_rules_method_check;

update public.lead_distribution_rules
   set method = 'ordered_queue'
 where method <> 'ordered_queue';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'lead_distribution_rules_method_check'
       and conrelid = 'public.lead_distribution_rules'::regclass
  ) then
    alter table public.lead_distribution_rules
      add constraint lead_distribution_rules_method_check
      check (method in ('ordered_queue'));
  end if;
end;
$$;

alter table public.lead_distribution_rules
  alter column method set default 'ordered_queue';

-- ------------------------------------------------------------
-- 5. Quem entra na equipe entra no FIM da fila
--
-- A 0016 inscrevia o membro novo sem posição, o que agora o colocaria em
-- `position = 0` — na frente de todo mundo, recebendo o próximo lead. O lugar
-- de quem chega é o fim da fila; o administrador reordena se quiser.
-- ------------------------------------------------------------
create or replace function public.lead_distribution_enroll_member()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  regra_padrao uuid;
  proxima_posicao integer;
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

  select coalesce(max(position), -1) + 1 into proxima_posicao
    from public.lead_distribution_participants
   where rule_id = regra_padrao;

  insert into public.lead_distribution_participants (rule_id, profile_id, weight, position)
  values (regra_padrao, new.profile_id, 1, proxima_posicao)
  on conflict (rule_id, profile_id) do nothing;

  return new;
end;
$$;

-- O provisionamento de organização nova inscreve os membros já existentes; a
-- ordem inicial passa a ser explícita em vez de acidental.
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

  insert into public.lead_distribution_rules (organization_id, name, priority, is_fallback)
  values (org_id, 'Distribuição padrão', 1000, true)
  on conflict do nothing;

  -- Inscreve quem JÁ é membro, em ordem determinística.
  -- `create_organization_for_current_user` (0004) insere o org_admin ANTES de
  -- chamar esta função, então o trigger de `organization_members` não teve
  -- regra para encontrar naquele momento.
  insert into public.lead_distribution_participants (rule_id, profile_id, weight, position)
  select r.id,
         om.profile_id,
         1,
         row_number() over (order by om.created_at, om.profile_id) - 1
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

-- PostgREST precisa reler o schema para enxergar as colunas novas
notify pgrst, 'reload schema';
