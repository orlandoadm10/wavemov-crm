-- ============================================================
-- Wavemov CRM — 0010: Segredo de webhook por instância WhatsApp (UAZAPI)
--
-- PROBLEMA
-- `UAZAPI_WEBHOOK_SECRET` era UM único valor em env, válido para as ~300
-- empresas da base, e a tela `/atendimento/configuracoes` montava
-- `...?org=<id>&secret=<segredo>` sem nenhuma guarda de papel. Qualquer
-- membro (inclusive `viewer`) lia o segredo que vale para o CRM inteiro;
-- com ele e o UUID de outra empresa dava para forjar mensagens e criar
-- contatos e leads na conta alheia — em QUALQUER uma das 300, tenha ela
-- WhatsApp configurado ou não. A rota do webhook usa `service_role`, então
-- o RLS não protege nada lá dentro.
--
-- SOLUÇÃO
-- Cada instância WhatsApp passa a ter o próprio segredo, aleatório e
-- rotacionável isoladamente.
--
-- POR QUE EM `whatsapp_instances` E NÃO EM `organizations`
-- A 0005 já revogou `whatsapp_instances` de `anon` e `authenticated`: a
-- tabela só é acessível por `service_role`, então o segredo nunca fica ao
-- alcance do navegador. `organizations`, ao contrário, é legível por
-- qualquer membro via RLS (`has_org_access`), é consultada com `select *`
-- em `getSessionContext()` e o objeto inteiro viaja como prop até um
-- componente cliente (`components/layout/top-nav.tsx`). Uma coluna de
-- segredo ali vazaria para todo mundo — exatamente o defeito que esta
-- migration existe para fechar. Revogar a coluna via grant de coluna
-- quebraria todo `select *` da aplicação.
--
-- POR INSTÂNCIA, NÃO POR ORGANIZAÇÃO
-- O produto vai permitir mais de uma instância por empresa (empresas com
-- vários atendentes). O segredo por instância identifica QUEM recebeu a
-- mensagem, não só a empresa — é o que permite gravar `instance_id` na
-- conversa e responder pelo mesmo número.
--
-- CORTE LIMPO, SEM PERÍODO DE COMPATIBILIDADE
-- Existe UMA instância cadastrada em produção. Aceitar o segredo global em
-- paralelo custaria um caminho de compatibilidade permanente para poupar a
-- reconfiguração de um único painel da UAZAPI. Depois desta migration o
-- webhook antigo devolve 401 até a URL nova ser colada lá — ver o passo a
-- passo no CHANGELOG.
-- ============================================================

-- ------------------------------------------------------------
-- Gerador do segredo
--
-- Usa `gen_random_uuid()` (core do Postgres 13+, em `pg_catalog`) em vez de
-- `gen_random_bytes()` do pgcrypto: no Supabase a extensão costuma viver no
-- schema `extensions` e depender do `search_path` dentro de um DEFAULT de
-- coluna é fonte de falha silenciosa. Dois UUID v4 = 244 bits de entropia,
-- muito acima do necessário para um segredo de webhook.
--
-- O prefixo `wmv_` identifica o segredo à primeira vista no painel da
-- UAZAPI e nas URLs guardadas por terceiros.
-- ------------------------------------------------------------
create or replace function public.generate_webhook_secret()
returns text
language sql
volatile
set search_path = public
as $$
  select 'wmv_'
    || replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '');
$$;

-- Função de uso interno (DEFAULT da coluna e server actions com service
-- role). Sem o revoke, o PostgREST a exporia como RPC pública.
revoke execute on function public.generate_webhook_secret() from anon;
revoke execute on function public.generate_webhook_secret() from authenticated;

-- ------------------------------------------------------------
-- Coluna + backfill das instâncias já existentes
--
-- Em três passos de propósito: adiciona nula, preenche uma linha de cada
-- vez (a função é volatile, então cada instância recebe um segredo
-- diferente) e só então trava com NOT NULL. Explícito para quem lê a
-- migration depois — e imune a mudança de comportamento do fast path de
-- ADD COLUMN ... DEFAULT.
-- ------------------------------------------------------------
alter table public.whatsapp_instances
  add column if not exists webhook_secret text;

update public.whatsapp_instances
   set webhook_secret = public.generate_webhook_secret()
 where webhook_secret is null;

alter table public.whatsapp_instances
  alter column webhook_secret set default public.generate_webhook_secret();

alter table public.whatsapp_instances
  alter column webhook_secret set not null;

comment on column public.whatsapp_instances.webhook_secret is
  'Segredo do webhook desta instância. Nunca sai do servidor: só a rota /api/webhooks/uazapi e a tela de configurações (restrita a org_admin) o leem. Rotacionável isoladamente, sem afetar nenhuma outra instância ou empresa.';

-- Lookup do webhook é `where webhook_secret = <valor>`: o índice único
-- torna a busca O(log n) e garante que um segredo nunca aponte para duas
-- instâncias — condição para a rota resolver empresa E instância a partir
-- do segredo apresentado.
create unique index if not exists whatsapp_instances_webhook_secret_key
  on public.whatsapp_instances (webhook_secret);

-- ------------------------------------------------------------
-- Reforço do isolamento (já aplicado na 0005, repetido aqui de propósito:
-- a coluna nova é o ativo mais sensível da tabela e o revoke é idempotente)
-- ------------------------------------------------------------
revoke all on table public.whatsapp_instances from anon;
revoke all on table public.whatsapp_instances from authenticated;

-- PostgREST precisa reler o schema para enxergar a coluna nova
notify pgrst, 'reload schema';
