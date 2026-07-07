-- ============================================================
-- Wavemov CRM — 0005: Endurecimento de segurança
--
-- O token da UAZAPI fica em whatsapp_instances.token_encrypted.
-- Clientes (anon/authenticated) NUNCA acessam esta tabela
-- diretamente — toda leitura/escrita passa pelas rotas de API
-- do servidor (service_role). Revogamos os privilégios para
-- garantir isso em nível de banco, além do RLS.
-- ============================================================

revoke all on table public.whatsapp_instances from anon;
revoke all on table public.whatsapp_instances from authenticated;

-- Formulários públicos: submissions só entram via service role
revoke insert, update, delete on table public.form_submissions from anon;
revoke all on table public.form_submissions from anon;
