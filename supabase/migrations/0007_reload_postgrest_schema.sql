-- Recarrega o cache do PostgREST depois de conceder acesso às tabelas.
-- Necessário em projetos onde o schema foi criado manualmente antes do
-- histórico de migrations ser vinculado pelo Supabase CLI.
notify pgrst, 'reload schema';
notify pgrst, 'reload config';
