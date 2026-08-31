-- ============================================================
-- Wavemov CRM — 0022: índice da última entrada recebida
--
-- POR QUE ELE EXISTE
-- A saúde da entrada de leads responde a uma pergunta só, três vezes por
-- página: "quando chegou a última mensagem RECEBIDA desta organização?". Em
-- SQL isso é `order by created_at desc limit 1` com dois filtros — a
-- organização e a direção.
--
-- Os índices que a `0002` criou em `whatsapp_messages` não servem a essa
-- pergunta: `whatsapp_messages_conversation_idx` é por conversa e
-- `whatsapp_messages_provider_idx` é a chave de idempotência do provedor.
-- Sem um índice por organização, cada render de `/dashboard` e `/atendimento`
-- varreria a tabela que mais cresce no schema. O indicador tem que ser barato,
-- senão vira a próxima coisa que alguém desliga.
--
-- POR QUE É PARCIAL
-- O painel nunca pergunta pelo envio. Só a metade `inbound` interessa, e ela é
-- ~metade das linhas: o índice parcial ocupa metade do espaço e continua
-- respondendo em `limit 1`. Monitorar o envio, aliás, está fora de escopo por
-- decisão de produto — o envio nunca parou, e foi justamente ele que escondeu
-- o incidente de 26/08 por quatro dias.
--
-- OS OUTROS DOIS CANAIS NÃO PRECISAM DE BANCO
-- n8n e formulário público leem `form_submissions`, e a `0002` já criou
-- `form_submissions_form_idx (form_id, created_at desc)`. O conjunto de
-- formulários por empresa é pequeno, então a consulta por `form_id` já resolve.
--
-- ADITIVO E IDEMPOTENTE: cria um índice, `if not exists`, e não toca em dado,
-- policy ou função. É deliberado — o ledger remoto de migrations ainda diverge
-- do repositório (débito 8) e o CLI segue linkado à produção. Esta é a
-- migration menos perigosa possível de aplicar nesse estado.
--
-- Sem `concurrently`: a Supabase aplica migration dentro de uma transação, e
-- `create index concurrently` não roda em transação. Em `whatsapp_messages`
-- deste porte o lock de escrita é de instantes; se um dia a tabela crescer a
-- ponto de isso importar, o índice deve ser criado à mão, fora de migration.
-- ============================================================

create index if not exists whatsapp_messages_org_inbound_idx
  on public.whatsapp_messages (organization_id, created_at desc)
  where direction = 'inbound';

comment on index public.whatsapp_messages_org_inbound_idx is
  'Saúde da entrada: última mensagem recebida por organização. Parcial em '
  'direction = ''inbound'' porque o painel nunca pergunta pelo envio.';
