-- ============================================================
-- Wavemov CRM — 0018: auditoria da distribuição que sobrevive e explica
--
-- Duas correções vindas da auditoria de QA da Frente C.
--
-- 1. APAGAR UM LEAD APAGAVA A PROVA DE PARA QUEM ELE FOI
-- `lead_distribution_log.deal_id` nasceu `on delete cascade`, enquanto o
-- comentário do próprio bloco na 0016 declarava que as FKs eram
-- `on delete set null` "justamente para que apagar a regra não apague a
-- história dela". A intenção estava escrita; o SQL fazia o contrário.
--
-- A tabela existe para responder "por que este lead foi para o João?" — e é
-- numa disputa interna, quando alguém apagou a negociação, que a pergunta
-- aparece. Cascade transformava a auditoria em algo que some exatamente
-- quando é necessária.
--
-- 2. CONTENÇÃO ERA DIAGNOSTICADA COMO "SEM PARTICIPANTES"
-- O motor tenta o compare-and-swap do cursor um número limitado de vezes.
-- Esgotando as tentativas, o lead entrava sem responsável e a auditoria
-- registrava `no_candidates` — "a regra casou, mas não havia ninguém no
-- rodízio". Com a equipe inteira de plantão, essa frase é falsa e manda o
-- administrador procurar no lugar errado. O motivo `contention` separa "não
-- havia ninguém" de "havia gente, mas a disputa pela vez não resolveu".
--
-- Idempotente: pode ser executada duas vezes sem efeito colateral.
-- ============================================================

-- ------------------------------------------------------------
-- 1. A auditoria sobrevive à exclusão do lead
--
-- `set null` mantém a linha com todos os snapshots — nome da regra, nome de
-- quem recebeu, candidatos e posição servida. Perde-se só o ponteiro para uma
-- negociação que não existe mais, que é precisamente o que deve se perder.
-- ------------------------------------------------------------
alter table public.lead_distribution_log
  drop constraint if exists lead_distribution_log_deal_id_fkey;

alter table public.lead_distribution_log
  add constraint lead_distribution_log_deal_id_fkey
  foreign key (deal_id) references public.deals (id) on delete set null;

comment on column public.lead_distribution_log.deal_id is
  'Negociação que recebeu o lead. `on delete set null` (0018): apagar a negociação não pode apagar a prova de para quem ela foi distribuída — é justamente na disputa sobre um lead apagado que a auditoria é consultada.';

-- ------------------------------------------------------------
-- 2. Motivo próprio para contenção
--
-- A ordem importa: o `check` novo precisa entrar depois de a coluna aceitar o
-- valor. Aqui não há dado a migrar (nenhuma linha usa `contention` ainda),
-- mas a ordem "derruba, migra, instala" fica explícita porque foi ela que
-- quebrou na 0017 — e o próximo a mexer neste arquivo merece o aviso.
-- ------------------------------------------------------------
alter table public.lead_distribution_log
  drop constraint if exists lead_distribution_log_reason_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'lead_distribution_log_reason_check'
       and conrelid = 'public.lead_distribution_log'::regclass
  ) then
    alter table public.lead_distribution_log
      add constraint lead_distribution_log_reason_check
      check (reason in (
        'rule_matched',      -- distribuído por uma regra
        'form_default',      -- responsável padrão do formulário venceu
        'no_rule',           -- nenhuma regra casou
        'no_candidates',     -- regra casou, mas ninguém elegível/de plantão
        'contention'         -- havia gente, mas a disputa pela vez não resolveu
      ));
  end if;
end;
$$;

comment on column public.lead_distribution_log.reason is
  'Por que o lead terminou com (ou sem) responsável. `no_candidates` é fila vazia ou todo mundo fora do plantão; `contention` é disputa simultânea que esgotou as tentativas — separados porque levam o administrador a lugares diferentes.';

-- ------------------------------------------------------------
-- 3. Reparo: posições duplicadas dentro de uma regra
--
-- A tela de distribuição adicionava participante sem calcular a posição, e a
-- coluna é `not null default 0` (0017). Todo mundo adicionado por ali ficou em
-- 0 — e com posições empatadas a fila DEGENERA: o cursor guarda uma posição,
-- duas pessoas na mesma posição são indistinguíveis para ele, `find(p =>
-- p.position > 0)` não acha ninguém e a MESMA pessoa passa a receber todos os
-- leads daquela regra. A auditoria registrava `rule_matched` com todos os
-- candidatos, então nada denunciava.
--
-- A causa foi corrigida no código (a action calcula `max(position)+1`). Este
-- bloco conserta o que já está gravado: renumera de 0 em diante APENAS as
-- regras que hoje têm posição repetida, preservando a ordem relativa atual
-- para não embaralhar filas que o administrador já tinha ajustado.
--
-- Idempotente: depois de rodar, nenhuma regra tem duplicata e o `where` não
-- seleciona mais nada.
-- ------------------------------------------------------------
-- UMA instrução só, de propósito.
--
-- A primeira versão renumerava num comando e reiniciava o cursor no seguinte —
-- e o segundo procurava duplicatas que o primeiro tinha acabado de eliminar,
-- então nunca encontrava nada e o cursor ficava apontando para um número que
-- agora é de outra pessoa. Num único `with`, `com_duplicata` é avaliada sobre
-- o estado do INÍCIO da instrução e serve aos dois updates. CTEs que escrevem
-- executam sempre, mesmo sem serem referenciadas pela consulta principal.
with com_duplicata as (
  select rule_id
    from public.lead_distribution_participants
   group by rule_id, position
  having count(*) > 1
),
renumerados as (
  select p.id,
         row_number() over (
           partition by p.rule_id
           order by p.position, p.created_at, p.profile_id
         ) - 1 as nova_posicao
    from public.lead_distribution_participants p
   where p.rule_id in (select rule_id from com_duplicata)
),
aplicado as (
  update public.lead_distribution_participants p
     set position = r.nova_posicao
    from renumerados r
   where r.id = p.id
     and p.position <> r.nova_posicao
  returning p.rule_id
)
-- O cursor das regras reparadas perdeu o significado junto com a renumeração:
-- reiniciar é honesto; deixá-lo apontando para um número que agora é de outra
-- pessoa não é.
update public.lead_distribution_rules
   set queue_position = -1, queue_uses = 0
 where id in (select rule_id from com_duplicata);

-- PostgREST precisa reler o schema
notify pgrst, 'reload schema';
