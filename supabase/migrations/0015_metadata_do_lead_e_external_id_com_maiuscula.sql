-- ============================================================
-- Wavemov CRM — 0015: respostas do lead e external_id com maiúscula
--
-- Duas correções vindas do primeiro uso real da ingestão externa (Typeform e
-- Meta Lead Ads, via n8n).
--
-- 1. AS RESPOSTAS DO LEAD NÃO TINHAM ONDE MORAR
-- A `0014` guarda em `form_submissions.raw_data` apenas o que sobrevive à
-- sanitização contra `form_fields` — nome, e-mail, telefone. Mas o payload de
-- verdade traz junto o bloco de respostas do formulário de origem ("POSSUI
-- CNPJ?: MEI", "QUANTAS VIDAS?: 4"…), que é exatamente o que o atendente
-- precisa ler antes de responder. Esse bloco não tem campo correspondente em
-- `form_fields` — nem deve ter: as perguntas mudam a cada campanha, e obrigar
-- o operador a recadastrá-las no CRM a cada mudança do Typeform garantiria
-- que um dia a resposta fosse descartada em silêncio.
--
-- Por isso uma coluna própria, `metadata`, guardada COMO VEIO, sem
-- sanitização por campo. A separação importa:
--   `raw_data` = o que o CRM entende e usa para criar contato e negociação;
--   `metadata` = o que a origem contou sobre o lead, para leitura humana.
--
-- 2. `external_id` PRECISA ACEITAR MAIÚSCULA
-- O identificador é o id do formulário na origem, colado como está: o
-- Typeform usa tokens alfanuméricos e o Meta usa o `form_id` numérico. Nem
-- todos são minúsculos, e forçar minúscula obrigaria o operador a "traduzir"
-- o id — mais um passo manual para errar.
--
-- A comparação continua SENSÍVEL A CAIXA, por decisão do cliente: `Abc` e
-- `abc` são identificadores diferentes. Consequência a conhecer: colar o id
-- com a caixa errada no n8n responde 404, igual a um id inexistente. Está
-- documentado em `docs/FUNCIONALIDADES.md`.
--
-- Idempotente: pode ser executada duas vezes sem efeito colateral.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Respostas da origem
--
-- `not null default '{}'` mantém correto todo o histórico já gravado: as
-- submissões anteriores passam a ter um objeto vazio, nunca nulo, e a
-- interface não precisa de um caminho especial para "antes da 0015".
-- ------------------------------------------------------------
alter table public.form_submissions
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.form_submissions.metadata is
  'Bloco de dados que a origem enviou sobre o lead (respostas do Typeform, do Meta Lead Ads etc.), guardado como veio e SEM sanitização contra form_fields — as perguntas mudam a cada campanha e não são cadastradas no CRM. Só para leitura humana: nenhuma regra de negócio depende do conteúdo. Distinto de raw_data, que guarda o que o CRM entende e usa para criar contato e negociação.';

-- ------------------------------------------------------------
-- 2. Formato do `external_id`
--
-- Substitui o check da 0014. O padrão antigo (`[a-z0-9]`) é subconjunto do
-- novo, então nenhuma linha existente pode violá-lo — a troca não precisa de
-- verificação prévia de dados sujos.
--
-- `drop` + `add` em vez de alterar: constraint de check não é alterável no
-- Postgres, e o par é idempotente porque o `drop` usa `if exists` e o `add`
-- só roda quando o nome não está presente.
-- ------------------------------------------------------------
alter table public.forms
  drop constraint if exists forms_external_id_format;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'forms_external_id_format'
       and conrelid = 'public.forms'::regclass
  ) then
    alter table public.forms
      add constraint forms_external_id_format
      check (external_id is null or external_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$');
  end if;
end;
$$;

-- O índice único de `forms_external_id_key` (0014) continua sobre a coluna
-- crua, portanto sensível a caixa: `Abc` e `abc` coexistem e são formulários
-- diferentes. É o comportamento pedido — o lookup da rota compara igual.

comment on column public.forms.external_id is
  'Apelido estável do formulário, colado manualmente no fluxo do n8n — normalmente o id do formulário na origem (Typeform, Meta Lead Ads). Globalmente único e SENSÍVEL A CAIXA. Resolve QUAL formulário recebe o lead — não autentica nada: quem autentica é o segredo em organization_ingest_secrets, e a rota é obrigada a conferir que este formulário pertence à organização daquele segredo.';

-- PostgREST precisa reler o schema para enxergar a coluna nova
notify pgrst, 'reload schema';
