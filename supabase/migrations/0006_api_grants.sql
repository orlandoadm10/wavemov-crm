-- ============================================================
-- Wavemov CRM — 0006: Privilégios da Data API
--
-- RLS filtra quais linhas cada usuário pode acessar, mas o papel
-- authenticated também precisa dos privilégios SQL nas tabelas.
-- Projetos Supabase novos não expõem tabelas automaticamente.
-- ============================================================

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete
on all tables in schema public
to authenticated;

grant usage, select
on all sequences in schema public
to authenticated;

grant execute
on all functions in schema public
to authenticated;

-- A instância e o token da UAZAPI continuam exclusivos do servidor.
revoke all on table public.whatsapp_instances from anon, authenticated;

-- Submissões públicas continuam entrando somente pelas rotas service_role.
revoke all on table public.form_submissions from anon;

-- Mantém o mesmo comportamento para tabelas/funções criadas futuramente.
alter default privileges for role postgres in schema public
grant select, insert, update, delete on tables to authenticated;

alter default privileges for role postgres in schema public
grant usage, select on sequences to authenticated;

alter default privileges for role postgres in schema public
grant execute on functions to authenticated;
