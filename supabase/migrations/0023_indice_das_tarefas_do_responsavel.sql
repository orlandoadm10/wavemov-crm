-- ============================================================
-- Wavemov CRM — 0023: índice das tarefas pendentes por responsável
--
-- POR QUE ELE EXISTE
-- O indicador "minhas tarefas vencidas" roda no layout autenticado, ou seja,
-- em TODA página do CRM. A consulta é:
--
--   select count(*) from tasks
--    where organization_id = ? and assigned_to = ?
--      and status = 'pending' and due_at < now()
--
-- O índice que a `0001` criou é `tasks_org_idx (organization_id, status,
-- due_at)` — sem `assigned_to`. Ele resolve o recorte da organização e depois
-- filtra pessoa linha a linha. Enquanto a base tem uma tarefa isso é
-- irrelevante; com o volume que a migração do Bubble traz, é uma varredura por
-- render de qualquer tela.
--
-- POR QUE É PARCIAL
-- Tarefa concluída é a maioria das linhas com o tempo, e nunca é perguntada
-- por este indicador. `where status = 'pending'` mantém o índice do tamanho do
-- trabalho em aberto, não do histórico.
--
-- A ORDEM DAS COLUNAS
-- `(organization_id, assigned_to, due_at)` — os dois primeiros são igualdade e
-- o terceiro é intervalo. Inverter para deixar `due_at` no meio quebraria o
-- uso do prefixo. Esta ordem também serve "vence hoje" e "vence esta semana",
-- que é o formato que a tela de tarefas vai querer quando alguém finalmente
-- usar tarefas — hoje a base inteira tem UMA, e ela está concluída.
--
-- O QUE ESTA MIGRATION DELIBERADAMENTE NÃO FAZ
-- Não cria tabela `notifications`, não cria trigger e não publica nada novo no
-- Realtime. Os três indicadores da entrega são DERIVADOS do dado existente;
-- não há evento persistido, e por isso não há estado de "lida" para divergir
-- do real nem expurgo para escrever. A tabela de notificações passa a valer
-- quando entrar o e-mail — aí a linha vira o outbox que sobrevive ao provedor
-- cair. Antes disso, ela custaria ~27 mil linhas por dia depois do Bubble para
-- reexibir o que os três badges já mostram.
--
-- ADITIVO E IDEMPOTENTE: cria um índice, `if not exists`, e não toca em dado,
-- policy, função ou publicação. É o mesmo cuidado da `0022`, pelo mesmo
-- motivo — o ledger remoto de migrations ainda diverge do repositório
-- (débito 8) e o CLI segue linkado à produção.
--
-- Sem `concurrently`: a Supabase aplica migration dentro de uma transação e
-- `create index concurrently` não roda em transação. Em `tasks` deste porte o
-- lock é de instantes.
-- ============================================================

create index if not exists tasks_responsavel_pendentes_idx
  on public.tasks (organization_id, assigned_to, due_at)
  where status = 'pending';

comment on index public.tasks_responsavel_pendentes_idx is
  'Indicador de atenção: tarefas vencidas do responsável. Parcial em '
  'status = ''pending'' porque tarefa concluída nunca é perguntada aqui.';
