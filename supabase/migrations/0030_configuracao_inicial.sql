-- ============================================================
-- 0030 — Assistente de configuração inicial (onboarding)
--
-- 1. organizations.onboarded_at: quando a empresa concluiu (ou dispensou) o
--    assistente. NULL = ainda não. As empresas que JÁ EXISTEM são marcadas
--    como configuradas na criação da coluna: elas operam há meses e não podem
--    ser jogadas num assistente no próximo login.
-- 2. organizations.onboarding_steps: o que a pessoa decidiu em cada passo
--    ("done" | "skipped"). Escrito pelo org_admin sob a policy de update já
--    existente em organizations (0003).
-- 3. apply_onboarding_pipeline(): troca as etapas do funil PADRÃO pelo modelo
--    escolhido no assistente. Só enquanto o funil está virgem — sem
--    negociação, formulário ou automação apontando para ele. Com qualquer
--    vínculo a troca é recusada e a pessoa usa /funis, que sabe mover leads.
--
-- Idempotente: pode rodar duas vezes. O backfill só acontece no ato em que a
-- coluna nasce — rodar de novo NÃO marca como configurada a empresa criada
-- entre as duas execuções.
--
-- Sem tabela temporária e sem begin/commit: o SQL Editor não garante a mesma
-- sessão entre instruções (ver HANDOFF, 0024).
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'organizations'
       and column_name = 'onboarded_at'
  ) then
    alter table public.organizations add column onboarded_at timestamptz;
    update public.organizations set onboarded_at = coalesce(created_at, now());
  end if;
end;
$$;

alter table public.organizations
  add column if not exists onboarding_steps jsonb not null default '{}'::jsonb;

-- ------------------------------------------------------------
-- apply_onboarding_pipeline(org_id, pipeline_name, stages)
--   stages: [{ "name": "Lead Novo", "kind": "open" | "won" | "lost" }, ...]
--   A ordem recebida é a ordem gravada; a tela já põe ganho e perda no fim.
-- ------------------------------------------------------------
create or replace function public.apply_onboarding_pipeline(
  org_id uuid,
  pipeline_name text,
  stages jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  target_pipeline uuid;
  stage jsonb;
  stage_name text;
  stage_kind text;
  total int;
  wins int := 0;
  losses int := 0;
  opens int := 0;
  stage_index int := 0;
  open_colors text[] := array['#2563eb','#3b82f6','#6366f1','#8b5cf6','#06b6d4','#0ea5e9','#f59e0b','#eab308','#64748b'];
begin
  if org_id is null then
    raise exception 'Organização não informada.' using errcode = 'P0001';
  end if;
  if not public.is_org_admin(org_id) then
    raise exception 'Somente administradores da organização podem configurar o funil.'
      using errcode = '42501';
  end if;
  if coalesce(length(trim(pipeline_name)), 0) < 2 then
    raise exception 'Dê um nome ao funil.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(stages) is distinct from 'array' then
    raise exception 'Etapas inválidas.' using errcode = 'P0001';
  end if;

  total := jsonb_array_length(stages);
  if total < 3 or total > 15 then
    raise exception 'O funil precisa ter entre 3 e 15 etapas.' using errcode = 'P0001';
  end if;

  for stage in select value from jsonb_array_elements(stages) loop
    stage_name := trim(coalesce(stage->>'name', ''));
    stage_kind := stage->>'kind';
    if stage_name = '' or length(stage_name) > 60 then
      raise exception 'Nome de etapa inválido.' using errcode = 'P0001';
    end if;
    if stage_kind = 'won' then wins := wins + 1;
    elsif stage_kind = 'lost' then losses := losses + 1;
    elsif stage_kind = 'open' then opens := opens + 1;
    else raise exception 'Tipo de etapa inválido.' using errcode = 'P0001';
    end if;
  end loop;
  if wins <> 1 or losses <> 1 or opens < 1 then
    raise exception 'O funil precisa de uma etapa de ganho, uma de perda e ao menos uma em andamento.'
      using errcode = 'P0001';
  end if;

  select p.id into target_pipeline
    from public.pipelines p
   where p.organization_id = org_id and p.is_default;
  if target_pipeline is null then
    raise exception 'A organização não tem funil padrão.' using errcode = 'P0001';
  end if;

  -- Só funil virgem. Etapa com lead não pode sumir (deals.stage_id é
  -- "on delete restrict"), e formulário/automação apontando para uma etapa
  -- perderiam o destino em silêncio.
  if exists (select 1 from public.deals d where d.pipeline_id = target_pipeline) then
    raise exception 'O funil já tem negociações. Ajuste as etapas em Funis e etapas.'
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.forms f where f.pipeline_id = target_pipeline) then
    raise exception 'O funil já é usado por formulários. Ajuste as etapas em Funis e etapas.'
      using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.automation_rules r
     where r.organization_id = org_id
       and (r.trigger_config ? 'stage_id' or r.trigger_config ? 'pipeline_id'
            or r.actions::text like '%stage_id%')
  ) then
    raise exception 'Há automações ligadas a etapas. Ajuste as etapas em Funis e etapas.'
      using errcode = 'P0001';
  end if;

  delete from public.pipeline_stages where pipeline_id = target_pipeline;

  for stage in select value from jsonb_array_elements(stages) loop
    stage_kind := stage->>'kind';
    insert into public.pipeline_stages (pipeline_id, name, order_index, color, is_won_stage, is_lost_stage)
    values (
      target_pipeline,
      trim(stage->>'name'),
      stage_index,
      case stage_kind
        when 'won' then '#10b981'
        when 'lost' then '#ef4444'
        else open_colors[(stage_index % array_length(open_colors, 1)) + 1]
      end,
      stage_kind = 'won',
      stage_kind = 'lost'
    );
    stage_index := stage_index + 1;
  end loop;

  update public.pipelines
     set name = trim(pipeline_name)
   where id = target_pipeline;

  return target_pipeline;
end;
$$;

revoke all on function public.apply_onboarding_pipeline(uuid, text, jsonb) from public;
grant execute on function public.apply_onboarding_pipeline(uuid, text, jsonb) to authenticated;

-- Registro no ledger (o cliente aplica à mão; ver README, "Sobre o db push").
-- Descomente ao aplicar pelo painel:
-- insert into supabase_migrations.schema_migrations (version, name)
-- values ('0030', 'configuracao_inicial')
-- on conflict (version) do nothing;
