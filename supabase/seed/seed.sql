-- ============================================================
-- Wavemov CRM — Seed inicial
--
-- Como usar:
-- 1. Aplique as migrations (0001 a 0004).
-- 2. Cadastre-se pelo app (/register) — isso cria seu usuário,
--    perfil, organização, funil padrão e etapas automaticamente.
-- 3. Rode este arquivo no SQL Editor do Supabase para:
--    - promover seu usuário a ADMIN GLOBAL
--    - popular sua organização com dados demo
--
-- Substitua o e-mail abaixo pelo e-mail que você cadastrou.
-- ============================================================

-- 1) Promover usuário a admin global
update public.profiles
set is_global_admin = true
where email = 'seu-email@exemplo.com';

-- 2) Popular a organização do usuário com dados demo
select public.seed_demo_data(om.organization_id)
from public.organization_members om
join public.profiles p on p.id = om.profile_id
where p.email = 'seu-email@exemplo.com'
limit 1;

-- (Opcional) Criar uma segunda organização demo para testar o multiempresa
do $$
declare
  demo_org uuid;
  admin_profile uuid;
begin
  select id into admin_profile from public.profiles where email = 'seu-email@exemplo.com';
  if admin_profile is null then
    raise notice 'Perfil não encontrado — ajuste o e-mail no seed.sql';
    return;
  end if;

  insert into public.organizations (name, segment, owner_name)
  values ('Seguros Capixaba (Demo)', 'Plano de Saúde', 'Joelson')
  returning id into demo_org;

  insert into public.organization_members (organization_id, profile_id, role)
  values (demo_org, admin_profile, 'org_admin');

  perform public.provision_organization_defaults(demo_org);
  perform public.seed_demo_data(demo_org);
end;
$$;
