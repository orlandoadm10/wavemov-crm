-- ============================================================
-- 0031 — Filtros de data e ordenação do Kanban de negociações
--
-- O Kanban carrega no máximo 500 negociações. Filtrar ou ordenar no navegador
-- sobre esse recorte mentiria na primeira empresa com 501: o filtro "Hoje"
-- olharia só os 500 que chegaram, e "Contato mais recente" ordenaria uma
-- amostra. Por isso a SELEÇÃO e a ORDEM saem daqui, e a tela só desenha.
--
-- A função devolve os ids na ordem certa (com o total antes do corte); a
-- página busca as linhas com os embeds de sempre (contato, responsável, tags)
-- — sob a RLS normal — e mantém esta ordem.
--
-- CAMPOS REAIS DE CADA FILTRO
--   Data de criação      → deals.created_at
--   Data último contato  → a "tratativa" da 0025: o mais recente entre
--                          activity_logs da equipe (lista de inclusão abaixo)
--                          e whatsapp_messages outbound da conversa do lead.
--                          Mensagem DO lead não conta — ver cabeçalho da 0025.
--   Data próxima tarefa  → min(tasks.due_at) das tarefas pendentes do lead
--                          (inclui atrasadas: é a próxima coisa a fazer)
--   Data de fechamento   → deals.expected_close_date — o campo "Fechamento"
--                          do formulário e do detalhe da negociação
--   Data modificação     → deals.updated_at (trigger deals_updated_at, 0001)
--   Nome do contato      → contacts.name; sem contato, deals.title
--
-- Filtro sobre data nula EXCLUI a linha (`null between a and b` é nulo).
-- Sem filtro naquela data, a linha fica. Ordenação: nulos sempre no fim.
--
-- SEGURANÇA: `security definer` desliga a RLS, então o recorte da 0011 é
-- reimplementado como na 0025 — organização checada por has_org_access, e
-- seller/agent só veem os leads de que são responsáveis.
--
-- Aditiva e idempotente. Sem tabela temporária e sem begin/commit.
-- ============================================================

-- Próxima tarefa por lead: só pendentes, ordenadas por prazo.
create index if not exists tasks_deal_pendentes_idx
  on public.tasks (deal_id, due_at)
  where status = 'pending';

create or replace function public.negociacoes_do_kanban(
  org_id          uuid,
  funil_id        uuid        default null,
  situacao        text        default 'open',
  responsavel     uuid        default null,
  tag             uuid        default null,
  busca           text        default null,
  ordem           text        default 'contato_recente',
  criado_de       timestamptz default null,
  criado_ate      timestamptz default null,
  contato_de      timestamptz default null,
  contato_ate     timestamptz default null,
  tarefa_de       timestamptz default null,
  tarefa_ate      timestamptz default null,
  fechamento_de   date        default null,
  fechamento_ate  date        default null,
  limite          integer     default 500
)
returns table (
  deal_id            uuid,
  ultimo_contato_em  timestamptz,
  proxima_tarefa_em  timestamptz,
  total              bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare
  visao_completa boolean;
  meu_perfil     uuid;
  teto           integer;
  termo          text;
  criterio       text;
  tipos_de_tratativa text[] := array[
    'whatsapp_outbound', 'note', 'task_created', 'task_done',
    'stage_changed', 'responsible_changed', 'lead_info_updated',
    'deal_won', 'deal_lost', 'deal_archived'
  ];
begin
  if org_id is null then
    raise exception 'Organização não informada.' using errcode = 'P0001';
  end if;
  if not public.has_org_access(org_id) then
    raise exception 'Sem acesso a esta organização.' using errcode = '42501';
  end if;

  visao_completa := public.has_full_lead_visibility(org_id);
  meu_perfil     := public.current_profile_id();
  teto           := least(greatest(coalesce(limite, 500), 1), 1000);
  criterio       := case
                      when ordem in ('az', 'za', 'contato_recente', 'contato_antigo', 'modificacao') then ordem
                      else 'contato_recente'
                    end;
  -- `%` e `_` digitados são texto, não curinga.
  termo := nullif(btrim(coalesce(busca, '')), '');
  if termo is not null then
    termo := '%' || replace(replace(replace(termo, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  with base as (
    select d.id, d.created_at, d.updated_at,
           translate(
             lower(coalesce(nullif(btrim(c.name), ''), d.title)),
             'áàâãäéèêëíìîïóòôõöúùûüçñ',
             'aaaaaeeeeiiiiooooouuuucn'
           ) as nome_ordem
      from public.deals d
      left join public.contacts c
        on c.id = d.contact_id and c.organization_id = org_id
     where d.organization_id = org_id
       and (visao_completa or d.responsible_id = meu_perfil)
       and (funil_id is null or d.pipeline_id = funil_id)
       and (situacao is null or situacao = 'todas' or d.status = situacao)
       and (responsavel is null or d.responsible_id = responsavel)
       and (tag is null or exists (
             select 1 from public.deal_tag_assignments ta
              where ta.deal_id = d.id and ta.tag_id = tag and ta.organization_id = org_id))
       and (termo is null
            or d.title ilike termo
            or c.name ilike termo
            or c.whatsapp_phone ilike termo
            or c.phone ilike termo)
       and (criado_de is null or d.created_at >= criado_de)
       and (criado_ate is null or d.created_at <= criado_ate)
       and (fechamento_de is null or d.expected_close_date >= fechamento_de)
       and (fechamento_ate is null or d.expected_close_date <= fechamento_ate)
  ),
  medido as (
    select b.*,
           greatest(al.em, wa.em) as ultimo_contato,
           tf.em as proxima_tarefa
      from base b
      left join lateral (
        select max(a.created_at) as em
          from public.activity_logs a
         where a.deal_id = b.id
           and a.organization_id = org_id
           and a.type = any(tipos_de_tratativa)
      ) al on true
      left join lateral (
        select max(m.created_at) as em
          from public.whatsapp_messages m
          join public.whatsapp_conversations cv on cv.id = m.conversation_id
         where cv.deal_id = b.id
           and cv.organization_id = org_id
           and m.organization_id = org_id
           and m.direction = 'outbound'
      ) wa on true
      left join lateral (
        select min(t.due_at) as em
          from public.tasks t
         where t.deal_id = b.id
           and t.organization_id = org_id
           and t.status = 'pending'
      ) tf on true
  ),
  filtrado as (
    select m.*, count(*) over () as total_geral
      from medido m
     where (contato_de is null or m.ultimo_contato >= contato_de)
       and (contato_ate is null or m.ultimo_contato <= contato_ate)
       and (tarefa_de is null or m.proxima_tarefa >= tarefa_de)
       and (tarefa_ate is null or m.proxima_tarefa <= tarefa_ate)
  )
  select f.id, f.ultimo_contato, f.proxima_tarefa, f.total_geral
    from filtrado f
   order by
     (case when criterio = 'az' then f.nome_ordem end) asc nulls last,
     (case when criterio = 'za' then f.nome_ordem end) desc nulls last,
     (case when criterio = 'contato_recente' then f.ultimo_contato end) desc nulls last,
     (case when criterio = 'contato_antigo' then f.ultimo_contato end) asc nulls last,
     (case when criterio = 'modificacao' then f.updated_at end) desc nulls last,
     f.created_at desc,
     f.id
   limit teto;
end;
$$;

revoke all on function public.negociacoes_do_kanban(
  uuid, uuid, text, uuid, uuid, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz,
  date, date, integer
) from public;
grant execute on function public.negociacoes_do_kanban(
  uuid, uuid, text, uuid, uuid, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz,
  date, date, integer
) to authenticated;

-- Registro no ledger — rode junto ao aplicar pelo painel:
-- insert into supabase_migrations.schema_migrations (version, name)
-- values ('0031', 'filtros_do_kanban')
-- on conflict (version) do nothing;
