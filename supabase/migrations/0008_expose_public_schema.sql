-- Garante que a Data API (PostgREST) exponha o schema usado pelo CRM.
-- Alguns projetos reutilizados mantêm pgrst.db_schemas personalizado e,
-- mesmo com GRANTs corretos, respondem PGRST205 para tabelas de public.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public';
alter role authenticator set pgrst.db_extra_search_path = 'public, extensions';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
