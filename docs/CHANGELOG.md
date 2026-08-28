# Changelog — Wavemov CRM

Ordem cronológica inversa. Datas absolutas (AAAA-MM-DD).

## 2026-08-27 — correções da auditoria de QA da Frente C

Auditoria do `qa-engineer` sobre `20a9319..38c1315`. **Sem achado de isolamento
multiempresa.** Dois bloqueadores e três Altos, todos corrigidos. Migration
`0018` **aplicada pelo cliente** em 2026-08-27 — com ela, as posições
duplicadas que a tela havia gravado foram reparadas e o cursor das regras
afetadas reiniciado.

### Corrigido — bloqueadores

- **A tela de distribuição não lia `position`.** O embed em
  `app/(dashboard)/distribuicao/page.tsx` não pedia a coluna, e o
  `as unknown as` fazia o `tsc` aceitar. No cliente `position` chegava
  `undefined`, o `sort` virava no-op (`NaN` é tratado como 0) e a ordem exibida
  passava a ser a do PostgREST — não a configurada. Pior: um clique em ↑
  regravava essa ordem arbitrária **por cima da real**, e a tela dizia "Ordem
  da fila atualizada". Corrigido com `position` no select e `order` no recurso
  embutido.
- **Participante adicionado pela tela nascia em `position = 0`.** O
  `max(position)+1` só existia no trigger de entrada na organização. Com todo
  mundo empatado em 0 a fila vira **ponto fixo**: `find(p => p.position > 0)`
  não acha ninguém, cai no `?? fila[0]`, e a MESMA pessoa recebe todos os leads
  daquela regra para sempre — com `rule_matched` e todos os candidatos na
  auditoria, então nada denunciava. A action passou a calcular a posição,
  preservando a existente no conflito.

### Corrigido — altos

- **Contenção virava "Sem participantes".** Esgotadas as tentativas do
  compare-and-swap, o lead entrava órfão e a auditoria dizia "não havia ninguém
  no rodízio" — falso com a equipe inteira de plantão, e mandando o
  administrador procurar no lugar errado. Agora tem motivo próprio
  (`contention`, migration `0018`), leva os candidatos junto como prova de que
  havia gente, e o laço ganhou **espera crescente com jitter** — sem ela os
  perdedores de uma rajada recomeçavam no mesmo instante e colidiam de novo.
- **`/relatorios/vendedores` truncava em 1000 linhas.** As agregações são
  feitas em memória e o PostgREST corta em `max_rows`; sem `order`, nem era a
  amostra mais recente. Justamente o relatório usado para conferir se o rodízio
  é justo. Passou a paginar com `range` e a **avisar na tela** quando estoura o
  teto.
- **A deduplicação engolia lead legítimo.** Casava por funil: dois formulários
  distintos apontando para o mesmo funil faziam a segunda submissão virar linha
  de histórico dentro de um card já em Follow-up com outro responsável. Passou
  a casar pelo **mesmo formulário** — interesse em outro produto é lead novo. E
  `deduplicated` ganhou consumidor: a resposta da ingestão agora distingue
  "criou lead" de "anexou a um lead aberto".

### Corrigido — médios e menores

- **Reordenar a fila reinicia o cursor.** Ele guarda uma posição, e a
  renumeração deu outro significado a cada número: sem reiniciar, quem acabou
  de receber recebia de novo.
- **`assignments_count` entrou na condição do compare-and-swap.** Era
  read-modify-write desprotegido, e no caso do responsável fixo (um
  participante, peso 1) o cursor nunca recusa ninguém — duas requisições liam o
  mesmo total e gravavam o mesmo número.
- Campo de peso passou a recarregar na falha (era não controlado e mantinha o
  valor recusado na tela); selo de plantão virou `role="switch"` com
  `aria-checked`, `aria-label` nominativo, foco visível e alvo de 36 px;
  `/distribuicao` entrou na **navegação**; o webhook do WhatsApp passou a
  gravar `lead_assigned` no histórico como as outras origens; a coluna de ações
  da auditoria ganhou rótulo para leitor de tela.

### Migration `0018`

- `lead_distribution_log.deal_id` passou de `on delete cascade` para
  **`on delete set null`**: apagar a negociação apagava a prova de para quem ela
  tinha sido distribuída — exatamente a pergunta que a tabela existe para
  responder numa disputa. O comentário da `0016` já dizia `set null`; o SQL
  fazia o contrário.
- Motivo `contention` no `check` de `reason`.
- **Reparo das posições duplicadas** já gravadas pela tela, com reinício do
  cursor das regras afetadas, numa única instrução — a primeira versão
  renumerava num comando e reiniciava no seguinte, que já não achava as
  duplicatas recém-eliminadas.

### Sobre posições duplicadas no domínio

`pickNext` **não** tenta se defender delas, e há um teste documentando isso: o
cursor guarda uma posição, duas pessoas na mesma posição são indistinguíveis
para ele, e renumerar dentro do domínio quebraria a propriedade que sustenta o
plantão — as posições precisam ser estáveis para que tirar alguém não desloque
os outros. Duplicata é **estado inválido**: impedido na action e reparado pela
`0018`.

### Validação

`npm run test:db` **145 asserções** (eram 138), 7 novas no bloco 18.
`npm run test:unit` **65 testes**. `tsc` limpo, `build` sem erro,
`git diff --check` OK.

## 2026-08-27 — motor da fila ordenada e plantão na tela

Migration `0017` **aplicada pelo cliente**. O motor e a interface passaram a
usar a fila; o plantão agora vale de verdade.

### Alterado — motor

- `domain/rotation.ts` deu lugar a `domain/queue.ts`. Saiu a sequência derivada
  (participantes por UUID, expandidos pelo peso, escolhidos por `ticket % n`);
  entrou `pickNext(fila, cursor)`: é a vez de quem está na posição do cursor
  enquanto o peso dela não se esgota; depois avança para a **próxima posição
  elegível**, dando a volta no fim.
- **O plantão é filtrado na infraestrutura, não no domínio.** `pickNext` recebe
  a fila já filtrada, e é exatamente por isso que o ausente é pulado sem que a
  posição de ninguém mude. Se o domínio precisasse conhecer plantão, precisaria
  conhecer também papel, vínculo e organização.
- **Se a pessoa da vez sai no meio do peso, a vez passa adiante.** O lead não
  pode ficar preso esperando quem não está trabalhando.
- O compare-and-swap agora é sobre `queue_position`/`queue_uses`, e a **fila é
  relida a cada tentativa**: se outra requisição avançou no meio, a vez passou
  a ser de outra pessoa, e insistir na escolha antiga entregaria dois leads
  seguidos para a mesma.
- `ticket` na auditoria passou a guardar a **posição servida** — é o que
  permite reconstruir a escolha junto com o snapshot dos candidatos.

### Alterado — telas

- `/distribuicao`: a fila virou lista numerada, com **↑/↓ para reordenar**
  (regravando a ordem inteira renumerada, não trocando duas linhas) e um selo
  de **plantão** clicável por pessoa. Quem está fora continua na lista, na
  posição dele, esmaecido — é o que o recurso promete. O card diz **para quem
  vai o próximo lead**, pela mesma regra do motor. Peso virou "Seguidos".
- Aviso novo quando **todos** os participantes de uma regra estão fora do
  plantão: os leads dela entram sem responsável até alguém voltar.
- `/relatorios/vendedores`: a coluna "Peso" virou "Fila", distinguindo **"Fora
  da fila"** (configuração) de **"Sem plantão"** (o dia de hoje) — duas
  explicações diferentes para "fulano não está recebendo nada". O KPI "No
  rodízio" virou "De plantão", contando só quem pode receber agora.

### Corrigido

- **A `0017` não era idempotente.** O backfill de posições condicionava por
  linha (`and p.position = 0`): numa reexecução, a única linha ainda em 0 podia
  receber o `row_number` de outra ordenação e **colidir** com uma posição já
  ocupada. Passou a numerar apenas regras nunca numeradas (todas as posições em
  0). O efeito na primeira execução é idêntico, então **nada muda para quem já
  aplicou** — o teste do bloco 17 é que passou a exercitar a reexecução.

### Validação

`npm run test:unit` **63 testes**: 13 novos no domínio da fila, incluindo
ausente pulado sem deslocar ninguém, retomada da posição ao voltar, vez que
passa adiante quando a pessoa sai no meio do peso, cursor persistido entre
leads e peso reduzido abaixo do já consumido. `npm run test:db` **138
asserções**. `tsc` limpo, `build` sem erro.

## 2026-08-27 — fila ordenada e plantão (`0017`)

Migration escrita e validada. **PENDENTE de aplicação.** O motor ainda usa o
algoritmo da `0016` — ver o aviso no fim desta entrada.

> **Corrigido após falhar na primeira execução do cliente** (`ERROR: 23514 …
> lead_distribution_rules_method_check`): a migration atualizava `method` para
> `ordered_queue` **antes** de derrubar o `check` antigo, que só aceitava
> `weighted_round_robin`. O `test:db` não pegou porque as migrations rodam
> contra um banco **vazio** — sem regra nenhuma, o `update` não atinge linha e
> passa. Só quebra em base com dado, que é a única que importa. Ordem
> corrigida (derruba, migra, instala) e o bloco 17 do teste passou a
> reconstruir uma base com regras no método antigo e reexecutar a migration
> inteira por cima.

### Por que a mudança

A `0016` escolhia o responsável por uma sequência **derivada**: participantes
ordenados por `profile_id` (um UUID), expandidos pelo peso, e um contador que
dava a volta por resto da divisão. Dois defeitos de produto:

1. **A ordem era um UUID.** O administrador não escolhia quem vinha primeiro, e
   não havia como explicar a ordem para a equipe.
2. **Tirar alguém do rodízio remapeava todo o resto.** Com `ticket % n`, a
   largura da sequência muda quando um participante sai, e o próximo lead cai
   em alguém arbitrário — a continuidade se perdia exatamente no dia em que
   alguém faltava.

### Adicionado — migration `0017`

- **`organization_members.on_duty`** — plantão por PESSOA, valendo para todas
  as regras. Mora aqui porque a tabela já tem, desde a `0003`, exatamente as
  policies pedidas: `select` para qualquer membro, `update` só para
  `org_admin`. O controle "só o administrador liga e desliga" saiu sem policy
  nova. `default true`: a migration não pode parar quem já distribuía.
- **`lead_distribution_participants.position`** — ordem manual da fila, com
  backfill pela ordem que a `0016` produzia na prática (`created_at`), para
  ninguém perceber mudança de comportamento no dia da aplicação.
- **`lead_distribution_rules.queue_position` + `queue_uses`** — o cursor.
  Guarda a **posição** do último servido, não o `profile_id`: é o que dá
  continuidade quando alguém entra ou sai, em vez de perder a referência junto
  com a pessoa. `-1` = ninguém servido ainda.
- **`method` passou a aceitar apenas `ordered_queue`.** Deixar o método antigo
  aceito criaria uma regra que o motor não sabe servir, e a falha apareceria
  como lead sem responsável — silenciosa, do jeito que este projeto já pagou
  caro para evitar.
- Quem entra na equipe entra no **fim** da fila. Sem isso, o membro novo caía
  em `position = 0` e receberia o próximo lead na frente de todo mundo.

### Peso mudou de significado

Antes multiplicava a frequência numa sequência intercalada. Agora é **quantos
leads consecutivos** a pessoa recebe antes de a fila avançar — que é o que faz
sentido numa fila.

### Validação

`npm run test:db` **137 asserções** (eram 118), 15 novas no bloco 16 e 4 no
bloco 17 (migração sobre base com dados). Bloco 16: cursor
inicial, posições distintas, plantão nascendo ligado, **quem sai do plantão é
pulado sem as posições dos outros mudarem**, retomada da posição ao voltar,
`seller` que não desliga o próprio plantão mas lê, compare-and-swap do cursor,
persistência entre leads, método antigo recusado, entrada no fim da fila e
isolamento entre organizações.

> **Estado interino, entre aplicar a `0017` e o motor novo:** nada quebra — o
> código publicado continua distribuindo pelo algoritmo da `0016`, que só usa
> colunas que continuam existindo. Mas **o plantão ainda não é respeitado**:
> desligar alguém não o tira da fila até o motor novo subir. Não confie nele
> nesse intervalo.

## 2026-08-27 — Frente C: configuração da distribuição e rendimento por vendedor

Fecha a Frente C. **Sem migration** — usa o schema da `0016`.

### Adicionado

- **`/distribuicao`** (só `org_admin`): regras por prioridade com condições de
  origem e formulário, participantes com peso, e o **histórico de
  distribuição** com filtro "só os sem responsável". Cada regra mostra a
  **ordem de entrega da volta**, que é a mesma sequência que o motor monta.
- **`/relatorios/vendedores`**: leads distribuídos, sem responsável, no
  rodízio e conversão da equipe; tabela por pessoa com peso, recebidos (com
  barra comparativa), em aberto, ganhos, perdidos, conversão, valor ganho,
  tarefas pendentes/vencidas e notas do período. Ligado a partir de
  `/relatorios` e de `/distribuicao`.

### Decisões

- **Peso ao lado dos recebidos**, não no fim da linha: a leitura pretendida é
  comparar os dois. Peso igual com recebimento muito diferente é o sinal de que
  a configuração não faz o que o administrador acha que faz.
- **Conversão sobre o que fechou**, não sobre o total recebido — lead em aberto
  não é fracasso, e dividir por ele puniria quem acabou de receber.
- **A regra padrão não é excluível pela tela.** Sem ela, todo lead que não casa
  com uma regra específica volta a nascer órfão. Para parar de distribuir,
  desativa-se.
- **`viewer` não aparece como participante**: a `0016` recusa no banco, e botão
  que o banco vai recusar não deve existir na tela.
- **Regra sem participante avisa em amarelo** que os leads dela entrarão sem
  responsável, citando o `no_candidates` que vai aparecer na auditoria.
- As actions de configuração usam o cliente da **sessão**, não `service_role`:
  as policies da `0016` já exigem `is_org_admin`, então quem decide é o banco.

### Validação

`npx tsc --noEmit` limpo; `npm run build` com `/distribuicao` (6,37 kB) e
`/relatorios/vendedores` (1,38 kB); `test:db` 118; `test:unit` 59. Smoke local:
as duas rotas novas respondem 307 para quem não tem sessão.

## 2026-08-27 — Frente C: motor de distribuição e deduplicação

Migration `0016` **aplicada pelo cliente** em 2026-08-27. A distribuição passa
a valer imediatamente, usando a regra padrão que a migration criou com todos os
membros elegíveis no rodízio, peso 1. A tela de configuração vem em seguida.

### Corrigido

- **Lead deixa de nascer órfão nos três caminhos de entrada.** Antes,
  `register-form-lead.ts` gravava o `default_responsible_id` do formulário —
  opcional, normalmente vazio — e o webhook da UAZAPI nem passava o campo. Pela
  policy da `0011`, esse lead era invisível para todo `seller` e `agent`, e o
  trigger da mesma migration copiava o nulo para
  `whatsapp_conversations.assigned_to`, de modo que a conversa sumia junto.
- **A ingestão parou de abrir um card por submissão.** Quem preenchia o
  Typeform e depois clicava no anúncio do Meta virava dois leads — e, com
  rodízio, dois vendedores ligando para o mesmo telefone. Agora a submissão
  entra na negociação ABERTA que o contato já tem no mesmo funil, com uma linha
  no histórico. Ganha, perdida e arquivada não bloqueiam card novo: recompra e
  nova cotação são leads legítimos. É a mesma regra que o webhook já aplicava.

### Adicionado

- `lib/features/lead-distribution/` — domínio (rodízio ponderado e seleção de
  regra), caso de uso e infraestrutura. Um ponto de decisão para as três
  entradas.
- **Auditoria em toda decisão**, inclusive quando NÃO houve distribuição
  (`no_rule`, `no_candidates`) — são esses os casos que levam alguém a corrigir
  a configuração.
- Linha `lead_assigned` no histórico do lead: sem ela, o vendedor vê um lead
  aparecer na fila sem explicação.

### Decisões

- **A sequência do rodízio é intercalada, não em blocos.** Expandir por peso em
  bloco (`A,A,A,B`) dá a proporção certa e entrega três leads seguidos à mesma
  pessoa, concentrando a fila. Em passadas (`A,B,A,A`) a proporção é idêntica e
  o intervalo entre leads da mesma pessoa é o maior possível.
- **A regra padrão é sempre a última**, independentemente da prioridade que
  tenha. Se concorresse por prioridade, salvá-la com prioridade 1 engoliria
  todas as regras específicas.
- **`default_responsible_id` do formulário vence o rodízio**: é escolha
  explícita de quem configurou.
- **O bilhete usa compare-and-swap, não `set x = x + 1`.** O PostgREST não
  expressa incremento; "ler, somar, gravar" seria a corrida que o contador
  existe para evitar. A condição `.eq("assignments_count", lido)` faz quem
  chegar segundo não atingir linha e tentar de novo. Uma RPC resolveria em uma
  viagem, mas exigiria migration nova — a `0016` já está aplicada.
- **Sem regra ou sem candidatos, o lead ENTRA assim mesmo**, sem responsável e
  com log. Recusá-lo perderia o lead, que é pior que um lead órfão visível ao
  administrador.

### Validação

`npm run test:unit` **59 testes** (eram 42): rodízio determinístico e
proporcional, sequência intercalada, bilhete que dá a volta, um participante
como responsável fixo, e as oito regras de ordem de avaliação. `tsc` limpo,
`build` sem erro, `test:db` 118.

## 2026-08-27 — Frente C: schema da distribuição automática (`0016`)

Migration escrita e validada. **PENDENTE de aplicação pelo cliente** — nenhum
código depende dela ainda. O motor e a tela de configuração vêm na sequência.

### Problema

Lead que entra sem responsável é **invisível** para quem deveria atendê-lo: a
policy da `0011` devolve a negociação para `org_admin`/`viewer`/admin global ou
para quem é o `responsible_id`, mais ninguém. E o lead nasce órfão em dois dos
três caminhos de entrada — `register-form-lead.ts` grava o
`default_responsible_id` do formulário, que é opcional, e o webhook da UAZAPI
nem passa o campo. Quando esse lead responde no WhatsApp, o trigger da `0011`
copia o nulo para `assigned_to` e a conversa também some da lista do vendedor.

### Adicionado — migration `0016`

- **`lead_distribution_rules`** — regras por organização, avaliadas por
  prioridade crescente; a regra `is_fallback` (uma por empresa, índice único
  parcial) é sempre a última e não aceita condições. Condições configuráveis:
  **origem** (`public_form`/`external_ingest`/`whatsapp`) e **formulário**,
  combinadas com E. `assignments_count` é o bilhete do rodízio, incrementado
  atomicamente — duas ingestões simultâneas recebem números diferentes e não
  caem no mesmo vendedor.
- **`lead_distribution_participants`** — quem entra no rodízio e com que peso
  (1..100). Trigger recusa quem não é membro ativo da organização da regra e
  quem é `viewer` (somente leitura não trabalha lead).
- **`lead_distribution_log`** — auditoria, com **snapshots** de `rule_name`,
  `assigned_to_name` e `candidates`: renomear ou apagar uma regra não reescreve
  a história. `reason` cobre também os casos sem distribuição (`no_rule`,
  `no_candidates`), que são os que o administrador precisa ver para corrigir a
  configuração.
- **Guarda entre organizações**: a condição `form_id` de uma regra tem de
  apontar para formulário da mesma empresa.
- **Empresa e membro novos**: `provision_organization_defaults` passou a criar
  a regra padrão e inscrever quem já é membro (o `org_admin` é inserido
  **antes** do provisionamento em `create_organization_for_current_user`, então
  só o trigger não bastaria); um trigger em `organization_members` inscreve
  quem entra depois. Só no INSERT — no UPDATE, quem o admin tirou do rodízio
  voltaria sozinho.

### Decisões

- **"Filtro por empresa" é isolamento, não condição**: cada organização tem as
  próprias regras. As condições são origem e formulário.
- **Não existe método "responsável fixo"**: uma regra com um participante já é
  isso. A coluna `method` existe com um único valor implementado, para que
  acrescentar outro seja `check` novo + ramo no motor, não reescrita.

### Validação

`npm run test:db` — **118 asserções** (eram 91), 27 novas no bloco 15: todas as
invariantes acima, o bilhete atômico e sequencial, papéis (`seller` lê a regra
mas não edita, não altera o próprio peso, não lê nem reescreve a auditoria — no
log o privilégio é revogado, mais forte que RLS) e isolamento A/B.

## 2026-08-27 — correções da auditoria de QA da Frente B

Auditoria do `qa-engineer` sobre tudo entre `ea30a2d` e `4c68408`. **Sem
achado de isolamento multiempresa** — o núcleo da Frente B está correto. Os
três Altos abaixo eram do recurso de edição das Informações do Lead, todos
reproduzidos contra o código real antes da correção. **Sem migration.**

### Corrigido

- **[Alto] O card do atendimento não refletia a edição salva, e a edição
  seguinte desfazia a anterior.** Ali as informações vivem em estado de
  cliente, não em prop de Server Component: `revalidatePath` não alcançava
  nada. A tela dizia "atualizado" mostrando o valor antigo, e o lápis semeava
  a caixa a partir dele — o Salvar seguinte revertia a edição, com registro no
  histórico dizendo que o valor voltou. `updateLeadInfoAction` passou a
  devolver o `metadata` gravado, propagado por `onSaved`.
- **[Alto] Editar até sobrar uma linha destruía o bloco.** O valor deixava de
  ter "mais de uma linha", virava extra rotulado — com `R lista` de volta na
  tela — e a caixa reabria **vazia**, de modo que o Salvar seguinte apagava o
  que restava. O bloco passou a ter identidade além de forma: a chave do CRM é
  bloco independentemente da contagem de linhas.
- **[Alto] `metadata` com dois valores multilinha duplicava a cada Salvar.** O
  texto editado ia só para a primeira chave e a segunda ficava intacta, então
  seu conteúdo voltava a ser somado na leitura seguinte, de forma cumulativa, e
  o histórico registrava alterações que ninguém fez. A edição passou a
  consolidar: apaga todas as chaves de bloco e grava numa só.
- **[Médio] Um `null` no payload derrubava o lead inteiro com 400 permanente.**
  Origens reais mandam `null` em campo opcional não preenchido e o Meta manda
  estruturas aninhadas; o n8n reentregava, tomava 400 de novo, e o lead se
  perdia. `data` e `metadata` passaram por um schema tolerante que descarta o
  que não é texto **antes** da validação — a decisão já estava escrita em
  `form-payload.ts`, era a validação que não a respeitava.
- **[Médio] `metadata` da ingestão sem teto de tamanho.** Um fluxo mal mapeado
  gravaria o payload bruto inteiro, que depois trafega para o navegador. Corte
  por valor (8.000) e por número de chaves (60), truncando em vez de recusar.
- **[Médio] A tela dizia "apenas letras minúsculas"** desde a `0015`, que passou
  a aceitar maiúsculas. O operador "traduzia" o id do Typeform e o n8n recebia
  404. Os três textos foram alinhados, avisando que a caixa precisa ser idêntica
  à da origem.
- **[Baixo]** Alvo de toque do lápis de 28 px → 36 px; `role="alert"` e
  `try/catch` no `navigator.clipboard` do painel de integração (rejeita em
  contexto não seguro e o clique não dava retorno nenhum).

### Validação

- `npm run test:unit` **42 testes** (eram 30). Dois arquivos novos:
  `lead-answers-edit.test.mts` (os três Altos, cada teste falha na versão
  anterior) e `ingest-schema.test.mts` (tolerância a `null` e aninhamento).
- `npx tsc --noEmit` limpo; `npm run build` sem erro; `npm run test:db` 91.

## 2026-08-27 — quebras de linha escapadas do n8n

**Sem migration.** Corrige a causa real de "as respostas do lead aparecem num
bloco só, rotuladas com o nome da chave".

### Corrigido

- **O n8n grava o bloco com `
` escapado** — barra invertida seguida de `n`,
  dois caracteres — e não com quebra de linha de verdade. Conferido no dado de
  produção: `r_lista` chegou com **464 caracteres numa única linha**. Como o
  parser separava por quebra real, o bloco nunca tinha mais de uma linha, não
  era reconhecido como respostas e ia para o card secundário desenhado como
  `R lista: <texto gigante>` — com o card principal vazio. `parseLeadInfo`
  passou a desfazer `
`, `

` e `
` escapados antes de qualquer decisão.
- **O nome da chave da origem não pode mais virar rótulo, por regra e não por
  heurística**: todo valor de várias linhas é bloco de respostas. Antes a
  classificação dependia do conteúdo, então qualquer dado fora do previsto
  reabria o mesmo defeito. Valor de uma linha só continua sendo par rotulado —
  é o caso da UTM, onde o rótulo ajuda.

### Validação

- O parser corrigido foi executado **contra as linhas reais gravadas em
  produção**: 10 respostas no card principal, `Utm` no card secundário, chave
  de edição `r_lista` reconhecida. Antes: 0 respostas e um extra rotulado.
- `npm run test:unit` **30 testes** (eram 22). O arquivo
  `escaped-newlines.test.mts` reproduz o payload exatamente como o n8n o envia,
  usando `String.raw` para que a barra invertida sobreviva ao código-fonte.
- `npx tsc --noEmit` limpo; `npm run build` sem erro; `npm run test:db` 91.

## 2026-08-27 — Informações do Lead editáveis e últimas mensagens no atendimento

Ajustes vindos do primeiro lead real recebido pelo Typeform. **Sem migration.**

### Corrigido

- **O atendimento mostrava as mensagens mais ANTIGAS da conversa.**
  `loadMessages` usava `.order("created_at", asc).limit(500)`, e o `limit` do
  Postgres corta depois de ordenar: passando de 500 mensagens, o atendente abria
  a conversa e lia o começo dela, sem nunca ver o que acabou de chegar. Agora a
  consulta ordena da mais nova para a mais velha e inverte para exibir — são as
  últimas. O contêiner da thread já rolava sozinho.
- **O bloco de respostas caía para os "extras" com o nome cru da chave.** O
  parser exigia `": "` (com espaço) em TODAS as linhas; uma resposta escrita em
  duas linhas, ou um `"?:"` sem espaço, derrubava o bloco inteiro e a tela
  passava a mostrar `r-lista` como se fosse informação do lead. Agora vale a
  maioria das linhas e o separador é `":"`.

### Alterado

- **Informações do Lead** foi para o topo da coluna direita de
  `/negociacoes/[id]`, ao lado de Negócio, conforme a referência do cliente. O
  bloco é desenhado como o lead respondeu — uma linha por pergunta — em vez de
  rótulo acima e valor abaixo, que dobrava a altura do card.
- **UTM e formulário de origem saíram para um card separado**, abaixo do
  principal: são dados de campanha, não respostas, e competiam com o que o
  atendente precisa ler.
- **O id da resposta deixou de aparecer.** `typeform_response_id` é um token
  opaco de outro sistema; a referência visual agora é o id do **formulário**
  (`forms.external_id`), que é o valor que o operador colou no n8n. `ID_form` do
  payload também sai, para não repetir a mesma linha.

### Adicionado

- **Edição das Informações do Lead** pelo lápis no cabeçalho do card, no
  detalhe do lead e no atendimento. `viewer` não vê o lápis, e a server action
  recusa por conta própria.
- **Toda edição vira uma entrada no histórico do lead** (`lead_info_updated`)
  com o que mudou, campo a campo (`Plano: UNIMED → AMIL`). Reordenar linhas não
  conta como alteração; inclusões e remoções são nomeadas.

### Validação

- `npx tsc --noEmit` limpo; `npm run build` sem erro; `npm run test:db` 91
  asserções; `npm run test:unit` **22 testes** (eram 15), cobrindo o parser mais
  tolerante, a ida e volta do texto editável e as quatro regras do diff.

## 2026-08-27 — cobertura do middleware

Fecha a lacuna que permitiu o defeito dos formulários públicos: a política de
caminhos públicos não tinha teste nenhum. **Sem migration.**

### Adicionado

- `lib/supabase/public-paths.ts` — `PUBLIC_PATHS` e `isPublicPath` extraídos de
  `middleware.ts`, sem dependência de Next ou Supabase, para poderem ser
  testados.
- `lib/supabase/public-paths.test.mts` — 6 testes. O mais importante varre
  `app/api/**` e **falha diante de qualquer rota nova não declarada** numa
  tabela explícita de decisão: não dá para adivinhar se uma rota futura deve
  ser pública, dá para obrigar quem a criou a decidir.

### Alterado

- O casamento passou a ser **por segmento**, não por prefixo de string.
  `startsWith("/api/forms")` também aceitaria `/api/formsecretos` — uma rota
  futura com nome parecido nasceria pública sem ninguém decidir isso. Nenhuma
  rota existente muda de comportamento; o teste enumera todas para provar.

### Validação

- Os testes foram verificados **contra o defeito real**: removendo
  `/api/forms` da lista, dois testes falham com
  `/api/forms/valor-concreto/submit deveria ser público`; criando uma rota de
  API sem declará-la, a varredura falha.
- Smoke test local com `npm run dev`: as três rotas públicas de `/api` chegam
  ao handler (404/401/401) e `/dashboard`, `/atendimento`, `/formularios`,
  `/api/uazapi/send` e `/api/session/org` seguem em 307.
- `npx tsc --noEmit` limpo; `npm run build` sem erro; `npm run test:unit` 15/15.

## 2026-08-27 — Informações do Lead e external_id com maiúscula

Vinda do primeiro uso real da ingestão externa (Typeform e Meta Lead Ads via
n8n). Migration `0015` **aplicada pelo cliente** em 2026-08-27, antes de o
código depender dela.

> Submissões recebidas ANTES da `0015` têm `metadata = '{}'` e não exibem o
> card. Só leads ingeridos depois da migration mostram as respostas.

### Adicionado

- **Card "Informações do Lead"** em `/negociacoes/[id]` (coluna esquerda,
  abaixo de Contato) e em `/atendimento` (abaixo da negociação, carregado sob
  demanda para a conversa aberta). Mostra as respostas que o lead deu no
  formulário de origem. Não renderiza nada quando não há respostas.
- **`metadata` no contrato de `POST /api/ingest/leads`** — opcional, guardado
  como veio em `form_submissions.metadata`, sem filtro por `form_fields`.
- Migration `0015`: coluna `metadata` e `external_id` aceitando maiúsculas.
- **`npm run test:unit`** — runner embutido do Node (`node --test`), sem
  dependência nova, cobrindo o parser das respostas contra os payloads reais
  de Typeform e Meta Lead Ads. Primeira cobertura de código de aplicação do
  projeto (débito 1 do HANDOFF, parcialmente atendido).

### Alterado

- `external_id` passou a aceitar letras maiúsculas, para receber o token do
  Typeform e o `form_id` do Meta colados como estão. Continua **sensível a
  caixa** por decisão do cliente: colar com a caixa errada responde 404.

### Validação

- `npx tsc --noEmit` limpo; `npm run build` sem erro.
- `npm run test:unit`: 9 testes, zero falhas.
- `npm run test:db`: **91 asserções, zero falhas**, incluindo 13 novas no
  bloco 14 — ids reais de Typeform e Meta aceitos, caixa diferenciando,
  formatos ainda recusados, `metadata` preservando quebras de linha e acentos
  num formulário sem nenhum campo cadastrado, e isolamento entre organizações.

## 2026-08-27 — Frente B publicada em produção

- Commit em produção passou de `e957dd6` para `61a4690`.
- Verificado contra `https://wavemov-crm.vercel.app` depois do deploy:
  `/api/ingest/leads` responde `401` sem cabeçalho e com credencial inválida;
  `/api/forms/<slug>/submit` responde `404` para slug inexistente (**antes
  respondia 307 para `/login`** — é a prova do bug corrigido);
  `/api/webhooks/uazapi` segue em `401`, sem regressão; `/dashboard` continua
  em `307` e `/login` em `200`.
- **Ainda sem prova real**: nenhuma chamada com credencial válida foi feita. Os
  caminhos de sucesso, duplicata e 404 por empresa errada dependem do smoke
  test com o n8n.

## 2026-08-27 — Frente B: ingestão externa de leads (n8n)

Migration `0014_ingestao_externa_de_leads.sql` **aplicada pelo cliente** em
2026-08-27, antes de qualquer código depender dela.

### Adicionado

- **`POST /api/ingest/leads`** — endpoint genérico chamado pelo n8n.
  Autenticação por `x-webhook-secret` (credencial por organização), formulário
  escolhido por `form_external_id` no corpo, idempotência por `event_id`.
  Contrato completo, tabela de respostas e regras de isolamento em
  `docs/FUNCIONALIDADES.md`.
- **Painel "Ingestão externa de leads (n8n)"** em `/formularios`, restrito a
  `org_admin`: endpoint, credencial oculta com revelar/copiar, exemplo de
  corpo, formulários conectados e rotação com confirmação.
- **Campo "Identificador de integração"** no modal do formulário, validado
  contra o mesmo padrão do `check` do banco antes de tentar gravar.
- Migration `0014`: `forms.external_id` (único global, índice parcial),
  `organization_ingest_secrets` (revogada de `anon`/`authenticated`, RLS sem
  policy), `form_submissions.external_event_id` + `source` com único parcial
  `(form_id, external_event_id)`.

### Corrigido

- **Formulários públicos não gravavam lead nenhum — e diziam que sim.**
  `/api/forms/[slug]/submit` não estava na lista de caminhos públicos do
  middleware, então a requisição de um visitante deslogado era redirecionada
  para `/login`. O `fetch` da página seguia o redirect, `/login` respondia
  **200 com HTML**, `res.ok` ficava verdadeiro e o visitante via "Recebido com
  sucesso! 🎉" enquanto nada era escrito. Defeito anterior a esta rodada,
  encontrado ao testar a rota de ingestão, que caía no mesmo buraco.
  `PUBLIC_PATHS` passou a incluir `/api/forms` e `/api/ingest`, com o critério
  de entrada documentado no próprio arquivo: só entra aqui rota que autentica
  por conta própria.

### Alterado

- A submissão passa a ser gravada **antes** do contato e da negociação nos dois
  caminhos de entrada. Na página pública isso preserva o que a pessoa digitou
  quando a criação do lead falha; na ingestão externa é a trava de idempotência.
- Falha ao criar a negociação deixou de ser silenciosa em `/f/[slug]`: a rota
  responde `500` em vez de `ok`.
- `/formularios`: salvar e ativar/desativar formulário agora filtram por
  `organization_id` e confirmam a linha afetada com `.select()`. Ativar e
  desativar tinham falha silenciosa — e `is_active` passou a decidir se um
  fluxo do n8n entrega ou recebe `404`. Erros das ações da lista aparecem num
  banner; antes só o modal tinha onde mostrá-los.

### Interno

- Regra de criação de lead a partir de formulário extraída para
  `lib/features/lead-ingestion/` (`domain/form-payload.ts`,
  `application/register-form-lead.ts`,
  `infrastructure/ingest-queries.ts`). A página pública e a ingestão externa
  compartilham sanitização, reuso de contato, escolha de etapa e registro no
  histórico em vez de duplicá-los.

### Validação

- `npx tsc --noEmit` limpo; `npm run build` com 29 rotas sem erro.
- `npm run test:db`: **78 asserções, zero falhas**, incluindo 20 novas no
  bloco 13 — revoke da tabela de credenciais para `org_admin` e `seller`,
  colisão global de `external_id` entre empresas, formato recusado,
  idempotência por par formulário + evento e submissão pública intocada.

## 2026-08-27 — publicação em produção

### Publicado

- A rodada do **histórico do lead separado das conversas** foi para produção.
  Commit em produção passou de `08aca41` para `e957dd6`; deployment
  `wavemov-4w4qn0gqy`, alias `https://wavemov-crm.vercel.app`.
- Sem mudança de código e **sem migration a aplicar**: `0001`…`0013` seguem
  como estavam.
- Verificado antes do push: `npx tsc --noEmit` limpo, `npm run build` com 28
  rotas sem erro. Depois do deploy: `/login` 200 e `/` 307 (redirect de sessão).

## 2026-08-26 — histórico do lead separado das conversas

### Alterado

- `/negociacoes/[id]` ganhou o card **Histórico do lead** com as guias
  **Atividades** e **Conversas**. A timeline comercial não exibe mais um item
  para cada mensagem recebida ou enviada.
- A query de `activity_logs` exclui os tipos WhatsApp antes de aplicar o limite
  de 50, preservando notas, tarefas, movimentações, mudanças de status, ganho e
  perda mesmo em leads com conversas longas.
- Mensagens completas são carregadas somente ao abrir a guia Conversas, em
  páginas de 50 e sem transportar `raw_payload` ao navegador. Várias conversas
  do mesmo lead podem ser alternadas sem refazer páginas já carregadas.
- A thread no detalhe é somente leitura, responsiva e aponta para o atendimento
  quando o usuário precisa responder.

### Interno

- As bolhas de mensagem foram extraídas para
  `components/whatsapp/message-thread.tsx` e reutilizadas pelo atendimento e
  pelo detalhe da negociação.
- Timeline, navegação por guias, histórico de conversas e consulta Supabase
  foram separados em módulos com responsabilidades únicas.
- Registros `whatsapp_inbound`/`whatsapp_outbound` existentes continuam em
  `activity_logs` para auditoria; apenas deixaram de ser exibidos na timeline.

## 2026-08-26 — padrões obrigatórios de engenharia

### Adicionado

- `docs/ENGINEERING_STANDARDS.md` como fonte canônica de Clean Architecture
  incremental, fronteiras do repositório, coesão, fluxo antes/depois da edição,
  matriz de validação e Definition of Done.
- `AGENTS.md` e `CLAUDE.md` na raiz como pontos de entrada para ferramentas e
  agentes diferentes consumirem o mesmo contrato.

### Alterado

- O squad passou a exigir inventário e impacto antes da implementação, revisão
  arquitetural e evidências de validação no QA, além de avaliação explícita do
  impacto documental.
- Arquivos grandes legados não bloqueiam correções pequenas, mas não podem
  receber nova responsabilidade sem decomposição ou justificativa registrada.
- Limites de tamanho viraram gatilhos auditáveis de revisão, sem impor
  abstrações ou refatorações cerimoniais.

## 2026-08-26 — funil padrão (migrations `0012`/`0013`) e troca de funil/etapa no atendimento

Sem bump de versão: continua `0.2.0`. **Migration nova:
`0012_funis_padrao_e_administracao.sql`, aplicada em produção pelo cliente.**
Também foi aplicada a `0013_coerencia_funil_etapa_do_lead.sql`, que impede no
banco combinações de organização, funil e etapa incompatíveis.

### Banco de dados

- **`pipelines.is_default`** com índice único parcial por organização: no máximo
  um funil padrão por empresa e, para toda empresa que tenha funis, exatamente
  um. Backfill determinístico pelo funil mais antigo.
- **Excluir funil não apaga mais negociações.** `deals.pipeline_id` passou de
  `on delete cascade` para `on delete restrict`, e `forms.pipeline_id`, de
  `on delete set null` para `on delete restrict`. Era o risco que travava a
  criação de funis pela interface: um clique em "excluir" podia levar junto
  todos os leads do funil.
- **Estrutura de funil virou assunto de `org_admin`.** As policies de insert e
  update de `pipelines` e `pipeline_stages` passaram a exigir `is_org_admin`.
  Leitura continua para todo membro.
- **Invariantes no banco, não só na tela**: o primeiro funil da organização
  nasce padrão e um adicional nunca vira; `is_default` só muda pela função
  `set_default_pipeline()`; o funil padrão e o último funil da organização não
  podem ser excluídos; um funil não muda de organização.
- RPCs novas, todas com checagem de `is_org_admin` na entrada e `execute`
  revogado de `PUBLIC`/`anon`: `create_pipeline` (funil + etapas mínimas numa
  transação), `set_default_pipeline`, `delete_pipeline` e
  `pipeline_delete_blockers`, que informa à interface o que impede a exclusão.
- Validada antes de ir para produção com a cadeia `0001`→`0012` aplicada do zero
  num Postgres descartável, mais 40 asserções de comportamento (isolamento entre
  empresas, papéis, invariantes do padrão, recusas de exclusão e idempotência).

### Adicionado

- **Administração de funis em `/funis`** — criar, renomear e excluir, fechando
  a Frente A. A criação usa a RPC `create_pipeline` (funil + etapas mínimas
  numa transação), com o interruptor "Começar com etapas padrão". A exclusão
  consulta `pipeline_delete_blockers` antes de tentar e explica em português o
  que impede — funil padrão, único funil, negociações ou formulários
  vinculados —, só oferecendo o botão quando não há impedimento. O estado
  vazio da tela passou a conter a ação de criação: antes o componente devolvia
  `EmptyState` antes do `PageHeader`, e uma empresa sem funil nenhum não tinha
  como criar o primeiro.
- **Troca de funil e etapa do lead direto no atendimento.** Dois selects no
  cartão "Negociação" do painel direito, com salvamento automático, confirmação
  na tela e trilha em `deal_stage_history` + `activity_logs`
  (`origem: "atendimento"`). Só lista etapas abertas: ganhar e perder continuam
  em `/negociacoes/[id]`, onde há confirmação e motivo de perda. Trocar o funil
  grava funil e etapa no mesmo update e reposiciona a etapa para a primeira
  aberta do destino.

### Corrigido

- **Conversa com lead fechado oferecia "Criar lead desta conversa" — e o clique
  criava um lead duplicado.** A página só carregava negociações com
  `status = "open"` (limite 300), então uma conversa cujo lead foi ganho,
  perdido ou arquivado ficava sem o objeto do lead e caía no estado de "sem
  negociação", apesar de ter `deal_id`. O clique criava um segundo lead e
  sobrescrevia o vínculo da conversa, desligando o histórico do lead real. A
  página passou a carregar também os leads vinculados às conversas exibidas.
- **Criação de lead pela conversa engolia falhas.** Três `return` silenciosos
  viravam "não aconteceu nada" na tela; agora todo erro aparece em pt-BR,
  inclusive o parcial ("o lead foi criado, mas não ficou vinculado"), para que
  o vendedor não clique de novo e crie outro lead. `linkToDeal` também passou a
  informar falha.
- **Criação de lead pela conversa levava o vendedor para fora do chat**
  (`router.push`). Agora permanece na conversa.
- **Webhook da UAZAPI e criação de lead pelo atendimento** resolviam o funil por
  `.order("created_at").limit(1)` — "o mais antigo", que mudava de significado
  assim que a empresa criava um segundo funil. Passaram a usar `is_default`.
- **`/funis` oferecia a `seller` e `agent` controles que o banco recusa** desde
  a `0012`. A tela passou a exigir `org_admin` para editar e excluir.

### Segurança e permissões

- **`viewer` conseguia enviar mensagem de WhatsApp pela API.**
  `app/api/uazapi/send` validava sessão e organização, mas não o papel — e como
  a rota fala com a UAZAPI por `service_role`, o RLS não a protegia. Agora
  responde 403 para `viewer`, e o campo de mensagem some da tela para ele.
- `viewer` também deixou de ver "Transferir atendimento", "Nota interna",
  "Marcar como resolvida", "Criar lead" e "Vincular a lead existente": todas
  escrevem, todas eram recusadas pelo banco em silêncio. Abrir uma conversa
  como `viewer` não dispara mais o update de `unread_count` recusado.
- `resolve()` e `saveNote()` passaram a mostrar a falha na tela.

### Corrigido (revisão de QA da própria entrega)

- **Gravação recusada pelo RLS era anunciada como sucesso.** O update sem
  `.select()` devolve 204 e zero linhas quando a negociação deixa de passar
  pela policy — por exemplo, quando o lead é transferido para outro
  responsável enquanto a aba está aberta. A tela dizia "Etapa alterada" e a
  trilha registrava uma movimentação que nunca aconteceu. Agora a linha
  afetada é conferida e o vendedor é avisado.
- **Voltar ao funil de origem rebaixava o lead para a primeira etapa.** Quem
  abria o seletor, escolhia outro funil e voltava atrás perdia a posição do
  lead. Desfazer agora restaura a etapa real, e voltar ao valor já gravado não
  gera movimento nenhum.
- **Erro ao vincular negociação aparecia atrás do modal aberto** — invisível
  para quem clicou. Passou a ser mostrado dentro do próprio modal, e o botão
  ganhou estado de carregamento contra clique duplo.
- **Movimentação que terminava depois da troca de conversa falhava calada.** O
  aviso agora sobe para um alerta no topo da tela, nomeando o lead.
- Consulta dos leads vinculados passou a ir em lotes de 100: 300 UUIDs num
  único `id=in.(…)` estouram o limite de cabeçalho do proxy e a resposta 414
  era descartada em silêncio, ressuscitando o bug do lead duplicado.
- O temporizador do seletor é cancelado se o lead for fechado por outra pessoa
  na mesma janela, e a `key` do componente passou a incluir a conversa — a
  `0011` permite várias conversas para o mesmo lead.
- Lead criado pelo atendimento passou a abrir `deal_stage_history`, como toda
  outra movimentação do produto.
- Vincular conversa, vincular o lead recém-criado, transferir atendimento e
  resolver/reabrir conversa passaram a conferir se o update realmente afetou
  uma linha; RLS recusando a escrita não é mais anunciado como sucesso.
- O botão de resolver/reabrir do cabeçalho deixou de aparecer para `viewer`.
- Os seletores de funil e etapa ficam bloqueados durante a gravação, evitando
  duas movimentações concorrentes com respostas fora de ordem.

### Corrigido (segunda revisão de QA, sobre o CRUD de funis)

- **Enter repetido no campo "Nome" criava funis duplicados.** O `Button` já se
  protege contra clique duplo, mas o atalho de teclado não passa por ele:
  segurar Enter disparava uma chamada de `create_pipeline` por repetição de
  tecla, e nenhum dos funis gêmeos era o padrão, então nada denunciava o
  problema. Criar e renomear ganharam guarda de reentrância e o campo fica
  desabilitado durante a gravação.
- **O campo do modal abria sem o cursor.** O `autoFocus` do React era desfeito
  pelo `Modal`, que reivindica o foco do painel no quadro seguinte. O `Modal`
  passou a respeitar um `data-autofocus` no conteúdo antes de cair no painel —
  as duas estratégias competindo eram a causa, e agora há uma só.
- **Exclusão recusada pelo banco deixava a tela dizendo que estava tudo livre.**
  Entre a consulta de vínculos e o clique pode entrar um lead novo no funil. O
  erro agora recarrega a lista de impedimentos, que passa a mostrar o motivo
  real em vez de repetir "nenhuma negociação vinculada".
- **"Mova as negociações antes" não dizia para onde ir.** A contagem do banco
  inclui negociações ganhas, perdidas e arquivadas, enquanto o Kanban abre
  filtrado em "abertas" — o admin ia até lá, via o quadro vazio e concluía que
  a tela estava errada. O impedimento virou link para
  `/negociacoes?funil=<id>&status=todas` (e para `/formularios`).
- Nome do funil ganhou limite de 60 caracteres e o erro passou a aparecer sob o
  campo; o aviso de "muitos funis" foi para o token de alerta do Design Guide;
  a verificação de vínculos usa `Skeleton` em vez de texto; e o
  `router.refresh()` redundante depois da navegação foi removido.

### Interno

- `firstOpenStage()` em `lib/utils/index.ts` — a mesma regra estava prestes a
  virar a terceira cópia. `deal-modal.tsx` passou a consumir o helper.
- `Modal` aceita `data-autofocus` no conteúdo para escolher onde o foco pousa
  na abertura. Sem a marca, o comportamento é o de antes (foco no painel).
- `Pipeline.is_default` em `types/index.ts`.
- `/funis` mostra qual é o funil padrão e ganhou a ação **Tornar padrão**
  (`org_admin`), via a RPC `set_default_pipeline` da `0012`. Sem isso o webhook
  e a criação de lead pelo atendimento dependiam de um campo que ninguém
  conseguia ver nem trocar.
- Erros das consultas da página de atendimento passaram a ser logados: lista
  vazia por falha era indistinguível de lista vazia por ausência de dados.

## 2026-08-26 — correção global de posicionamento dos modais

### Corrigido

- **Popups abriam abaixo da viewport em páginas longas.** O `Modal` compartilhado
  era `position: fixed`, mas ficava dentro do wrapper `.animate-fade-up`, cujo
  `transform` persistente virava o bloco de referência do elemento fixo. O
  overlay começava abaixo da navegação e o formulário/rodapé podia ficar fora
  do campo de visão. O componente agora usa `createPortal(..., document.body)`,
  portanto todos os modais e diálogos voltam a ser relativos à viewport.
- Altura máxima passou a considerar `dvh`, o conteúdo ganhou scroll flexível e
  cabeçalho fixo dentro do painel.
- O componente-base ganhou `role="dialog"`, `aria-modal`, nome/descrição
  associados, botão de fechar nomeado, contenção de Tab/Shift+Tab, Escape,
  bloqueio de scroll com contagem e restauração do foco no gatilho.

Referência do defeito: `referenciasdev/popupbug.PNG`.

## 2026-08-26 — leads e conversas por responsável (migration `0011`)

Sem bump de versão: continua `0.2.0`. **Migration nova:
`0011_visibilidade_leads_conversas.sql`.**

### Segurança e permissões

- `seller` e `agent` passam a ler somente negociações em que são o
  `responsible_id`. As conversas, mensagens, tarefas, histórico de etapa,
  submissões e atividades vinculadas seguem a mesma fronteira no RLS.
- `org_admin` e admin global mantêm visão completa da organização. O `viewer`
  também mantém a visão completa já existente, porém sem permissão de escrita.
- A rota de envio agora filtra explicitamente a conversa pela organização da
  sessão antes de usar `service_role`; conhecer o UUID de outra conversa não
  permite enviar por ela.

### Multi-instância

- A unicidade de conversa passou de `(organization_id, phone)` para
  `(organization_id, instance_id, phone)`: o mesmo lead falando com dois
  números da empresa gera duas conversas, sem alternar o remetente.
- As conversas continuam ligadas ao mesmo `deal_id`. No detalhe do lead,
  gerente/admin vê todas as conversas e interações de todos os atendentes; o
  responsável comercial/atendente vê apenas as que pertencem aos seus leads.
- Conversas legadas com `instance_id` nulo são vinculadas à instância
  autenticada na primeira mensagem recebida.

### Operação

- Cliente confirmou a aplicação das migrations `0010` e `0011` em produção.
- Deploy de produção concluído na Vercel: `dpl_8Z7SV55UZDJiBUaAaP1J1wmg5JBN`,
  alias `https://wavemov-crm.vercel.app`.

## 2026-08-26 — segredo de webhook por instância (migration `0010`)

Sem bump de versão: continua `0.2.0`. **Migration nova: `0010_webhook_secret_por_instancia.sql`.**

### Segurança

- **`UAZAPI_WEBHOOK_SECRET` era um segredo global exibido sem guarda de papel.**
  Um único valor em env valia para todas as empresas da base, e
  `/atendimento/configuracoes` montava `...?org=<id>&secret=<segredo>` e
  entregava a URL pronta para qualquer membro — incluindo `viewer`. Com o
  segredo em mãos e o UUID de outra empresa dava para forjar mensagens e criar
  contatos e leads na conta alheia — em **qualquer uma das ~300 empresas**,
  tenha ela WhatsApp configurado ou não: a rota do webhook usa `service_role`,
  então o RLS não protege nada lá dentro.
  - **Migration `0010`** — `whatsapp_instances.webhook_secret`: `not null`,
    índice único, `default public.generate_webhook_secret()` e backfill das
    instâncias existentes. A coluna ficou em `whatsapp_instances`, e **não** em
    `organizations`, porque a `0005` já revogou essa tabela de `anon` e
    `authenticated` (só `service_role` lê). `organizations` é legível por
    qualquer membro via RLS, é consultada com `select *` em
    `getSessionContext()` e viaja inteira como prop até `top-nav.tsx`: um
    segredo ali vazaria para todo mundo.
  - **Coluna em vez de segredo derivado** (`hmac(org_id, SERVER_KEY)`): o
    derivado dispensaria migration, mas não permite rotacionar **uma** empresa —
    só a chave-mestra, que invalidaria todas as URLs de uma vez; e um vazamento
    da chave-mestra recalcularia o segredo de todas as empresas para sempre.
    Além disso `hmac(org_id, …)` identifica a *empresa*, e o produto vai ter
    **mais de uma instância por empresa** (empresas com vários atendentes): o
    segredo precisa dizer qual número recebeu a mensagem. Com coluna em
    `whatsapp_instances`, cada rotação toca uma linha e o segredo identifica a
    instância.
  - **Comparação em tempo constante.** `lib/services/webhook-secret.ts` compara
    o SHA-256 dos dois lados com `crypto.timingSafeEqual` — `===` sai no
    primeiro byte diferente e vira oráculo de tempo; comparar o hash iguala o
    comprimento e evita o `throw` do `timingSafeEqual` com buffers de tamanhos
    distintos.
  - **A URL do webhook virou informação de `org_admin`.** A página só monta a
    URL quando `session.membership.role === "org_admin"` ou
    `session.profile.is_global_admin`; sem permissão, o segredo nem é calculado
    (não basta esconder no CSS: ele iria no payload do Server Component).
  - **`toPublicInstance()` passou a remover `webhook_secret`** além do
    `token_encrypted`. Todo campo sensível novo em `whatsapp_instances` precisa
    entrar nessa desestruturação — o que sobra ali vira prop de cliente.
  - **O segredo resolve a organização.** A rota busca a instância pelo índice
    único de `webhook_secret` e, depois da resolução já auditada, exige que a
    organização final seja a mesma que o segredo autenticou (**403** caso
    contrário). Um `?org=` apontando para outra empresa não escreve lá.

### Corte do segredo global — sem período de compatibilidade

`UAZAPI_WEBHOOK_SECRET` **não é mais lido por nenhum código**. Cogitou-se
aceitar os dois segredos em paralelo, mas a base tem **uma única instância
cadastrada** (1 organização das ~300): seria um caminho de compatibilidade
permanente — desses que ninguém remove — para poupar a reconfiguração de um
painel. Enquanto o legado vivesse, a falha original continuaria explorável.

**Passo a passo do operador (nesta ordem):**

1. Aplicar a `0010` (`supabase db push` ou SQL Editor). Nada muda em produção:
   o código no ar ainda valida o segredo de env e a coluna nova fica ociosa.
2. Fazer o deploy deste commit. **A partir daqui o webhook antigo devolve 401**
   e as mensagens da única instância param de entrar no CRM.
3. Abrir `/atendimento/configuracoes` como `org_admin` da empresa que usa
   WhatsApp, copiar a URL do webhook e colá-la no painel da UAZAPI. As
   mensagens voltam. **A janela entre 2 e 3 é de minutos e é o único
   downtime** — mensagens recebidas nesse intervalo chegam ao aparelho, mas não
   entram no CRM (a UAZAPI não garante reentrega).
4. Remover `UAZAPI_WEBHOOK_SECRET` do ambiente (Vercel e `.env.local`).
   Nenhum código a lê; é higiene.
5. As outras ~299 empresas não precisam de nada. Quando conectarem o WhatsApp,
   o segredo nasce junto da instância (`default` da coluna) ou pelo botão
   **Gerar URL do webhook** na tela de configurações.

Rollback: redeploy do commit anterior + repor a variável no ambiente. A `0010`
não precisa ser desfeita (a coluna é aditiva e o código antigo a ignora).

### Multi-instância — a conversa passou a guardar por qual número entrou

O cliente confirmou que uma empresa poderá conectar **mais de uma instância**
(empresas com vários atendentes). Como o segredo autentica a *instância*, o
webhook já tem o `instance_id` certo na mão:

- `whatsapp_conversations.instance_id` passa a ser gravado com a instância que
  **de fato recebeu** a mensagem. Antes vinha de um
  `.eq("organization_id", …).limit(1)` — escopado por empresa (não vazava entre
  organizações), mas arbitrário dentro dela.
- `app/api/uazapi/send/route.ts` responde pela instância da conversa
  (`getInstanceById()`, filtrado também por `organization_id`), com fallback
  para `getInstanceForOrg()` nas conversas antigas. Antes usava sempre a
  instância **mais antiga** da empresa: com dois atendentes, o cliente escrevia
  para o número B e a resposta saía pelo número A.
- Conversa antiga com `instance_id` nulo é preenchida na primeira mensagem;
  conversa que **já tem** instância não é reatribuída — ver a ressalva da
  constraint `unique (organization_id, phone)` em `docs/HANDOFF.md` (débito 8).

### Adicionado

- `lib/services/webhook-secret.ts` — geração (`randomBytes(32)`, prefixo
  `wmv_`), comparação em tempo constante e montagem da URL do webhook.
  Server-only.
- `public.generate_webhook_secret()` — dois `gen_random_uuid()` concatenados
  (244 bits). Usa o gerador do core do Postgres em vez de
  `gen_random_bytes()` do pgcrypto porque no Supabase a extensão vive no schema
  `extensions` e depender do `search_path` dentro de um DEFAULT de coluna falha
  em silêncio. `execute` revogado de `anon`/`authenticated` para não virar RPC
  pública no PostgREST.
- **Rotação por organização** — server action
  `rotateWebhookSecretAction()` em
  `app/(dashboard)/atendimento/configuracoes/actions.ts`. A organização vem
  sempre de `getSessionContext()`, nunca do cliente; exige `org_admin`; cria a
  instância se a empresa ainda não tiver uma (só com o segredo, sem credenciais
  UAZAPI) e não devolve o segredo no retorno — a tela relê do servidor. A UI
  pede confirmação antes de girar, porque a URL antiga morre na hora.

### Alterado

- `.env.example` — remove `UAZAPI_WEBHOOK_SECRET` e documenta o segredo por
  instância. Instalação nova não precisa de variável de webhook.
- `types/index.ts` — `WhatsAppInstance.webhook_secret: string`.

## 2026-08-26 — rodada de correções

Sem bump de versão: continua `0.2.0`. Nenhuma migration nova.

### Segurança

- **Webhook da UAZAPI podia gravar dados de uma empresa dentro da organização
  de outra.** Em `app/api/webhooks/uazapi/route.ts`, quando a URL chegava sem
  `?org=`, o fallback buscava `whatsapp_instances` com `.limit(1)` **sem filtro
  de organização** — pegava a primeira linha da tabela inteira. Numa base
  multiempresa isso significa contato, conversa, mensagem e lead gravados na
  organização errada, com `service_role` (RLS não barra). A resolução da
  organização passou a ser determinística:
  - `?org=` é validado como UUID antes de qualquer query. Valor inválido devolve
    **400**; antes o Postgres respondia `22P02` e a cadeia degradava até um 500
    genérico, que a UAZAPI reenviaria em loop.
  - A instância é identificada pelo token/`instance_id` do próprio payload, e
    só é aceita quando resolve para **uma única** instância (`count === 1`):
    `whatsapp_instances` não tem índice único nessas colunas, e escolher "a
    primeira" repetiria o bug.
  - Divergência entre o `?org=` da URL e a instância do payload devolve **403**.
    A URL não vence porque `UAZAPI_WEBHOOK_SECRET` é um segredo único
    compartilhado por todas as empresas — sozinha, ela não prova origem.
  - O fallback para "a instância existente" só vale quando existe exatamente
    uma na base. Caso contrário: **400** e `console.error` estruturado
    (`hasOrgParam`, `instanceRefs`, `instanceCount`).

### Adicionado

- `extractInstanceRefs()` em `lib/services/uazapi.ts` — devolve **todas** as
  referências plausíveis da instância no payload, da mais específica para a
  menos (`token`, `apikey`, `instanceId`, aninhados em `instance`/`data`, e
  `data.id` por último). Devolve a lista inteira de propósito: os nomes de campo
  variam entre versões da UAZAPI e alguns carregam o telefone da instância
  (`owner`) em vez do token — parar na primeira candidata deixaria o token real,
  aninhado, sem nunca ser consultado.
- `describeWriteError()` em `lib/utils/index.ts` — mensagem de erro de escrita
  em pt-BR para a tela e o erro completo (`code`, `details`, `hint`) para o
  `console.error`.

### Corrigido

- **Negociação sumia dos dois Kanbans ao trocar de funil.**
  `components/crm/deal-modal.tsx` — o `<Select>` de Funil não reposicionava
  `stage_id`: gravava o `pipeline_id` do funil B com o `stage_id` do funil A, e
  o card desaparecia do Kanban de origem (que filtra por funil) e do de destino
  (que não tem coluna com aquele id). Agora a troca de funil move a negociação
  para a primeira etapa aberta do funil escolhido.
- **Erro cru do Postgres aparecendo na tela** — 11 pontos de escrita em 5
  arquivos (`companies-client.tsx`, `contacts-client.tsx`, `deal-modal.tsx`,
  `task-modal.tsx`, `forms-client.tsx`) mostravam o `err.message` do PostgREST
  em inglês e com jargão de banco ("violates not-null constraint"). Passaram a
  usar `describeWriteError()`.
- **Formulário podia ficar sem campos depois de uma falha de gravação.**
  `components/forms/forms-client.tsx` grava campos por delete + insert; se o
  insert falha, os campos já foram apagados e o formulário público continua
  ativo, virando um form vazio que gera lead sem dados. A mensagem antiga ("o
  formulário foi salvo, mas os campos não") sugeria que nada havia mudado. Agora
  o texto diz que o formulário está sem campos e pede que se salve de novo antes
  de divulgar o link, e a tela dá `router.refresh()` para parar de exibir campos
  que não existem mais.
- **`/funis` não ressincronizava entre dois funis vazios.**
  `components/crm/pipeline-stages-client.tsx` — o `serverKey` do `useEffect` era
  montado só com as etapas; dois funis sem etapa nenhuma produziam a mesma chave
  e a troca não disparava o efeito. O id do funil ativo entrou na chave.
- **"Primeiro funil" divergia entre telas.**
  `app/(dashboard)/dashboard/page.tsx` ordenava os funis por `.order("name")`
  enquanto as outras seis chamadas do projeto usam `.order("created_at")`.

### Alterado

- `.gitignore` passa a ignorar `/referenciasdev` (prints e mockups usados só
  durante o desenvolvimento).

### Verificado

```
npx tsc --noEmit    → limpo
npm run build       → 28 rotas, sem erro; /funis estável em 182 kB
```

Sem testes automatizados no projeto — nada além de `tsc` e `build` foi
executado nesta rodada.

---

## 2026-08-26 — fechamento da v0.2.0

### Adicionado

- `docs/HANDOFF.md` — passagem de serviço para a próxima sessão / outro agente:
  estado atual, regras invioláveis, armadilhas já pagas, mapa do código, como
  validar, próximos passos e débitos técnicos.

### Alterado

- Versão para `0.2.0`.
- `.gitignore` passa a ignorar logs temporários de ferramentas locais,
  `.tmp_remote_schema.sql` e `.claude/settings.local.json` (os agentes em
  `.claude/agents/` continuam versionados), com exceção explícita para
  `.env.example`.

### Notas

- Migration `0009_reporting.sql` **aplicada** no projeto `crmjidbr`. Verificado
  por SQL: as duas views existem com `security_invoker = on` e os três índices
  foram criados.

---

## 2026-08-25

### Adicionado

- **Squad de agentes de desenvolvimento** em `.claude/agents/` — não existia
  nenhum agente configurado no projeto até aqui. Criados `qa-engineer`
  (prioridade, portão de qualidade), `crm-frontend`, `crm-backend`,
  `crm-product`, `crm-perf` e `crm-docs`. Ver `docs/SQUAD.md`.
- **Tela `/funis` — Etapas do funil**: fluxo com volume por etapa, valor em
  aberto e retenção entre etapas; renomear, reordenar, marcar Ganho/Perdido,
  copiar ID e excluir. Era um item de "próximos passos" do `README.md`.
- **Tela `/relatorios` — Relatório de entrada de leads**: KPIs de hoje/ontem/7/30
  dias, gráfico diário, resumo rápido, tabela de leads recebidos com busca e
  filtro por formulário, e ranking de top formulários.
- **Tela `/relatorios/ultimo-lead` — Último lead recebido**: dados do lead mais
  recente, origem e respostas do formulário, timeline e últimos leads.
- Item **Relatórios** na navegação principal e atalho **Etapas** na barra do
  Kanban.
- `PeriodFilter` (Hoje / 7 dias / 30 dias / Este mês) e utilitários
  `resolvePeriod` / `dailySeries` em `lib/utils/period.ts`.
- `DailyLeadsChart` em `components/crm/dashboard-charts.tsx`.
- `buttonClasses` em `components/ui/button.tsx`, para dar aparência de botão a
  um `<Link>` sem aninhar `<button>` dentro de `<a>`.
- Migration `0009_reporting.sql`: views `organization_deal_stats` e
  `pipeline_stage_stats` (ambas `security_invoker = on`) e três índices de apoio.

### Corrigido

- **Kanban — `setState` durante o render.** A sincronização com os dados do
  servidor usava `useMemo(() => setDeals(...))`, o que dispara re-render em
  cascata. Passou a ser `useEffect`.
- **Kanban — filtro "Todas" não funcionava.** A opção enviava valor vazio, o
  parâmetro era removido da URL e o servidor reaplicava o padrão `open`. Agora
  usa o valor explícito `todas`, e o `<select>` ganhou a opção **Arquivadas**,
  que só existia como botão.
- **Kanban — reversão incompleta ao falhar o arraste.** Em caso de erro na
  gravação, só `stage_id` voltava: o objeto `stage` e o `status` ficavam com o
  valor otimista, mostrando o card como ganho/perdido sem ter sido salvo. Agora
  o card inteiro é restaurado e o usuário recebe uma mensagem — antes a falha
  era silenciosa.
- **`/funis` — reordenação podia gravar uma ordem errada.** Persistir apenas as
  duas etapas trocadas quebra quando os `order_index` do banco têm buracos
  (0, 10, 20…). Os índices passam a ser normalizados para `0..n-1` e todas as
  etapas com índice alterado são gravadas.
- **HTML inválido `<a><button>`** no atalho de configurações do Atendimento,
  substituído por `<Link className={buttonClasses(...)}>`.

### Alterado

- **`/empresas` deixou de carregar até 5.000 negociações** para contar leads e
  calcular inatividade; usa a view `organization_deal_stats` (uma linha por
  empresa).
- **`/empresas/[id]` foi reformulada** em Resumo da empresa (KPIs, saúde da
  conta, resumo rápido, evolução de leads, últimos leads) e também parou de
  trazer todas as negociações da empresa.
- Contagens das telas de relatório usam `count: "exact", head: true` — nenhuma
  linha trafega só para virar um número.

### Notas de aplicação

A migration `0009_reporting.sql` precisa ser aplicada antes de usar `/funis`,
`/empresas` e `/empresas/[id]`. Ela é aditiva (duas views e três índices) e não
altera nem remove dados existentes.

```bash
supabase db push        # com o projeto linkado
# ou cole supabase/migrations/0009_reporting.sql no SQL Editor
```
