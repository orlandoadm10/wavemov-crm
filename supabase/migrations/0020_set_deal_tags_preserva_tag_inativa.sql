-- ============================================================
-- Wavemov CRM — 0020: salvar tags não pode esbarrar na própria guarda
--
-- A 0019 declara, no comentário da guarda, que "tag inativa não é aplicada a
-- nada novo, mas os vínculos que já existem PERMANECEM". A interface, porém,
-- não conseguia honrar isso: para preservar um vínculo de tag inativa ela
-- precisa mandá-lo de volta em `set_deal_tags`, e mandá-lo de volta fazia a
-- chamada inteira falhar.
--
-- POR QUE `ON CONFLICT DO NOTHING` NÃO BASTAVA
-- Em PostgreSQL, um trigger `BEFORE INSERT ... FOR EACH ROW` dispara para
-- TODA linha proposta, antes da detecção do conflito. A linha que o
-- `on conflict (deal_id, tag_id) do nothing` iria descartar por já existir
-- passa pela guarda assim mesmo. Com a tag desativada depois de aplicada, a
-- guarda levanta `P0001` e a transação inteira reverte — inclusive o `delete`
-- que abre a função.
--
-- O efeito na tela era pior que um dado errado: em qualquer lead com uma tag
-- inativa vinculada, NENHUMA edição de tags era possível. A mensagem que
-- chegava ao usuário era o texto genérico de falha, e "atualize a página" não
-- resolvia nada, porque o vínculo antigo continuava lá.
--
-- A CORREÇÃO
-- O `insert` passa a excluir do `select` os pares que já existem. Vínculo
-- repetido deixa de ser proposto, então a guarda não o vê — e continua
-- valendo, intacta, para todo vínculo realmente novo. O `on conflict`
-- permanece como rede contra corrida entre duas abas salvando ao mesmo tempo.
--
-- Nada muda no contrato: o conjunto final continua sendo exatamente
-- `tag_ids`, o `delete` continua removendo o que saiu da seleção (inclusive
-- tag inativa que o usuário desmarcou de propósito), e aplicar uma tag
-- inativa que ainda não estava no lead continua sendo recusado.
--
-- `security INVOKER` e a origem de `organization_id` seguem como na 0019:
-- cada instrução passa pelas policies, e a empresa vem de `deals`.
-- ============================================================

create or replace function public.set_deal_tags(target_deal_id uuid, tag_ids uuid[])
returns void
language plpgsql security invoker set search_path = public
as $$
begin
  delete from public.deal_tag_assignments a
   where a.deal_id = target_deal_id
     and not (a.tag_id = any (coalesce(tag_ids, '{}'::uuid[])));

  insert into public.deal_tag_assignments (deal_id, tag_id, organization_id, assigned_by)
  select d.id, t.id, d.organization_id, public.current_profile_id()
    from public.deals d
    join public.deal_tags t
      on t.organization_id = d.organization_id
     and t.id = any (coalesce(tag_ids, '{}'::uuid[]))
   where d.id = target_deal_id
     -- Vínculo que já existe não é reproposto: a guarda BEFORE INSERT da 0019
     -- dispararia para ele antes do `on conflict` e derrubaria a transação
     -- quando a tag estivesse desativada.
     and not exists (
       select 1
         from public.deal_tag_assignments x
        where x.deal_id = d.id
          and x.tag_id = t.id
     )
  on conflict (deal_id, tag_id) do nothing;
end;
$$;

comment on function public.set_deal_tags(uuid, uuid[]) is
  'Substitui o conjunto de tags da negociação numa transação só. Vínculos já existentes não são repropostos — a guarda BEFORE INSERT da 0019 dispara antes do ON CONFLICT e recusaria a tag desativada depois de aplicada, impedindo qualquer edição no lead. Tag inativa mandada de volta é preservada; omitida, é removida.';

-- `create or replace` preserva os privilégios, mas reafirmar mantém a
-- migration legível sozinha e imune à ordem de aplicação.
revoke all on function public.set_deal_tags(uuid, uuid[]) from public;
grant execute on function public.set_deal_tags(uuid, uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
