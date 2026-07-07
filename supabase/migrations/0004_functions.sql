-- ============================================================
-- Wavemov CRM — 0004: Funções de provisionamento e onboarding
-- ============================================================

-- ------------------------------------------------------------
-- Cria funil padrão + etapas + motivos de perda para uma organização
-- ------------------------------------------------------------
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

  return new_pipeline_id;
end;
$$;

-- ------------------------------------------------------------
-- Onboarding self-service: cria organização para o usuário logado
-- e o torna org_admin. Chamada pelo app após o cadastro.
-- ------------------------------------------------------------
create or replace function public.create_organization_for_current_user(
  org_name text,
  org_segment text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  my_profile_id uuid;
  new_org_id uuid;
begin
  select id into my_profile_id from public.profiles where auth_user_id = auth.uid();
  if my_profile_id is null then
    raise exception 'Perfil não encontrado para o usuário autenticado';
  end if;

  insert into public.organizations (name, segment, owner_name)
  values (
    org_name,
    org_segment,
    (select trim(first_name || ' ' || last_name) from public.profiles where id = my_profile_id)
  )
  returning id into new_org_id;

  insert into public.organization_members (organization_id, profile_id, role)
  values (new_org_id, my_profile_id, 'org_admin');

  perform public.provision_organization_defaults(new_org_id);

  return new_org_id;
end;
$$;

-- ------------------------------------------------------------
-- Dados demo: popula a organização com contatos, negociações e tarefas
-- Uso: select public.seed_demo_data('<organization_id>');
-- ------------------------------------------------------------
create or replace function public.seed_demo_data(org_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  pipe_id uuid;
  stage_novo uuid;
  stage_contato uuid;
  stage_qualif uuid;
  stage_cotacao uuid;
  stage_ganho uuid;
  responsible uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid;
  d1 uuid; d2 uuid; d3 uuid; d4 uuid; d5 uuid;
begin
  select id into pipe_id from public.pipelines where organization_id = org_id order by created_at limit 1;
  if pipe_id is null then
    pipe_id := public.provision_organization_defaults(org_id);
  end if;

  select id into stage_novo    from public.pipeline_stages where pipeline_id = pipe_id and name = 'Lead Novo';
  select id into stage_contato from public.pipeline_stages where pipeline_id = pipe_id and name = 'Contato Realizado';
  select id into stage_qualif  from public.pipeline_stages where pipeline_id = pipe_id and name = 'Em Qualificação';
  select id into stage_cotacao from public.pipeline_stages where pipeline_id = pipe_id and name = 'Cotação Enviada';
  select id into stage_ganho   from public.pipeline_stages where pipeline_id = pipe_id and is_won_stage limit 1;

  select profile_id into responsible
  from public.organization_members
  where organization_id = org_id and is_active
  order by created_at limit 1;

  insert into public.contacts (organization_id, name, email, phone, whatsapp_phone, city, state)
  values
    (org_id, 'Paulo Vamberto', 'paulo.vamberto@email.com', '+55 84 99991-5326', '5584999915326', 'Natal', 'RN'),
    (org_id, 'Mariana Costa', 'mariana.costa@email.com', '+55 11 98765-4321', '5511987654321', 'São Paulo', 'SP'),
    (org_id, 'Ricardo Alves', 'ricardo.alves@email.com', '+55 21 97654-3210', '5521976543210', 'Rio de Janeiro', 'RJ'),
    (org_id, 'Fernanda Lima', 'fernanda.lima@email.com', '+55 31 96543-2109', '5531965432109', 'Belo Horizonte', 'MG'),
    (org_id, 'João Pedro Souza', 'joao.souza@email.com', '+55 85 95432-1098', '5585954321098', 'Fortaleza', 'CE')
  returning id into c1;

  select id into c1 from public.contacts where organization_id = org_id and name = 'Paulo Vamberto';
  select id into c2 from public.contacts where organization_id = org_id and name = 'Mariana Costa';
  select id into c3 from public.contacts where organization_id = org_id and name = 'Ricardo Alves';
  select id into c4 from public.contacts where organization_id = org_id and name = 'Fernanda Lima';
  select id into c5 from public.contacts where organization_id = org_id and name = 'João Pedro Souza';

  insert into public.deals (organization_id, pipeline_id, stage_id, contact_id, responsible_id, title, value, status, source, temperature, ai_status, utm_source, utm_medium)
  values
    (org_id, pipe_id, stage_novo,    c1, responsible, 'Paulo Vamberto',   4800.00,  'open', 'WhatsApp Direto', 'hot',  'qualifying', 'meta', 'cpc'),
    (org_id, pipe_id, stage_novo,    c2, responsible, 'Mariana Costa',    3200.00,  'open', 'Formulário Site', 'warm', 'none', 'google', 'organic'),
    (org_id, pipe_id, stage_contato, c3, responsible, 'Ricardo Alves',    7500.00,  'open', 'Indicação',       'warm', 'qualified', null, null),
    (org_id, pipe_id, stage_qualif,  c4, responsible, 'Fernanda Lima',    12900.00, 'open', 'WhatsApp Direto', 'hot',  'handoff', 'meta', 'cpc'),
    (org_id, pipe_id, stage_cotacao, c5, responsible, 'João Pedro Souza', 6400.00,  'open', 'Formulário Site', 'cold', 'none', 'google', 'cpc');

  select id into d1 from public.deals where organization_id = org_id and title = 'Paulo Vamberto';
  select id into d4 from public.deals where organization_id = org_id and title = 'Fernanda Lima';

  -- Uma negociação ganha para o dashboard
  insert into public.deals (organization_id, pipeline_id, stage_id, contact_id, responsible_id, title, value, status, source, temperature, won_at, created_at)
  values (org_id, pipe_id, stage_ganho, c2, responsible, 'Mariana Costa — Renovação', 5600.00, 'won', 'Indicação', 'hot', now() - interval '2 days', now() - interval '12 days');

  insert into public.tasks (organization_id, deal_id, contact_id, assigned_to, created_by, title, description, due_at, priority, status)
  values
    (org_id, d1, c1, responsible, responsible, 'Ligar para cotação', 'Retornar ligação sobre plano de saúde', now() + interval '1 day', 'high', 'pending'),
    (org_id, d4, c4, responsible, responsible, 'Enviar proposta atualizada', 'Cliente pediu ajuste de cobertura', now() + interval '3 hours', 'high', 'pending'),
    (org_id, null, c3, responsible, responsible, 'Follow-up semanal', null, now() + interval '3 days', 'medium', 'pending');

  insert into public.activity_logs (organization_id, actor_id, deal_id, type, title)
  values
    (org_id, responsible, d1, 'deal_created', 'Negociação criada'),
    (org_id, responsible, d4, 'deal_created', 'Negociação criada');
end;
$$;
