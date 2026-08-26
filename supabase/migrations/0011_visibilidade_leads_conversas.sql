-- ============================================================
-- Wavemov CRM — 0011: Visibilidade por responsável
--
-- seller/agent: somente os próprios leads e suas conversas.
-- org_admin/global admin: todos os leads, conversas e mensagens da empresa.
-- viewer: mantém a visão gerencial somente leitura já existente no produto.
--
-- Também deixa de misturar, numa mesma conversa, mensagens que chegaram por
-- instâncias/números diferentes. O mesmo lead pode ter várias conversas e a
-- visão gerencial continua consolidada por `deal_id`.
-- ============================================================

-- Acesso gerencial ao conjunto completo de leads da organização.
create or replace function public.has_full_lead_visibility(org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_global_admin()
      or exists (
        select 1
        from public.organization_members om
        join public.profiles p on p.id = om.profile_id
        where p.auth_user_id = auth.uid()
          and om.organization_id = org_id
          and om.is_active
          and om.role in ('org_admin', 'viewer')
      );
$$;

-- SECURITY DEFINER evita recursão entre as policies de deals, conversas e
-- mensagens. A função sempre confirma a organização e o membership ativo.
create or replace function public.can_access_deal(target_deal_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_global_admin()
      or exists (
        select 1
        from public.deals d
        join public.organization_members om on om.organization_id = d.organization_id
        join public.profiles p on p.id = om.profile_id
        where d.id = target_deal_id
          and p.auth_user_id = auth.uid()
          and om.is_active
          and (
            om.role in ('org_admin', 'viewer')
            or (om.role in ('seller', 'agent') and d.responsible_id = p.id)
          )
      );
$$;

create or replace function public.can_access_conversation(target_conversation_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_global_admin()
      or exists (
        select 1
        from public.whatsapp_conversations c
        join public.organization_members om on om.organization_id = c.organization_id
        join public.profiles p on p.id = om.profile_id
        left join public.deals d
          on d.id = c.deal_id
         and d.organization_id = c.organization_id
        where c.id = target_conversation_id
          and p.auth_user_id = auth.uid()
          and om.is_active
          and (
            om.role in ('org_admin', 'viewer')
            or (
              om.role in ('seller', 'agent')
              and (c.assigned_to = p.id or d.responsible_id = p.id)
            )
          )
      );
$$;

-- `assigned_to` é a cópia operacional do responsável do lead no módulo de
-- atendimento. Os triggers impedem que uma transferência deixe a conversa
-- acessível ao atendente anterior.
create or replace function public.sync_conversation_owner_from_deal()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.deal_id is not null then
    select d.responsible_id
      into new.assigned_to
      from public.deals d
     where d.id = new.deal_id
       and d.organization_id = new.organization_id;
    if not found then
      raise exception 'A negociação vinculada não pertence à organização da conversa.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_conversations_sync_owner
  on public.whatsapp_conversations;
create trigger whatsapp_conversations_sync_owner
  before insert or update of deal_id, assigned_to on public.whatsapp_conversations
  for each row execute function public.sync_conversation_owner_from_deal();

create or replace function public.sync_deal_conversations_owner()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.whatsapp_conversations
     set assigned_to = new.responsible_id
   where organization_id = new.organization_id
     and deal_id = new.id
     and assigned_to is distinct from new.responsible_id;
  return new;
end;
$$;

drop trigger if exists deals_sync_conversations_owner on public.deals;
create trigger deals_sync_conversations_owner
  after update of responsible_id on public.deals
  for each row
  when (old.responsible_id is distinct from new.responsible_id)
  execute function public.sync_deal_conversations_owner();

-- Alinha o histórico já existente antes de ativar a fronteira nova.
update public.whatsapp_conversations c
   set assigned_to = d.responsible_id
  from public.deals d
 where c.deal_id = d.id
   and c.organization_id = d.organization_id
   and c.assigned_to is distinct from d.responsible_id;

-- ------------------------------------------------------------
-- Leads
-- ------------------------------------------------------------
drop policy if exists "deals: leitura por membros" on public.deals;
drop policy if exists "deals: escrita por membros" on public.deals;
drop policy if exists "deals: edição por membros" on public.deals;

create policy "deals: leitura por responsabilidade"
  on public.deals for select
  using (
    public.has_full_lead_visibility(organization_id)
    or (
      public.has_org_access(organization_id)
      and responsible_id = public.current_profile_id()
    )
  );

create policy "deals: criação por responsabilidade"
  on public.deals for insert
  with check (
    public.has_org_write(organization_id)
    and (
      public.has_full_lead_visibility(organization_id)
      or responsible_id = public.current_profile_id()
    )
  );

-- O responsável atual pode trabalhar e transferir o próprio lead. Depois da
-- transferência, o RLS deixa de devolver a linha para ele imediatamente.
create policy "deals: edição por responsabilidade"
  on public.deals for update
  using (
    public.has_full_lead_visibility(organization_id)
    or (
      public.has_org_access(organization_id)
      and responsible_id = public.current_profile_id()
    )
  )
  with check (public.has_org_write(organization_id));

-- ------------------------------------------------------------
-- Conversas e mensagens
-- ------------------------------------------------------------
drop policy if exists "whatsapp_conversations: leitura por membros"
  on public.whatsapp_conversations;
drop policy if exists "whatsapp_conversations: escrita por membros"
  on public.whatsapp_conversations;
drop policy if exists "whatsapp_conversations: edição por membros"
  on public.whatsapp_conversations;

create policy "whatsapp_conversations: leitura por responsabilidade"
  on public.whatsapp_conversations for select
  using (public.can_access_conversation(id));

create policy "whatsapp_conversations: criação por responsabilidade"
  on public.whatsapp_conversations for insert
  with check (
    public.has_org_write(organization_id)
    and (
      public.has_full_lead_visibility(organization_id)
      or assigned_to = public.current_profile_id()
      or (deal_id is not null and public.can_access_deal(deal_id))
    )
  );

create policy "whatsapp_conversations: edição por responsabilidade"
  on public.whatsapp_conversations for update
  using (public.can_access_conversation(id))
  with check (
    public.has_org_write(organization_id)
    and (
      public.has_full_lead_visibility(organization_id)
      or assigned_to = public.current_profile_id()
      or (deal_id is not null and public.can_access_deal(deal_id))
    )
  );

drop policy if exists "whatsapp_messages: leitura por membros"
  on public.whatsapp_messages;
drop policy if exists "whatsapp_messages: escrita por membros"
  on public.whatsapp_messages;
drop policy if exists "whatsapp_messages: edição por membros"
  on public.whatsapp_messages;

create policy "whatsapp_messages: leitura pela conversa"
  on public.whatsapp_messages for select
  using (
    public.can_access_conversation(conversation_id)
    and exists (
      select 1 from public.whatsapp_conversations c
      where c.id = conversation_id
        and c.organization_id = whatsapp_messages.organization_id
    )
  );

create policy "whatsapp_messages: criação pela conversa"
  on public.whatsapp_messages for insert
  with check (
    public.has_org_write(organization_id)
    and public.can_access_conversation(conversation_id)
    and exists (
      select 1 from public.whatsapp_conversations c
      where c.id = conversation_id
        and c.organization_id = whatsapp_messages.organization_id
    )
  );

create policy "whatsapp_messages: edição pela conversa"
  on public.whatsapp_messages for update
  using (public.can_access_conversation(conversation_id))
  with check (
    public.has_org_write(organization_id)
    and public.can_access_conversation(conversation_id)
  );

-- Interações do detalhe do lead seguem a mesma fronteira do lead.
drop policy if exists "activity_logs: leitura por membros" on public.activity_logs;
create policy "activity_logs: leitura pelo lead"
  on public.activity_logs for select
  using (
    public.has_full_lead_visibility(organization_id)
    or (deal_id is not null and public.can_access_deal(deal_id))
    or (
      deal_id is null
      and public.has_org_access(organization_id)
      and actor_id = public.current_profile_id()
    )
  );

drop policy if exists "deal_history: leitura" on public.deal_stage_history;
create policy "deal_history: leitura pelo lead"
  on public.deal_stage_history for select
  using (public.can_access_deal(deal_id));

drop policy if exists "submissions: leitura" on public.form_submissions;
create policy "submissions: leitura pelo lead"
  on public.form_submissions for select
  using (
    exists (
      select 1 from public.forms f
      where f.id = form_id
        and public.has_full_lead_visibility(f.organization_id)
    )
    or (deal_id is not null and public.can_access_deal(deal_id))
  );

drop policy if exists "tasks: leitura por membros" on public.tasks;
create policy "tasks: leitura pelo lead"
  on public.tasks for select
  using (
    public.has_full_lead_visibility(organization_id)
    or (deal_id is not null and public.can_access_deal(deal_id))
    or (
      deal_id is null
      and (assigned_to = public.current_profile_id() or created_by = public.current_profile_id())
    )
  );

drop policy if exists "tasks: escrita por membros" on public.tasks;
drop policy if exists "tasks: edição por membros" on public.tasks;
drop policy if exists "tasks: exclusão por membros" on public.tasks;

create policy "tasks: criação pelo lead"
  on public.tasks for insert
  with check (
    public.has_org_write(organization_id)
    and (
      public.has_full_lead_visibility(organization_id)
      or (deal_id is not null and public.can_access_deal(deal_id))
      or (
        deal_id is null
        and (assigned_to = public.current_profile_id() or created_by = public.current_profile_id())
      )
    )
  );

create policy "tasks: edição pelo lead"
  on public.tasks for update
  using (
    public.has_full_lead_visibility(organization_id)
    or (deal_id is not null and public.can_access_deal(deal_id))
    or (
      deal_id is null
      and (assigned_to = public.current_profile_id() or created_by = public.current_profile_id())
    )
  )
  with check (
    public.has_org_write(organization_id)
    and (
      public.has_full_lead_visibility(organization_id)
      or (deal_id is not null and public.can_access_deal(deal_id))
      or (
        deal_id is null
        and (assigned_to = public.current_profile_id() or created_by = public.current_profile_id())
      )
    )
  );

create policy "tasks: exclusão pelo lead"
  on public.tasks for delete
  using (
    public.has_org_write(organization_id)
    and (
      public.has_full_lead_visibility(organization_id)
      or (deal_id is not null and public.can_access_deal(deal_id))
      or (
        deal_id is null
        and (assigned_to = public.current_profile_id() or created_by = public.current_profile_id())
      )
    )
  );

-- ------------------------------------------------------------
-- Uma conversa por instância/número e telefone do lead
-- ------------------------------------------------------------
alter table public.whatsapp_conversations
  drop constraint if exists whatsapp_conversations_organization_id_phone_key;

create unique index if not exists whatsapp_conversations_instance_phone_key
  on public.whatsapp_conversations (organization_id, instance_id, phone)
  where instance_id is not null;

-- Mantém as conversas legadas sem instância determinísticas durante o
-- backfill: no máximo uma por empresa/telefone.
create unique index if not exists whatsapp_conversations_legacy_phone_key
  on public.whatsapp_conversations (organization_id, phone)
  where instance_id is null;

create index if not exists deals_responsible_idx
  on public.deals (organization_id, responsible_id, created_at desc);

create index if not exists whatsapp_conversations_assigned_idx
  on public.whatsapp_conversations (organization_id, assigned_to, last_message_at desc);

notify pgrst, 'reload schema';
