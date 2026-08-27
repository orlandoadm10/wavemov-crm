-- ============================================================
-- Wavemov CRM — 0014: ingestão externa de leads (n8n)
--
-- PROBLEMA
-- Hoje só existe um caminho de entrada automática de lead que não seja o
-- WhatsApp: a página pública `/f/[slug]`, autenticada por nada — o slug é
-- público de propósito, porque quem preenche é o próprio lead. Esse contrato
-- não serve para o n8n: lá quem chama é um sistema, o payload chega no
-- formato da origem (Meta Lead Ads, RD Station, planilha…), o mesmo evento
-- pode ser reentregue numa retentativa e o fluxo precisa provar QUEM é antes
-- de escrever na base de uma empresa.
--
-- SOLUÇÃO
-- Três peças, todas nesta migration:
--   1. `forms.external_id` — o apelido estável do formulário, globalmente
--      único, colado manualmente no fluxo do n8n.
--   2. `organization_ingest_secrets` — o segredo que autentica a chamada,
--      um por organização, fora do alcance do navegador.
--   3. `form_submissions.external_event_id` + `source` — idempotência por
--      FORMULÁRIO + EVENTO e rastro da origem de cada submissão.
--
-- POR QUE O SEGREDO NÃO MORA EM `organizations`
-- Mesmo raciocínio da 0010, e continua sendo bloqueador: `organizations` é
-- legível por qualquer membro via RLS (`has_org_access`), é consultada com
-- `select *` em `getSessionContext()` e o objeto inteiro viaja como prop até
-- `components/layout/top-nav.tsx`. Uma coluna de segredo ali chegaria ao
-- navegador de todo `viewer`. Revogar por coluna quebraria todo `select *`
-- da aplicação. Por isso: tabela própria, revogada de `anon` e
-- `authenticated`, acessível só por `service_role`.
--
-- POR ORGANIZAÇÃO, NÃO POR FORMULÁRIO
-- Uma empresa tem vários formulários e cada um vira um fluxo no n8n. O que
-- precisa ser provado na chamada é "esta requisição fala pela empresa X"; o
-- formulário-alvo é dado explícito do corpo (`external_id`). Um segredo por
-- empresa dá ao gestor do n8n uma credencial só para administrar e uma
-- rotação que fecha todos os fluxos daquela empresa de uma vez — sem tocar
-- em nenhuma outra empresa.
--
-- ISOLAMENTO — a regra número um do projeto
-- O segredo resolve a ORGANIZAÇÃO. O `external_id` resolve o FORMULÁRIO. A
-- rota é obrigada a conferir que o formulário encontrado pertence à
-- organização do segredo apresentado: sem essa checagem, qualquer empresa
-- com credencial válida escreveria na base de qualquer outra apenas
-- adivinhando um `external_id` alheio. O comentário da coluna repete isso
-- porque é o ponto onde a próxima pessoa vai errar.
--
-- Idempotente: pode ser executada duas vezes sem efeito colateral.
-- ============================================================

-- ------------------------------------------------------------
-- 1. `forms.external_id` — identificador estável do formulário
--
-- Globalmente único, não por organização: é ele que o fluxo do n8n manda no
-- corpo, e a rota precisa resolver o formulário ANTES de saber de quem ele
-- é. Um par (organização, external_id) obrigaria o payload a carregar também
-- o UUID da empresa — mais um dado para o gestor do n8n colar errado, sem
-- ganho de segurança, já que quem autentica é o segredo.
--
-- Nulo é permitido: os formulários que já existem continuam funcionando pela
-- página pública e só ganham `external_id` quando alguém quiser ligá-los a
-- um fluxo externo.
--
-- O formato é restrito de propósito. Este valor é colado à mão em outro
-- sistema: espaço, acento e maiúscula viram erro de digitação que só aparece
-- como 404 em produção. Minúsculas, dígitos, hífen e sublinhado, 3 a 64
-- caracteres.
--
-- COLISÃO NÃO PODE REVELAR O DONO
-- O índice é global, então a empresa B recebe erro ao tentar um
-- `external_id` que a empresa A já usa. A aplicação traduz isso para "esse
-- identificador já está em uso, escolha outro" e NUNCA para "pertence à
-- empresa A" — a mensagem crua do PostgREST não pode chegar à tela.
-- ------------------------------------------------------------
alter table public.forms
  add column if not exists external_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'forms_external_id_format'
       and conrelid = 'public.forms'::regclass
  ) then
    alter table public.forms
      add constraint forms_external_id_format
      check (external_id is null or external_id ~ '^[a-z0-9][a-z0-9_-]{2,63}$');
  end if;
end;
$$;

-- Índice único parcial: vários formulários sem `external_id` convivem; dois
-- com o mesmo valor, nunca. É também o índice do lookup da rota de ingestão.
create unique index if not exists forms_external_id_key
  on public.forms (external_id)
  where external_id is not null;

comment on column public.forms.external_id is
  'Apelido estável do formulário, colado manualmente no fluxo do n8n. Globalmente único. Resolve QUAL formulário recebe o lead — não autentica nada: quem autentica é o segredo em organization_ingest_secrets, e a rota é obrigada a conferir que este formulário pertence à organização daquele segredo.';

-- ------------------------------------------------------------
-- 2. Segredo de ingestão por organização
--
-- Reusa `generate_webhook_secret()` da 0010 (dois `gen_random_uuid()`, 244
-- bits, prefixo `wmv_`) em vez de inventar um gerador novo: mesmo formato,
-- mesma entropia, um lugar só para auditar.
--
-- `rotated_at` guarda a última troca. Não existe janela de aceitação do
-- segredo antigo — mesma decisão da 0010: rotacionou, o fluxo antigo é
-- recusado até o valor novo ser colado no n8n. Compatibilidade paralela é
-- caminho que ninguém remove depois.
-- ------------------------------------------------------------
create table if not exists public.organization_ingest_secrets (
  organization_id uuid primary key
                    references public.organizations (id) on delete cascade,
  secret          text not null default public.generate_webhook_secret(),
  created_at      timestamptz not null default now(),
  rotated_at      timestamptz
);

-- Lookup da rota é `where secret = <valor>`: o único garante que um segredo
-- jamais resolva duas organizações — condição para a rota provar a origem em
-- vez de adivinhá-la.
create unique index if not exists organization_ingest_secrets_secret_key
  on public.organization_ingest_secrets (secret);

comment on table public.organization_ingest_secrets is
  'Segredo que autentica a ingestão externa de leads (POST /api/ingest/leads) de UMA organização. Nunca sai do servidor: a tabela é revogada de anon e authenticated, e só a rota de ingestão e a tela de formulários (restrita a org_admin) o leem via service_role. Rotação por empresa, sem período de compatibilidade.';

comment on column public.organization_ingest_secrets.rotated_at is
  'Última rotação. Nulo enquanto o segredo for o gerado na criação da linha.';

-- ------------------------------------------------------------
-- 3. Idempotência por formulário + evento, e origem da submissão
--
-- POR QUE POR FORMULÁRIO + EVENTO, E NÃO POR EVENTO
-- Cada formulário corresponde a um fluxo n8n próprio, e fluxos diferentes
-- leem origens diferentes. Nada impede que o Meta Lead Ads e uma planilha
-- entreguem, cada um, um evento `1`. Único global recusaria o segundo lead
-- como "duplicado" e ele desapareceria sem rastro. A chave é o par.
--
-- Parcial `where external_event_id is not null`: toda submissão da página
-- pública `/f/[slug]` continua entrando sem chave de evento, e nenhuma delas
-- colide com outra.
--
-- `source` separa os dois caminhos de entrada no relatório e no suporte —
-- "esse lead veio do formulário público ou do n8n?" é a primeira pergunta
-- quando alguém reclama de lead faltando. `default 'public_form'` mantém
-- correto todo o histórico já gravado.
-- ------------------------------------------------------------
alter table public.form_submissions
  add column if not exists external_event_id text;

alter table public.form_submissions
  add column if not exists source text not null default 'public_form';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'form_submissions_source_check'
       and conrelid = 'public.form_submissions'::regclass
  ) then
    alter table public.form_submissions
      add constraint form_submissions_source_check
      check (source in ('public_form', 'external_ingest'));
  end if;
end;
$$;

create unique index if not exists form_submissions_form_event_key
  on public.form_submissions (form_id, external_event_id)
  where external_event_id is not null;

comment on column public.form_submissions.external_event_id is
  'Identificador do evento na origem, enviado pelo fluxo do n8n. Único POR FORMULÁRIO (nunca global): fluxos diferentes podem reutilizar o mesmo identificador na origem. Reentrega do mesmo evento reencontra esta submissão em vez de criar um lead repetido.';

comment on column public.form_submissions.source is
  'Caminho de entrada: public_form (página /f/[slug]) ou external_ingest (POST /api/ingest/leads).';

-- ------------------------------------------------------------
-- 4. Isolamento do segredo
--
-- A 0006 concede select/insert/update/delete de TODAS as tabelas do schema a
-- `authenticated`, e as default privileges repetem isso para tabelas criadas
-- depois — inclusive esta. Sem o revoke abaixo, qualquer membro logado leria,
-- pelo PostgREST, o segredo de ingestão de todas as empresas da base. O
-- revoke é o que fecha a porta; o RLS abaixo é a segunda camada.
-- ------------------------------------------------------------
revoke all on table public.organization_ingest_secrets from anon;
revoke all on table public.organization_ingest_secrets from authenticated;

-- Sem policy nenhuma, de propósito: RLS ligado com zero policies significa
-- "ninguém, exceto quem contorna o RLS". `service_role` contorna; é o único
-- que precisa. Se um grant futuro reabrir a tabela por engano, o RLS ainda
-- recusa.
alter table public.organization_ingest_secrets enable row level security;

-- ------------------------------------------------------------
-- 5. Backfill dos segredos das organizações existentes
--
-- Uma linha por organização, cada uma com o próprio segredo (a função é
-- volatile, então o `insert ... select` gera um valor diferente por linha).
-- `on conflict do nothing` mantém a migration reexecutável sem rotacionar
-- nada por acidente.
-- ------------------------------------------------------------
insert into public.organization_ingest_secrets (organization_id)
select o.id from public.organizations o
on conflict (organization_id) do nothing;

-- Organização criada depois desta migration nasce sem linha aqui: a tela de
-- formulários cria sob demanda, na primeira vez que um org_admin abre a
-- ingestão externa. Criar por trigger geraria segredo para empresa que nunca
-- vai usar n8n — segredo vivo sem dono é passivo, não patrimônio.

-- PostgREST precisa reler o schema para enxergar as colunas novas
notify pgrst, 'reload schema';
