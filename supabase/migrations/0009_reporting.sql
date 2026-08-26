-- ============================================================
-- Wavemov CRM — 0009: Agregados de relatório e índices de apoio
--
-- Objetivo: parar de trazer milhares de linhas de `deals` para o Node só
-- para contar. As views usam `security_invoker = on`, então o RLS de quem
-- consulta continua valendo (isolamento por organização preservado).
-- ============================================================

-- ------------------------------------------------------------
-- Índices que faltavam para as telas de relatório
-- ------------------------------------------------------------

-- Relatório de entrada de leads: "quais deals vieram de formulário"
create index if not exists form_submissions_deal_idx
  on public.form_submissions (deal_id)
  where deal_id is not null;

-- Listagens e gráficos por data de criação dentro da organização
create index if not exists deals_org_created_idx
  on public.deals (organization_id, created_at desc);

-- Conversas do WhatsApp vinculadas a uma negociação (canal de origem)
create index if not exists whatsapp_conversations_deal_idx
  on public.whatsapp_conversations (deal_id)
  where deal_id is not null;

-- ------------------------------------------------------------
-- Resumo de negociações por organização (lista de Empresas)
-- ------------------------------------------------------------
create or replace view public.organization_deal_stats
with (security_invoker = on) as
select
  d.organization_id,
  count(*)                                                     as deals_total,
  count(*) filter (where d.status = 'open')                    as deals_open,
  count(*) filter (where d.status = 'won')                     as deals_won,
  count(*) filter (where d.status = 'lost')                    as deals_lost,
  coalesce(sum(d.value) filter (where d.status = 'won'), 0)    as value_won,
  coalesce(sum(d.value) filter (where d.status = 'open'), 0)   as value_open,
  max(d.created_at)                                            as last_deal_at,
  max(d.updated_at)                                            as last_activity_at
from public.deals d
group by d.organization_id;

comment on view public.organization_deal_stats is
  'Contagens e valores de negociações por organização. security_invoker: respeita o RLS de deals.';

-- ------------------------------------------------------------
-- Volume por etapa do funil (tela "Etapas do funil")
-- ------------------------------------------------------------
create or replace view public.pipeline_stage_stats
with (security_invoker = on) as
select
  s.id                                                       as stage_id,
  s.pipeline_id,
  p.organization_id,
  count(d.id)                                                as deals_total,
  count(d.id) filter (where d.status = 'open')               as deals_open,
  coalesce(sum(d.value) filter (where d.status = 'open'), 0) as value_open
from public.pipeline_stages s
join public.pipelines p on p.id = s.pipeline_id
left join public.deals d on d.stage_id = s.id
group by s.id, s.pipeline_id, p.organization_id;

comment on view public.pipeline_stage_stats is
  'Volume e valor de negociações por etapa. security_invoker: respeita o RLS de pipelines/deals.';

grant select on public.organization_deal_stats to authenticated;
grant select on public.pipeline_stage_stats   to authenticated;
