# Inventário de funcionalidades — Wavemov CRM

Estado real do produto. Recurso planejado fica em "Próximos passos" no
`README.md`, nunca aqui.

## Rotas autenticadas

| Rota | Arquivo | O que faz |
|---|---|---|
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Métricas do funil: criadas/ganhas/perdidas, ticket, conversão, séries mensais, etapas, responsáveis, motivos de perda, UTMs |
| `/negociacoes` | `app/(dashboard)/negociacoes/page.tsx` | Kanban com drag-and-drop, filtros de funil/status/responsável/ordem, busca |
| `/negociacoes/[id]` | `app/(dashboard)/negociacoes/[id]/page.tsx` | Detalhe do lead: stepper, tarefas, notas e histórico segmentado entre atividades e conversas |
| `/funis` | `app/(dashboard)/funis/page.tsx` | **Editor de etapas do funil** — fluxo com volume e retenção + CRUD de etapas |
| `/relatorios` | `app/(dashboard)/relatorios/page.tsx` | **Relatório de entrada de leads** por período e formulário |
| `/relatorios/ultimo-lead` | `app/(dashboard)/relatorios/ultimo-lead/page.tsx` | **Último lead recebido** com origem, respostas e timeline |
| `/tarefas` | `app/(dashboard)/tarefas/page.tsx` | Lista de tarefas com prioridade, vencimento e banner da próxima |
| `/atendimento` | `app/(dashboard)/atendimento/page.tsx` | WhatsApp em 3 colunas com realtime; troca de funil e etapa do lead sem sair da conversa; **Informações do Lead editáveis** |
| `/atendimento/configuracoes` | `app/(dashboard)/atendimento/configuracoes/page.tsx` | Conexão UAZAPI, QR Code, webhook, respostas rápidas |
| `/empresas` | `app/(dashboard)/empresas/page.tsx` | Lista de organizações com total de leads e inatividade |
| `/empresas/[id]` | `app/(dashboard)/empresas/[id]/page.tsx` | **Resumo da empresa** — KPIs, saúde da conta, evolução de leads, últimos leads, pessoas |
| `/contatos` | `app/(dashboard)/contatos/page.tsx` | CRUD de contatos com vínculo a negociações |
| `/pessoas` | `app/(dashboard)/pessoas/page.tsx` | Equipe, papéis e criação de usuários (service role) |
| `/formularios` | `app/(dashboard)/formularios/page.tsx` | Construtor de formulários de captura + **painel de ingestão externa (n8n)**, restrito a `org_admin` |
| `/perfil` | `app/(dashboard)/perfil/page.tsx` | Dados do usuário e completude do perfil |
| `/admin` | `app/(dashboard)/admin/page.tsx` | Visão global (somente admin global) |

Rotas públicas: `/login`, `/register`, `/onboarding`, `/f/[slug]`.

---

## Telas adicionadas nesta entrega

### Ingestão externa de leads (n8n) — `/formularios`

Segundo caminho de entrada automática de lead, ao lado da página pública
`/f/[slug]`. Quem chama é um fluxo do n8n — um por formulário — que adapta o
payload da origem (Meta Lead Ads, RD Station, planilha…) ao contrato canônico.

**Contrato — `POST /api/ingest/leads`**

```
headers: x-webhook-secret: wmv_…
body:    { "form_external_id": "xtehq3ca",
           "event_id": "<id do evento na origem>",
           "data":     { "name": "…", "email": "…", "phone": "…" },
           "metadata": { "r_lista": "PERGUNTA?: resposta
PERGUNTA?: resposta" } }
```

`data` é **filtrado** contra os campos cadastrados do formulário e alimenta
contato e negociação. `metadata` é **opcional**, guardado como veio e existe
para o atendente ler — é onde Typeform e Meta Lead Ads empacotam as respostas
do lead. Ver "Informações do Lead" abaixo.

O `form_external_id` costuma ser o id do formulário na origem (token do
Typeform, `form_id` do Meta). Aceita letras, números, hífen e sublinhado, de 3
a 64 caracteres, e é **sensível a caixa**: `Xtehq3ca` e `xtehq3ca` são
formulários diferentes, e colar com a caixa errada no n8n responde 404.

O segredo vai no **cabeçalho**, não na query: a URL é a mesma para toda a base
e entraria em log de acesso de proxy e servidor.

| Situação | Resposta |
|---|---|
| Sucesso | `200 { ok: true, duplicate: false }` |
| Mesmo `event_id` no mesmo formulário | `200 { ok: true, duplicate: true }`, nada é criado |
| Sem cabeçalho ou credencial desconhecida | `401` |
| Corpo fora do contrato | `400` com `details` (só nomes de campo) |
| Campo obrigatório do formulário ausente | `400` |
| `external_id` inexistente, **inativo** ou **de outra empresa** | `404`, indistinguíveis |
| Formulário sem funil configurado | `409` |

O `404` único é deliberado: distinguir os casos transformaria a rota num
verificador de quais identificadores existem na base e diria que um id
específico pertence a outra empresa. Quem configurou errado vê o motivo no log
do servidor.

**Isolamento.** A credencial resolve a *organização*; o `external_id` resolve o
*formulário*. A rota é obrigada a conferir que o formulário encontrado pertence
à organização da credencial — é essa única linha que separa as empresas, já que
a rota roda com `service_role` e o RLS não se aplica lá dentro.

**Idempotência.** A submissão é gravada **antes** de contato e negociação e é a
própria trava: o único parcial `(form_id, external_event_id)` recusa a segunda
entrega. Reservar primeiro fecha a janela em que duas retentativas simultâneas
criariam dois leads. Se a criação do lead falhar depois disso, a reserva é
apagada para que a retentativa do n8n consiga entrar — idempotência que engole
lead é pior que lead repetido.

**Funil e etapa** são sempre os configurados no formulário dentro do CRM. O
payload não os escolhe: origem externa não empurra lead para etapa arbitrária.
A resposta não inclui `deal_url`.

### Informações do Lead — `/negociacoes/[id]` e `/atendimento`

O bloco de respostas que o lead deu no formulário de origem, exibido para quem
vai atendê-lo. No detalhe do lead é o **primeiro card da coluna direita**, ao
lado de Negócio; no atendimento é um painel abaixo da negociação, carregado sob
demanda. Some por completo quando não há respostas e o usuário não pode
editá-las — lead manual ou vindo do WhatsApp não ganha caixa vazia.

O bloco é desenhado como o lead respondeu: uma linha por pergunta, resposta
logo depois dos dois-pontos. **UTM e formulário de origem ficam num card
separado**, abaixo: são dados de campanha, não respostas, e competiriam com o
que precisa ser lido primeiro. O **id da resposta** (`typeform_response_id`)
não é exibido — é token opaco de outro sistema; a referência visual é o id do
**formulário**, lido de `forms.external_id`.

**Edição.** O lápis no cabeçalho abre uma caixa com uma linha por informação,
no formato `pergunta: resposta`. `viewer` não vê o lápis, e a server action
recusa por conta própria. A escrita passa por `updateLeadInfoAction`
(`service_role`), porque `form_submissions` só tem policy de SELECT: abrir
`update` por RLS daria ao navegador poder de reescrever o registro do que a
origem enviou. A organização vem da sessão e é conferida contra o lead antes de
qualquer escrita, e o texto é gravado de volta na MESMA chave do `metadata`,
preservando UTM e enriquecimento.

**Histórico.** Toda edição grava um `activity_logs` do tipo
`lead_info_updated` com o que mudou, campo a campo
(`QUAL O SEU PLANO DE SAÚDE ATUAL?: UNIMED → AMIL`). A comparação é por
pergunta, não por posição: reordenar linhas não vira alteração; inclusões e
remoções aparecem como `(vazio) →` e `→ (removido)`.

**Leads sem formulário não são editáveis**: `form_submissions.form_id` é
obrigatório, então um lead criado à mão ou vindo do WhatsApp não tem registro
onde gravar.

**Por que `metadata` não passa por `form_fields`.** As perguntas mudam a cada
campanha do Typeform ou do Meta. Exigir que cada uma fosse recadastrada no CRM
significaria descartar em silêncio toda resposta a uma pergunta nova — o
oposto do que a tela existe para fazer. Por isso `metadata` é guardado como
veio, e a interpretação acontece só na leitura.

**Como o bloco é lido** (`lib/features/lead-ingestion/domain/lead-answers.ts`):

- O critério é a **forma do valor, não o nome da chave**: um valor com mais de
  uma linha em que a **maioria** delas tem `:` vira lista de respostas. Por
  isso `r_lista` (Typeform) e `r-lista` (Meta) funcionam sem que o código
  conheça nenhum dos dois nomes — e uma origem futura também funcionará. A
  regra da maioria (antes era "todas as linhas") existe porque uma resposta
  escrita em duas linhas pelo lead derrubava o bloco inteiro para os extras, e
  a tela passava a mostrar o nome cru da chave da origem como rótulo.
- A divisão é pelo **primeiro** `:`, porque as perguntas terminam em `?` ou `:`
  e são as respostas que costumam conter dois-pontos
  (`Custo do plano: Até R$ 4.000: negociável`).
- O resto do `metadata` (`typeform_response_id`, `ID_form`, `genero`…) vai
  para uma faixa secundária, com o rótulo humanizado.
- Valores vazios ou só com espaços são descartados: o `utm` chega como `""` ou
  `"  "` nos dois payloads reais.

Coberto por `npm run test:unit` (16 testes sobre os payloads reais de Typeform
e Meta Lead Ads, incluindo a ida e volta do texto editável e as regras do diff
que alimenta o histórico).

**Interface.** O painel *Ingestão externa de leads (n8n)* em `/formularios` é
renderizado apenas para `org_admin`/admin global — e a credencial nem é lida do
banco para os demais, para não entrar no payload do Server Component. Mostra
endpoint, credencial (oculta por padrão, com revelar/copiar), exemplo de corpo,
formulários já conectados e rotação com confirmação explícita, avisando que
todos os fluxos da empresa param até o valor novo ser colado. O campo
**Identificador de integração** fica no modal do formulário, disponível a quem
já pode editá-lo (`org_admin`, `seller`, `agent`); ele não dá acesso a nada
sozinho — sem a credencial, que só o administrador vê, não se escreve nada.
Colisão de identificador responde "já está em uso", nunca de quem.

### Histórico segmentado do lead — `/negociacoes/[id]`

O detalhe separa a operação comercial do conteúdo integral do WhatsApp no card
**Histórico do lead**:

- **Atividades** é a guia padrão e mostra criação, formulário, notas, tarefas,
  mudanças de etapa/funil/responsável/status, ganho, perda e arquivamento.
  Eventos `whatsapp_inbound` e `whatsapp_outbound` são filtrados no banco antes
  do limite de 50, então uma conversa longa não expulsa eventos comerciais da
  timeline.
- **Conversas (N)** só monta e consulta `whatsapp_messages` depois do clique.
  Carrega 50 mensagens por vez, sem `raw_payload`, e permite buscar páginas
  anteriores.
- Leads com mais de uma conversa mostram um seletor por número/conversa. No
  mobile, lista e thread são painéis alternados; no desktop ficam lado a lado.
- A thread é somente leitura e não zera mensagens não lidas. O CTA **Abrir no
  Atendimento** leva ao chat correto para responder.
- Mensagens internas do tipo `system` permanecem representadas como notas na
  timeline operacional e não são duplicadas na guia de conversas.
- As bolhas são compartilhadas com `/atendimento` por
  `components/whatsapp/message-thread.tsx`.

### Funil e etapa do lead no atendimento — `/atendimento`

O vendedor reposiciona o lead no funil sem sair da conversa. O controle fica no
cartão **Negociação**, no painel direito (`components/whatsapp/deal-stage-picker.tsx`).

- Dois `Select` — **Funil** e **Etapa** — abaixo do link da negociação.
- **Só etapas abertas.** Ganhar e perder continuam exclusivos de
  `/negociacoes/[id]`, onde há confirmação e motivo de perda. O atendimento
  nunca toca em `status`, `won_at`, `lost_at` ou `lost_reason_id`.
- Trocar o funil reposiciona a etapa para a primeira etapa aberta do destino e
  grava **funil e etapa no mesmo update** — gravar só o funil deixaria o lead
  numa etapa de outro funil e ele sumiria dos dois Kanbans.
- Funil sem etapa aberta aparece desabilitado na lista, com o motivo no rótulo;
  a escrita é recusada antes de acontecer.
- Salva sozinho ao escolher, com "Salvando…", confirmação em verde e erro em
  pt-BR por `describeWriteError`. Falha devolve os dois selects ao valor do
  servidor.
- Registra `deal_stage_history` e um `activity_logs` do tipo `stage_changed`,
  marcado com `origem: "atendimento"` e o id da conversa em `metadata`.
- Lead ganho, perdido ou arquivado aparece como dois `Badge` somente leitura,
  com o caminho para reabrir no detalhe. `viewer` vê os mesmos badges.
- **Criar lead desta conversa** passou a usar o funil `is_default` da `0012`,
  informa falhas na tela (inclusive a parcial, em que o lead foi criado mas não
  ficou vinculado) e mantém o vendedor na conversa.

### Administração de funis — `/funis`

Criar, renomear, tornar padrão e excluir funis. Tudo restrito a `org_admin` e
admin global, na tela e no banco (policies e RPCs da `0012`).

- **Novo funil**: modal com nome, descrição e o interruptor **Começar com
  etapas padrão** (ligado). Ligado cria `Lead Novo`, `Ganho` e `Perdido`;
  desligado cria só `Lead Novo` — funil sem etapa aberta não recebe lead,
  porque `deals.stage_id` é obrigatório. Vai pela RPC `create_pipeline`, numa
  transação só, e a tela abre o funil recém-criado.
- **Quem vira padrão é o banco**: o primeiro funil da empresa nasce padrão; um
  funil adicional nunca toma o posto. Trocar exige a ação **Tornar padrão**.
- **Renomear**: modal com nome e descrição. Zero linhas afetadas é tratado como
  recusa da policy, não como sucesso.
- **Excluir**: a tela consulta `pipeline_delete_blockers` **antes** e lista em
  português o que impede — funil padrão, único funil da empresa, negociações
  vinculadas, formulários apontando para ele. O botão de excluir só aparece
  quando não há impedimento. A exclusão em si vai pela RPC `delete_pipeline`,
  e as FKs `restrict` da `0012` são a última linha de defesa.
- **Estado vazio**: a ação de criação vive dentro do `EmptyState`. Antes o
  componente devolvia `EmptyState` antes do `PageHeader`, então uma empresa sem
  nenhum funil não tinha como criar o primeiro.

### Etapas do funil — `/funis`

Origem: era listado como "próximo passo" no `README.md`; agora existe.

- **Fluxo do funil**: um cartão por etapa com contagem de negociações, barra de
  volume relativo, valor em aberto e **retenção** (`volume da etapa ÷ volume da
  etapa anterior`, arredondado). A primeira etapa não exibe retenção.
- **Editor**: renomear (salva ao sair do campo), reordenar (setas ↑/↓), marcar a
  etapa como **Ganho** ou **Perdido** (mutuamente exclusivos), copiar o ID e
  excluir.
- **Reordenação**: os índices são normalizados para `0..n-1` e só as etapas cujo
  índice mudou são gravadas.
- **Exclusão bloqueada** quando a etapa tem negociações — a mensagem informa
  quantas precisam ser movidas antes (a FK `deals.stage_id` é `on delete
  restrict`).
- Marcar Ganho/Perdido é o que faz o Kanban fechar a negociação ao receber o card.

Dados: `pipelines`, `pipeline_stages`, view `pipeline_stage_stats`.

Permissões: desde a `0012`, **toda alteração de estrutura de funil exige
`org_admin`** (ou admin global) — criar, renomear, reordenar, marcar
Ganho/Perdido e excluir. `seller`, `agent` e `viewer` apenas leem, igual à
policy de RLS. Mover um lead entre etapas continua sendo trabalho de
`seller`/`agent`, no Kanban, no detalhe do lead ou no atendimento.

Acesso: item **Etapas** na barra do Kanban, ou `/funis?funil=<id>`.

### Relatório de entrada de leads — `/relatorios`

- KPIs fixos: leads hoje, ontem, últimos 7 e 30 dias — via `count exact/head`,
  sem transferir linhas.
- KPIs do período: último lead, tempo desde o último, formulários ativos e
  média por dia (`total do período ÷ dias do período`).
- Gráfico de barras com entrada diária, sem buracos de data.
- **Resumo rápido**: se a empresa está recebendo leads, último formulário, funil
  principal, etapa de entrada e responsável do último lead.
- **Leads recebidos**: tabela dos 100 mais recentes do período, com busca e
  filtro por formulário aplicados no cliente. Avisa quando há truncamento.
- **Top formulários**: ranking dos cinco que mais geraram leads no período.

Dados: `deals` (+ `contacts`, `pipeline_stages`, `pipelines`, `profiles`),
`form_submissions` para descobrir o formulário de origem, `forms`.

Filtro de período: `?periodo=hoje|7d|30d|mes` (padrão `7d`).

### Último lead recebido — `/relatorios/ultimo-lead`

- Cabeçalho com nome, status, temperatura, data, formulário, funil, etapa,
  responsável, canal, valor e tempo desde o recebimento.
- **Informações do lead**: contato + respostas do formulário (chaves `utm_*`
  omitidas, no máximo 12 campos).
- **Origem e entrada**: empresa, formulário, canal, data, funil, etapa, origem
  declarada e UTMs.
- **Timeline**: oito atividades mais recentes do lead.
- **Últimos leads recebidos**: seis entradas mais recentes.
- Estado vazio com ação para criar um formulário de captura.

Canal é derivado: existe submissão → `Formulário`; `source` contém "whatsapp" →
`WhatsApp`; senão o próprio `source` ou `Manual`.

### Resumo da empresa — `/empresas/[id]` (reformulada)

Antes: nome, quatro contadores e a lista de pessoas, calculados trazendo **todas**
as negociações da empresa. Agora:

- Identificação com segmento, responsável, e-mail do admin e status ativo/inativo.
- Oito KPIs: total de leads, últimos 7 dias, hoje, último lead, usuários,
  negociações abertas, ganhas/perdidas e taxa de conversão.
- **Saúde da conta**: última atividade, CRM em uso, formulários ativos e dias sem
  receber lead — cada linha com semáforo (verde/âmbar/vermelho).
- **Resumo rápido**: leads ativos no funil, formulários cadastrados, responsável
  principal, total em negociação e data do último lead.
- **Evolução de leads** por dia no período selecionado + **últimos leads**.
- Pessoas vinculadas com papel.

Dados: view `organization_deal_stats` (uma linha por empresa) + contagens
`head: true` + série diária do período.

---

## Banco de dados

Migrations em `supabase/migrations/`, aplicadas na ordem numérica:

| Arquivo | Conteúdo |
|---|---|
| `0001_schema.sql` | Tabelas principais, triggers, índices |
| `0002_forms_whatsapp.sql` | Formulários e WhatsApp |
| `0003_rls.sql` | RLS completa por organização |
| `0004_functions.sql` | Provisionamento e onboarding |
| `0005_security.sql` | Endurecimento (tokens fora do alcance do cliente) |
| `0006_api_grants.sql` | Grants da API |
| `0007_reload_postgrest_schema.sql` | Recarrega o cache de schema do PostgREST |
| `0008_expose_public_schema.sql` | Exposição do schema `public` |
| `0009_reporting.sql` | **Views agregadas e índices de relatório** |
| `0010_webhook_secret_por_instancia.sql` | Segredo de webhook por instância |
| `0011_visibilidade_leads_conversas.sql` | Visibilidade por responsável e conversa por instância |
| `0012_funis_padrao_e_administracao.sql` | **Funil padrão explícito e administração segura de funis** |
| `0013_coerencia_funil_etapa_do_lead.sql` | Guarda de coerência entre negociação, funil e etapa |
| `0014_ingestao_externa_de_leads.sql` | **Ingestão externa de leads (n8n)**: `forms.external_id`, credencial por organização e idempotência por formulário + evento |
| `0015_metadata_do_lead_e_external_id_com_maiuscula.sql` | **Respostas do lead** (`form_submissions.metadata`) e `external_id` aceitando maiúsculas |

### `0015_metadata_do_lead_e_external_id_com_maiuscula.sql`

Vinda do primeiro uso real da ingestão (Typeform e Meta via n8n).

- `form_submissions.metadata jsonb not null default '{}'` — o bloco que a
  origem enviou sobre o lead, guardado sem sanitização. `default '{}'` mantém
  correto todo o histórico anterior: nunca nulo, sem caminho especial na
  interface. Distinto de `raw_data`, que é o que o CRM entende e usa.
- `forms_external_id_format` reescrito para `^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$`.
  O padrão antigo é subconjunto do novo, então a troca não pode invalidar
  nenhuma linha existente. O índice único continua sobre a coluna crua e
  portanto **sensível a caixa** — decisão do cliente, para colar o id da
  origem exatamente como ele é.

> Coberta por 13 asserções no bloco 14 de `supabase/tests/migrations.mjs`.

### `0014_ingestao_externa_de_leads.sql`

Pré-requisito de `POST /api/ingest/leads`.

- `forms.external_id` — apelido do formulário colado no fluxo do n8n.
  Globalmente único (índice parcial `forms_external_id_key`, então formulários
  sem integração convivem) e com `check` de formato
  `^[a-z0-9][a-z0-9_-]{2,63}$`, porque o valor é digitado à mão em outro
  sistema.
- `organization_ingest_secrets` — uma credencial por organização, `default
  public.generate_webhook_secret()` (a mesma função da `0010`: prefixo `wmv_`,
  244 bits), única, **revogada de `anon` e `authenticated`** e com RLS ligado
  sem policy nenhuma. Só `service_role` alcança. Não fica em `organizations`
  pelo mesmo motivo da `0010`: aquela tabela é lida com `select *` em
  `getSessionContext()` e viaja inteira até `components/layout/top-nav.tsx`.
- `form_submissions.external_event_id` + `source` — único parcial
  `(form_id, external_event_id)` e `check (source in ('public_form',
  'external_ingest'))`. A chave é o **par**, nunca o evento sozinho: fluxos
  diferentes leem origens diferentes e podem reutilizar o mesmo identificador.
- Backfill de credencial para as organizações existentes. Organização criada
  depois recebe a sua sob demanda, na primeira vez que um `org_admin` gera pelo
  painel — segredo vivo sem dono é passivo, não patrimônio.

> Coberta por 20 asserções no bloco 13 de `supabase/tests/migrations.mjs`.

### `0012_funis_padrao_e_administracao.sql`

Pré-requisito da criação de funis pela interface. Sem ela, excluir um funil
apagava em cascata as negociações vinculadas e o "funil padrão" era apenas o
mais antigo por `created_at`.

- `pipelines.is_default` + índice único parcial `pipelines_default_por_org_idx`
  — no máximo um padrão por organização; para toda organização com funis,
  exatamente um. Backfill determinístico pelo funil mais antigo.
- `deals.pipeline_id` passou de `on delete cascade` para **`on delete restrict`**;
  `forms.pipeline_id`, de `on delete set null` para **`on delete restrict`**.
  Excluir funil nunca apaga nem desassocia dados.
- Policies de `pipelines` e `pipeline_stages` para insert/update exigem
  `is_org_admin`. Leitura continua para todo membro: `seller` e `agent`
  precisam enxergar funis e etapas para trabalhar seus leads.
- Triggers de invariante: o primeiro funil da organização nasce padrão e um
  adicional nunca vira; `is_default` só muda por `set_default_pipeline()`; o
  funil padrão e o último funil da organização não podem ser excluídos.
- RPCs (todas `security definer`, com checagem de `is_org_admin` na entrada e
  `execute` revogado de `PUBLIC`/`anon`): `create_pipeline`,
  `set_default_pipeline`, `delete_pipeline` e `pipeline_delete_blockers` — esta
  última devolve à interface o que impede a exclusão (negociações, formulários,
  padrão, último funil) para explicar o bloqueio sem erro cru do PostgREST.

> Consumidores do funil padrão: o webhook da UAZAPI e a criação de lead pela
> tela de atendimento resolvem o funil por `is_default`, nunca por
> `.order("created_at").limit(1)`. Formulários continuam usando o
> `pipeline_id` explicitamente configurado.

### `0009_reporting.sql`

Índices:

- `form_submissions_deal_idx` — descobrir o formulário de origem de uma negociação
- `deals_org_created_idx` — listagens e séries por data dentro da organização
- `whatsapp_conversations_deal_idx` — conversa vinculada a uma negociação

Views (ambas com `security_invoker = on`, portanto respeitam o RLS de quem
consulta — sem isso vazariam dados entre empresas):

| View | Colunas | Usada por |
|---|---|---|
| `organization_deal_stats` | `organization_id`, `deals_total`, `deals_open`, `deals_won`, `deals_lost`, `value_won`, `value_open`, `last_deal_at`, `last_activity_at` | `/empresas`, `/empresas/[id]` |
| `pipeline_stage_stats` | `stage_id`, `pipeline_id`, `organization_id`, `deals_total`, `deals_open`, `value_open` | `/funis` |

> As telas `/funis`, `/empresas` e `/empresas/[id]` dependem desta migration.
> Sem ela as consultas às views falham e os contadores aparecem zerados.

---

## Papéis e permissões

| Papel | Leitura | Escrita | Exclusão |
|---|---|---|---|
| Admin global | todas as organizações | sim | sim |
| `org_admin` | sua organização | sim | sim |
| `seller` | somente seus leads, conversas e interações | sim | só tarefas |
| `agent` | somente seus leads, conversas e interações | sim | só tarefas |
| `viewer` | sua organização | não | não |

Aplicado no banco por `has_org_access` / `has_org_write` / `is_org_admin`
(`0003_rls.sql`) e por `has_full_lead_visibility` / `can_access_deal` /
`can_access_conversation` (`0011`). O `viewer` conserva a visão completa da
organização, porém sem escrita; `org_admin` e admin global têm visão gerencial
de todas as conversas vinculadas ao lead, inclusive quando vieram de instâncias
e atendentes diferentes.

Desde a `0012` há uma fronteira a mais: **a estrutura do funil (criar, renomear,
tornar padrão, excluir funil; criar, editar, reordenar e excluir etapas) é
exclusiva de `org_admin` e do admin global.** `seller` e `agent` continuam
usando o funil e movendo seus próprios leads entre etapas — inclusive pelo
painel de atendimento —, mas não mudam a estrutura.

---

## Componentes compartilhados adicionados

| Componente | Arquivo | Uso |
|---|---|---|
| `PeriodFilter` | `components/crm/period-filter.tsx` | Pílulas Hoje / 7 dias / 30 dias / Este mês; grava `?periodo=` na URL |
| `DailyLeadsChart` | `components/crm/dashboard-charts.tsx` | Barras de entrada diária; reduz os rótulos do eixo em séries longas |
| `LeadsReportTable` | `components/crm/leads-report-table.tsx` | Tabela de leads com busca e filtro locais |
| `PipelineStagesClient` | `components/crm/pipeline-stages-client.tsx` | Administração de funis e editor de etapas |
| `DealStagePicker` | `components/whatsapp/deal-stage-picker.tsx` | Move o lead de funil/etapa dentro do atendimento; monte com `key` por conversa e lead |
| `firstOpenStage` | `lib/utils/index.ts` | Primeira etapa aberta de um funil (exclui ganho e perda); destino ao trocar de funil |
| `data-autofocus` | `components/ui/modal.tsx` | Marca no conteúdo do `Modal` para o foco pousar num campo em vez do painel |
| `buttonClasses` | `components/ui/button.tsx` | Dá aparência de botão a um `<Link>` sem aninhar `<button>` dentro de `<a>` |
| `resolvePeriod` / `dailySeries` | `lib/utils/period.ts` | Resolve o período da URL e monta a série diária contínua |
