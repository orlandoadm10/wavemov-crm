-- ============================================================
-- Wavemov CRM — 0013: coerência entre negociação, funil e etapa
--
-- As FKs de `deals` são isoladas: `pipeline_id` aponta para um funil qualquer
-- e `stage_id` para uma etapa qualquer. Nada no banco exige que a etapa
-- pertença ao funil, nem que o funil pertença à organização da negociação.
--
-- Até agora a invariante era mantida só pelo JavaScript. Com a troca de funil
-- disponível na tela de atendimento, `pipeline_id` passou a ser editável em
-- mais um lugar, e um membro autenticado que chame o PostgREST direto pode
-- gravar no próprio lead o funil de OUTRA organização: o lead some do Kanban
-- da empresa dele e passa a ser contado nas etapas da empresa vizinha.
--
-- Esta migration move a regra para onde ela não depende da tela.
--
-- Idempotente: pode ser executada duas vezes sem efeito colateral.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Recusa instalar a guarda sobre dados que já a violam
--
-- Sem esta checagem, uma linha incoerente pré-existente só apareceria no dia
-- em que alguém tentasse editar aquele lead — e ele ficaria inexplicavelmente
-- ineditável. Melhor falhar agora, alto e claro.
-- ------------------------------------------------------------
do $$
declare
  incoerentes bigint;
begin
  select count(*)
    into incoerentes
    from public.deals d
    left join public.pipelines p on p.id = d.pipeline_id
    left join public.pipeline_stages s on s.id = d.stage_id
   where p.id is null
      or s.id is null
      or p.organization_id <> d.organization_id
      or s.pipeline_id <> d.pipeline_id;

  if incoerentes > 0 then
    raise exception
      'Há % negociação(ões) cujo funil/etapa não batem entre si ou com a organização. Corrija os dados antes de aplicar a 0013 (a consulta do bloco 1 desta migration lista o critério).',
      incoerentes
      using errcode = 'P0001';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 2. A guarda
--
-- Dispara só quando um dos três campos muda — mover card no Kanban, trocar a
-- etapa no atendimento ou criar lead. São duas buscas por chave primária, sem
-- peso perceptível. `security definer` de propósito: a validação precisa
-- enxergar o funil independentemente do RLS de quem escreve, senão um seller
-- receberia "funil não encontrado" para um funil que existe.
-- ------------------------------------------------------------
create or replace function public.deals_pipeline_stage_guard()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  funil_org uuid;
  etapa_funil uuid;
begin
  select p.organization_id into funil_org
    from public.pipelines p
   where p.id = new.pipeline_id;

  if funil_org is null or funil_org <> new.organization_id then
    raise exception 'O funil escolhido não pertence à organização desta negociação.'
      using errcode = '42501';
  end if;

  select s.pipeline_id into etapa_funil
    from public.pipeline_stages s
   where s.id = new.stage_id;

  if etapa_funil is null or etapa_funil <> new.pipeline_id then
    raise exception 'A etapa escolhida não pertence ao funil desta negociação.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists deals_pipeline_stage_guard on public.deals;
create trigger deals_pipeline_stage_guard
  before insert or update of organization_id, pipeline_id, stage_id on public.deals
  for each row execute function public.deals_pipeline_stage_guard();

notify pgrst, 'reload schema';
