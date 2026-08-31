-- ============================================================
-- Wavemov CRM — 0021: publicar as tabelas do atendimento no Realtime
--
-- O QUE ESTAVA QUEBRADO
-- `components/whatsapp/whatsapp-client.tsx` assina, desde sempre, um canal
-- `postgres_changes` de INSERT em `whatsapp_messages` para desenhar a mensagem
-- nova na conversa aberta. Esse canal nunca entregou um evento: em produção a
-- publicação `supabase_realtime` existe e está VAZIA — nenhuma tabela — e o
-- Realtime só enxerga o que a publicação carrega. A assinatura conectava, o
-- `subscribe()` respondia, e nada chegava.
--
-- O efeito no atendimento é o pior tipo de defeito silencioso: a mensagem
-- entra no banco, a tela não mexe, e o atendente conclui que "o WhatsApp não
-- sincroniza". Só recarregar a página mostrava a conversa de verdade.
--
-- POR QUE AS DUAS TABELAS
-- `whatsapp_messages` resolve a conversa ABERTA — a thread cresce sozinha.
-- `whatsapp_conversations` resolve a lista lateral: mensagem que chega numa
-- conversa fechada altera `last_message`, `last_message_at` e `unread_count`,
-- e sem publicar a tabela o atendente não vê o não lido aparecer. As duas
-- juntas são o que a palavra "sincronizado" significa nesta tela.
--
-- INSERT e UPDATE, não DELETE: nenhuma das duas telas reage a exclusão, e
-- publicar a mais é dar trabalho ao WAL por evento que ninguém escuta.
--
-- REPLICA IDENTITY fica no padrão (chave primária) DE PROPÓSITO. O payload de
-- INSERT/UPDATE já traz a linha nova inteira, que é a única que o cliente usa;
-- `full` só acrescentaria a linha ANTIGA em cada update, e `whatsapp_messages`
-- guarda `raw_payload` — o WAL dobraria de tamanho para carregar um dado que
-- nenhum componente lê.
--
-- O RLS CONTINUA VALENDO. O Realtime do Supabase avalia as policies da 0011
-- por assinante antes de entregar o evento (`realtime.apply_rls`): quem não
-- pode dar `select` na linha não recebe a notificação dela. Publicar a tabela
-- não abre nada — o isolamento por organização e a visibilidade por
-- responsável seguem sendo os mesmos, decididos pelas mesmas policies.
--
-- IDEMPOTENTE: cada bloco confere o catálogo antes de escrever. Rodar duas
-- vezes não levanta erro nem duplica a filiação (`alter publication ... add
-- table` numa tabela já publicada é erro, e é justamente o que a guarda evita).
--
-- SE O PAINEL RECUSAR com "must be owner of publication supabase_realtime":
-- o mesmo efeito está no Dashboard, em Database → Replication, marcando as
-- duas tabelas em `supabase_realtime`. O resultado no catálogo é idêntico;
-- este arquivo existe para que a mudança fique versionada com o repositório.
-- ============================================================

-- A publicação existe em todo projeto Supabase, mas não em bancos crus (o
-- PGlite do `npm run test:db`, por exemplo). Criar quando falta é o que
-- permite provar esta migration fora do Supabase.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime with (publish = 'insert, update');
  end if;
end
$$;

do $$
declare
  tabela text;
begin
  -- `for all tables` publica tudo por definição: acrescentar tabela ali é
  -- erro, e não haveria o que acrescentar.
  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach tabela in array array['whatsapp_messages', 'whatsapp_conversations']
  loop
    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = tabela
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tabela);
    end if;
  end loop;
end
$$;
