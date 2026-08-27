# Changelog — Wavemov CRM

Ordem cronológica inversa. Datas absolutas (AAAA-MM-DD).

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
