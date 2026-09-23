# Inventário de funcionalidades — CRM JID Mídia

Estado real do produto. Recurso planejado fica em "Próximos passos" no
`README.md`, nunca aqui.

## Rotas autenticadas

| Rota | Arquivo | O que faz |
|---|---|---|
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | Métricas do funil: criadas/ganhas/perdidas, ticket, conversão, séries mensais, etapas, responsáveis, motivos de perda, UTMs |
| `/negociacoes` | `app/(dashboard)/negociacoes/page.tsx` | Kanban com drag-and-drop, badges e filtro por tag, filtros de funil/status/responsável/ordem, busca |
| `/negociacoes/[id]` | `app/(dashboard)/negociacoes/[id]/page.tsx` | Detalhe do lead: tags, stepper, tarefas, notas, **edição do contato vinculado** e histórico segmentado entre atividades e conversas |
| `/tags` | `app/(dashboard)/tags/page.tsx` | **Catálogo de tags de negociação**, restrito a `org_admin`/admin global. No menu lateral (Vendas → Tags) e pelo botão ao lado dos filtros de `/negociacoes` |
| `/funis` | `app/(dashboard)/funis/page.tsx` | **Editor de etapas do funil** — fluxo com volume e retenção + CRUD de etapas |
| `/relatorios` | `app/(dashboard)/relatorios/page.tsx` | **Relatório de entrada de leads** por período e formulário |
| `/relatorios/ultimo-lead` | `app/(dashboard)/relatorios/ultimo-lead/page.tsx` | **Último lead recebido** com origem, respostas e timeline |
| `/relatorios/carteira` | `app/(dashboard)/relatorios/carteira/page.tsx` | **Carteira de leads** — quem está esperando tratativa, paginada e ordenável |
| `/tarefas` | `app/(dashboard)/tarefas/page.tsx` | Lista de tarefas com prioridade, vencimento e banner da próxima |
| `/atendimento` | `app/(dashboard)/atendimento/page.tsx` | WhatsApp em 3 colunas com realtime; troca de funil e etapa do lead sem sair da conversa; **Informações do Lead editáveis** |
| `/atendimento/configuracoes` | `app/(dashboard)/atendimento/configuracoes/page.tsx` | **Saúde do recebimento**, conexão UAZAPI, QR Code, webhook, respostas rápidas |
| `/empresas` | `app/(dashboard)/empresas/page.tsx` | Lista de organizações com total de leads e inatividade |
| `/empresas/[id]` | `app/(dashboard)/empresas/[id]/page.tsx` | **Resumo da empresa** — KPIs, saúde da conta, evolução de leads, últimos leads, pessoas |
| `/contatos` | `app/(dashboard)/contatos/page.tsx` | CRUD de contatos com vínculo a negociações. O formulário é o `components/crm/contact-modal.tsx`, compartilhado com o detalhe do lead |
| `/pessoas` | `app/(dashboard)/pessoas/page.tsx` | Equipe, papéis e criação de usuários (service role) |
| `/distribuicao` | `app/(dashboard)/distribuicao/page.tsx` | **Distribuição automática de leads** — regras, participantes, pesos e auditoria (só `org_admin`). No menu lateral (Vendas → Distribuição) e pelo botão ao lado dos filtros de `/negociacoes` |
| `/relatorios/vendedores` | `app/(dashboard)/relatorios/vendedores/page.tsx` | **Rendimento por vendedor** — distribuição, conversão, tarefas e notas |
| `/relatorios/tags` | `app/(dashboard)/relatorios/tags/page.tsx` | **Métricas de tags** — totais, evolução e distribuição por responsável |
| `/formularios` | `app/(dashboard)/formularios/page.tsx` | Construtor de formulários de captura + **painel de ingestão externa (n8n)**, restrito a `org_admin` |
| `/perfil` | `app/(dashboard)/perfil/page.tsx` | Dados do usuário e completude do perfil |
| `/admin` | `app/(dashboard)/admin/page.tsx` | Visão global (somente admin global) |
| `/onboarding/{empresa,funil,equipe,whatsapp,ia,concluir}` | `app/onboarding/(etapas)/` | **Assistente de configuração inicial** (0030) — só `org_admin`/admin global. Ver "Configuração inicial" abaixo |
| `/ia` | `app/(dashboard)/ia/page.tsx` | **Agentes de IA** (prompt, modelo, ferramentas do CRM, qualificação, regras de transferência), **base de conhecimento** (RAG) e **atividade** de cada turno. Só `org_admin`/admin global |
| `/automacoes` | `app/(dashboard)/automacoes/page.tsx` | **Automações**: gatilho → condições → ações (WhatsApp, etapa, responsável, tag, tarefa, nota, temperatura, IA/humano, webhook) e **régua de follow-up**. Só `org_admin`/admin global |
| `/integracoes` | `app/(dashboard)/integracoes/page.tsx` | **Tokens de API**, endpoints REST, configuração **MCP**, callback da Meta e relógio das automações. No menu lateral (Inteligência), só `org_admin`/admin global |

## Rotas públicas

| Rota | Arquivo | O que faz |
|---|---|---|
| `/` | `app/page.tsx` | **Landing page pública** — hero com mock do Kanban, seis recursos, jornada do lead em quatro passos, dashboards e CTA final. Todo CTA aponta para `/login`. Visitante sem sessão fica aqui; o middleware manda quem já tem sessão para `/dashboard` |
| `/login` | `app/(auth)/login/page.tsx` | Entrada no CRM |
| `/register` | `app/(auth)/register/page.tsx` | Criação de conta |
| `/onboarding` | `app/onboarding/page.tsx` | Sem empresa: cria a primeira. Com empresa não configurada: leva ao primeiro passo pendente do assistente |
| `/f/[slug]` | `app/f/[slug]/page.tsx` | Formulário público de captura |

## APIs para integração (sem sessão; autenticação própria)

| Rota | Autenticação | O que faz |
|---|---|---|
| `POST /api/webhooks/uazapi` | segredo da instância (0010) | Mensagens da UAZAPI → contato, conversa, lead, mensagem; depois IA e automações |
| `GET/POST /api/webhooks/meta` | verify token = segredo da instância; `X-Hub-Signature-256` com `META_APP_SECRET` | API oficial da Meta: verificação, mensagens e status de entrega |
| `/api/v1/contacts`, `/pipelines`, `/deals`, `/deals/:id`, `/messages`, `/tools/:nome` | `Authorization: Bearer jid_…` escopo `api` (0029) | REST para n8n e sistemas externos — mesmas ferramentas do MCP e da IA |
| `POST /api/mcp` | `Bearer jid_…` escopo `mcp` | Servidor MCP (Streamable HTTP, sem estado): `initialize`, `tools/list`, `tools/call` |
| `GET/POST /api/cron/automations` | `Bearer $CRON_SECRET` | Drena a fila de eventos de todas as empresas e roda a régua de follow-up |
| `POST /api/automations/dispatch` | sessão (não é pública) | Drena a fila da empresa logada; chamada pelo Kanban após mover card |

A organização sai SEMPRE da credencial (segredo, assinatura + `phone_number_id`,
token) — nunca do corpo da requisição.

## IA, automações e canais (0026–0029)

**Turno do agente** (`lib/features/ai-agent/application/run-agent-turn.ts`):
mensagem recebida → espera curta (o turno da mensagem mais nova vence) →
gatilhos de transferência (pedido de humano, jurídico, etapa "Só humano") →
modelo com ferramentas do CRM → gatilho de incerteza → resposta pelo canal →
linha em `ai_runs`. Roda em `after()`, depois de o webhook responder.

**Ferramentas do CRM** (`lib/features/crm-tools`): uma implementação por
ferramenta, três portas (IA, MCP, API v1). No turno da IA o lead vem da
conversa e vence o id do argumento.

**Atendimento IA ↔ humano**: conversa nova começa com a IA quando há agente
padrão ativo com "Assumir conversas novas". A equipe assume pelo botão do
cabeçalho do chat, respondendo pela tela ou pelo celular (eco `fromMe` não
reconhecido como envio nosso). Devolver à IA com o lead aguardando dispara um
turno na hora.

**Automações**: triggers Postgres gravam `crm_events` para TODO caminho de
escrita (Kanban no navegador, detalhe, IA, API). O motor drena a fila no
webhook, no Kanban (`/api/automations/dispatch`) e no cron. Idempotência por
`automation_runs (rule_id, dedupe_key)`; antilaço de 60 s por regra/lead.

**Follow-up**: gatilho `conversation.no_reply` com horas e passo. A régua
avança em `whatsapp_conversations.followup_count` e recomeça quando o lead
responde (trigger da 0027).

**Canais**: `lib/features/channels/infrastructure/channel-gateway.ts` é a única
porta de envio; escolhe UAZAPI ou Meta pelo `provider` da instância da
conversa. Fora da janela de 24h a Meta só aceita template (ação "Enviar
WhatsApp" aceita nome e idioma do template).

---

## Navegação lateral e configuração inicial (23/09/2026)

**Menu lateral** (`components/layout/app-shell.tsx`, `sidebar.tsx`,
`nav-links.ts`) substitui o menu superior. Grupos: início (Dashboard,
Tarefas), Vendas, Atendimento, Captação, Análise, Inteligência e Organização.
Itens de administração (`/funis`, `/tags`, `/distribuicao`, WhatsApp, `/ia`,
`/automacoes`, `/integracoes`, Configuração inicial) só aparecem para
`org_admin`/admin global; `/admin` só para admin global. **A proteção continua
nas rotas** — o menu apenas não leva ninguém a um beco. Os três badges de
atenção foram mantidos com as mesmas regras.

**Configuração inicial** (`/onboarding/*`, `lib/features/onboarding`):

| Passo | O que grava | Observação |
|---|---|---|
| Empresa | `organizations.name`, `segment`, `logo_url` | Logo só `https://` |
| Funil | `apply_onboarding_pipeline()` (0030) | 7 modelos por segmento, editáveis. Só troca o funil padrão **virgem** (sem negociação, formulário ou automação ligada a etapa); caso contrário manda para `/funis` |
| Equipe | reutiliza `PeopleClient` / `createMemberAction` | |
| WhatsApp | reutiliza `InstanceSettings` | |
| IA | nada — leva a `/ia` | Mostra se há agente ativo e se a chave do provedor existe |
| Concluir | `organizations.onboarded_at` | Resumo confere o que existe de fato, não só o que foi clicado |

Cada passo grava `"done"` ou `"skipped"` em `organizations.onboarding_steps`.
Quem cai no assistente: `org_admin` **membro** de empresa com
`onboarded_at is null`, ao abrir `/dashboard` (destino do login). O gate não
fica no layout para os atalhos do próprio assistente (`/ia`,
`/atendimento/configuracoes`) não voltarem em círculo. Sem a `0030` aplicada,
`onboarded_at` não existe e vale como "configurada": ninguém fica preso.
Empresas existentes são marcadas como configuradas pela própria migration.

## Telas adicionadas nesta entrega

### Contato do lead — `/negociacoes/[id]` e `/contatos`

O contato vinculado à negociação é editável a partir do próprio detalhe, pelo
botão "Editar contato" no card. O formulário é um só —
`components/crm/contact-modal.tsx` — usado também em `/contatos`; um segundo
formulário divergiria do primeiro com o tempo.

- `viewer` é somente leitura: não vê o gatilho em nenhuma das duas telas, e a
  RLS (`has_org_write`) recusa a escrita mesmo pelo PostgREST direto.
- Toda escrita filtra `organization_id` e usa `.select()`; zero linhas é falha,
  com mensagem em português.
- **Trocar o `whatsapp_phone` tem consequência:** o webhook da UAZAPI casa a
  conversa recebida com `contacts.whatsapp_phone` por igualdade exata. As
  conversas antigas continuam vinculadas, mas mensagens novas do número antigo
  deixam de casar e o webhook cria um contato duplicado. O modal avisa quando o
  número muda; ele não reconcilia as conversas.

### Tags de negociação — `/tags`, `/negociacoes`, `/atendimento` e `/relatorios/tags`

Tags representam situações operacionais que a equipe precisa marcar durante o
atendimento, como "Aguardando documento". O catálogo é por organização e só
`org_admin`/admin global administra nomes, categoria, cor e estado ativo.

- No detalhe do lead e no atendimento, `org_admin`, `seller` e `agent` aplicam
  o conjunto de tags pela RPC transacional `set_deal_tags`; `viewer` só lê.
- Tags inativas permanecem nos leads antigos e nos relatórios, mas não podem
  ser aplicadas novamente.
- O card do Kanban mostra até três badges e um contador para as restantes. O
  filtro seleciona uma tag por vez e preserva todos os badges do card filtrado.
- O relatório usa agregações do banco: totais/status/valor por tag, evolução de
  uma tag no período e distribuição por responsável. Uma negociação com várias
  tags aparece em várias linhas; somá-las não produz o total único de leads.
- A comparação por responsável só aparece para papéis com visão completa da
  equipe, como determina `deal_tag_by_responsible`.

### Distribuição automática de leads — `/distribuicao`

Restrita a `org_admin`/admin global; os demais veem um estado vazio explicando
a quem pedir. Configura **quem recebe cada lead que entra**, nos três caminhos
(formulário público, integração n8n e WhatsApp).

- **Regras por prioridade.** Avaliadas de cima para baixo; a primeira que casa
  vence. Condições: **origem** e **formulário**, em branco = qualquer,
  combinadas com E. A **regra padrão** é sempre a última e não aceita condições
  (o banco recusa) — ela existe para receber o que nenhuma outra pegou, e não é
  excluível pela tela: sem ela o lead volta a nascer órfão.
- **Participantes e peso** (1..100). O card mostra a **ordem de entrega da
  volta** — a mesma sequência que o motor monta —, o que torna "peso 2" uma
  promessa verificável em vez de um número abstrato. Regra sem participante
  avisa, em amarelo, que os leads dela entrarão sem responsável.
- **`viewer` não aparece como opção**: a `0016` recusa no banco, e botão que o
  banco vai recusar não deve existir na tela.
- **Histórico de distribuição** com filtro "só os sem responsável". O número de
  candidatos e o número do rodízio ficam no `title`, permitindo conferir a
  escolha meses depois mesmo que a regra tenha mudado ou a pessoa saído.

### Rendimento por vendedor — `/relatorios/vendedores`

Relatório de gestão: `org_admin`, `viewer` e admin global. `seller`/`agent`
veem um estado vazio — quem não enxerga os leads dos outros (0011) não deveria
enxergar os números deles.

- KPIs do período: leads distribuídos, **sem responsável** (com link para
  corrigir a configuração), quantos estão no rodízio e a conversão da equipe.
- Tabela por pessoa: **peso ao lado dos recebidos** — a leitura pretendida é
  comparar os dois, porque peso igual com recebimento muito diferente denuncia
  configuração que não faz o que o admin acha que faz —, barra comparativa,
  em aberto, ganhos, perdidos, conversão, valor ganho, tarefas pendentes (com
  contagem de vencidas) e notas escritas no período.
- **Conversão é sobre o que FECHOU**, não sobre o total recebido: lead em
  aberto não é fracasso, e dividir por ele puniria quem acabou de receber.
- Quem está fora do rodízio aparece com o selo "Fora" — é a explicação de
  "fulano não está recebendo nada".

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

- **Quebras de linha escapadas são desfeitas primeiro.** O n8n entrega o bloco
  com `
` literal (barra invertida + `n`), não com quebra real — no dado de
  produção, 464 caracteres numa linha só. Sem isso nada mais funciona.
- O critério é a **forma do valor, não o nome da chave**: todo valor com mais
  de uma linha vira lista de respostas. Por
  isso `r_lista` (Typeform) e `r-lista` (Meta) funcionam sem que o código
  conheça nenhum dos dois nomes — e uma origem futura também funcionará. A
  A regra é absoluta, e não uma heurística sobre o conteúdo, porque o nome
  técnico da chave (`r_lista`) **nunca** pode aparecer na tela: enquanto a
  classificação dependia do conteúdo, qualquer dado fora do previsto o trazia
  de volta. Valor de uma linha só continua sendo par rotulado — é o caso da
  UTM, onde o rótulo ajuda.
- A divisão é pelo **primeiro** `:`, porque as perguntas terminam em `?` ou `:`
  e são as respostas que costumam conter dois-pontos
  (`Custo do plano: Até R$ 4.000: negociável`).
- O resto do `metadata` (`typeform_response_id`, `ID_form`, `genero`…) vai
  para uma faixa secundária, com o rótulo humanizado.
- Valores vazios ou só com espaços são descartados: o `utm` chega como `""` ou
  `"  "` nos dois payloads reais.

Coberto por `npm run test:unit` (24 testes sobre os payloads reais de Typeform
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

### Carteira de leads — `/relatorios/carteira`

Responde a pergunta do administrador: **quem está esperando por nós?**

Uma tabela serve a duas perguntas. `?ordem=parados` (padrão) lista quem está há
mais tempo sem tratativa; `?ordem=recentes` é a lista de últimos leads
recebidos, paginada. Por isso `/relatorios/ultimo-lead` perdeu a tabela do
rodapé — o produto teria três listas de lead, com filtros divergindo.

**A definição de tratativa é o contrato central desta tela**, e ela une duas
fontes:

1. `activity_logs` nos tipos de trabalho da equipe — `whatsapp_outbound`,
   `note`, `task_created`, `task_done`, `stage_changed`, `responsible_changed`,
   `lead_info_updated`, `deal_won`, `deal_lost`, `deal_archived`;
2. **`whatsapp_messages.direction = 'outbound'`**, alcançado por
   `whatsapp_conversations.deal_id`.

A segunda **não é opcional**: o webhook só grava `activity_logs` quando
`!msg.fromMe`, e em 31/08/2026 havia 466 mensagens enviadas contra 4 logs do
tipo. As respostas que a equipe manda pelo próprio celular só existem em
`whatsapp_messages`.

Ficam **fora** de tratativa: `whatsapp_inbound` (é o lead falando — alimenta a
coluna "lead falou", nunca a de tratativa), `lead_assigned` (a máquina
distribuindo; lead distribuído e nunca tocado é o alvo do relatório),
`form_submission` e `deal_created` (a entrada — contá-los daria a todo lead novo
um toque falso em t=0).

É **lista de inclusão**, nunca de exclusão: todo tipo novo precisa ser
classificado de propósito na `0025`. Lista desatualizada gera alarme falso, que
alguém percebe; exclusão gera falso negativo silencioso.

Situações, e a ordem é a da gravidade:

| Situação | Significado |
|---|---|
| `nunca_tratado` | nenhuma tratativa; o relógio corre desde a criação |
| `aguardando_resposta` | o lead falou **depois** da última tratativa |
| `sem_retorno` | a equipe falou por último e passou do limiar |
| `em_dia` | tratado dentro de 3 dias |

Contratos que precisam permanecer:

- **`aguardando_resposta` vence qualquer prazo.** Alguém está esperando agora,
  e isso é pior que silêncio mútuo — mesmo que faça duas horas.
- **Nunca tratado conta desde a criação**, não desde sempre. Ordenar como
  infinito jogaria para o topo, todo dia, o lead que entrou há cinco minutos.
- **Os KPIs medem a carteira inteira, não a página** — senão o número muda
  conforme se navega.
- **`stage_changed` conta como tratativa**, e o tipo da última tratativa
  aparece na célula: arrastar cards numa arrumação de segunda "trata" leads sem
  ninguém falar com ninguém. Mostrar o tipo deixa o administrador julgar.
- **A tabela ordena leads, não pessoas.** Nada colore o nome do responsável por
  atraso nem soma atrasos por vendedor — esse número é de
  `/relatorios/vendedores`, com o contexto dele.
- **A lista não agrupa duplicatas**; contato com mais de uma negociação ganha
  um marcador. Duas entradas do mesmo contato são dois recebimentos reais.
- **`seller`/`agent` veem a mesma tela recortada nos próprios leads**, sem a
  coluna Responsável. A RPC reimplementa a `0011` no recorte de `deals`, então
  os números deles são corretos, não parciais.
- Limiares fixos: 3 dias (atenção) e 7 dias (crítico), **corridos**.

### Indicadores de atenção — menu superior e `/negociacoes`

Respondem "o que está esperando por mim?". São **três números derivados** do
dado que já existe; não há tabela de notificações, não há evento persistido e
não há estado de "lida" — por isso um badge nunca aponta para trabalho já
feito. A regra vive em `lib/features/notifications/domain/attention.ts`,
coberta por `npm run test:unit`.

| Indicador | Onde | O que conta |
|---|---|---|
| Tarefas vencidas | badge vermelho em **Tarefas** | minhas, `status='pending'`, `due_at` no passado |
| Conversas aguardando | badge em **Atendimento** + pílula no Kanban | `unread_count > 0`, minhas ou sem responsável |
| Leads novos | badge em **Negociações** + toast | `status='open'`, últimas 24h, meus ou sem responsável |

Contratos que precisam permanecer:

- **O recorte é "meu" para todos os papéis, inclusive `org_admin`**, mais a
  fila sem responsável. A soma da organização produziria um número que depende
  de a equipe inteira trabalhar, nunca chegaria a zero e mataria o badge por
  irrelevância. O total da empresa é métrica de gestão e vive em `/atendimento`
  com filtro e nos relatórios.
- **`viewer` não vê nenhum indicador.** Mecânica, não hierarquia: ele não
  conclui tarefa e não zera `unread_count` (barrado de propósito em
  `whatsapp-client.tsx`), então os contadores dele subiriam para sempre.
  Continua vendo o banner de saúde da entrada, que é estado e não convocação.
- **O badge conta conversas, não mensagens.** A soma de mensagens só aparece
  na frase da pílula do Kanban.
- **`null` é "não sei" e esconde o badge; zero também não desenha.** No Kanban
  a pílula é a exceção: em zero ela vira "Atendimento em dia", porque elemento
  que desaparece deixa dúvida sobre estar em dia ou quebrado.
- **O Realtime é otimização de latência, não fonte da verdade.** Só
  `whatsapp_conversations` é assinada (publicada pela `0021`); leads e tarefas
  reconciliam no foco da janela e a cada 60 s. Desligar o Realtime deixa o
  contador lento, nunca errado.
- **`deals` não é publicada no Realtime**, de propósito: é escrita a cada
  arraste de card no Kanban.
- **Tarefa vencida nunca terá Realtime** — ela vence pela passagem do relógio,
  sem nenhuma linha mudar no banco.
- **Um provider, um canal por aba, uma contagem.** O badge do menu e a pílula
  leem do mesmo valor; duas assinaturas divergiriam em minutos.
- **Nada tem botão de dispensar**, e o toast nunca dispara na primeira leitura
  da aba: abrir o CRM com sete leads das últimas 24h é estado, não chegada.
- A pílula **nunca** dispara `router.refresh()`: o Kanban usa `dnd-kit` com
  estado local, e revalidar no meio de um arraste puxa o tapete do usuário.

### Saúde da entrada de leads — `/atendimento/configuracoes`, `/formularios`, `/dashboard` e `/atendimento`

Responde à pergunta que a operação faz todo dia: **"entrou alguma coisa?"**. O
CRM tem três entradas — webhook da UAZAPI, `POST /api/ingest/leads` (n8n) e o
formulário público `/f/[slug]` — e nenhuma declarava o próprio estado até aqui.
A regra vive em `lib/features/lead-ingestion/domain/ingestion-health.ts`, é pura
e coberta por `npm run test:unit`.

- **Painel "Recebimento"** em `/atendimento/configuracoes`, antes do formulário
  de conexão: os três canais com semáforo, o tempo relativo, a data absoluta em
  `America/Sao_Paulo` e o que fazer a respeito. É onde o problema se conserta.
- **Banner** em `/dashboard` e `/atendimento`, que é onde a equipe já está. O
  painel sozinho não bastaria: ninguém abre configurações sem já suspeitar de
  alguma coisa. Não tem botão de dispensar — some quando o canal volta a
  receber, e só então.
- **Linha por formulário** no painel n8n de `/formularios`: ali a pergunta é
  qual **fluxo** parou, não se a integração está viva.

Estados, e quais alertam:

| Estado | Significado | Alerta? |
|---|---|---|
| `receiving` | dentro do limiar | não |
| `silent` | passou do limiar e ainda é recente | **sim** |
| `dormant` | parou há tanto tempo que virou decisão | não |
| `never_received` | configurado, nada chegou ainda (implantação) | não |
| `not_configured` | não há integração | não |
| `unknown` | a leitura falhou | não |

Limiares fixos: **48 h** para WhatsApp; **7 dias** para n8n e formulário
público, que entram em rajada. Depois de `limiar + 30 dias` o canal vira
`dormant`.

Contratos que precisam permanecer:

- **A tela afirma ausência, nunca falha.** "Nenhuma entrada há 4 dias", jamais
  "integração com falha": o dado não distingue integração quebrada de semana
  fraca. Há teste prendendo a redação.
- **A última entrada do WhatsApp sai de `whatsapp_messages` com
  `direction = 'inbound'`**, nunca de `whatsapp_conversations.last_message_at`
  — o envio também escreve nessa coluna, e foi essa contaminação que escondeu o
  incidente de 26/08 por quatro dias.
- **`seller`/`agent` não veem o indicador.** Sob a `0011` eles leem apenas as
  próprias conversas; a mesma consulta diria "12 dias sem receber" para um
  vendedor num dia quieto. `org_admin`, `viewer` e admin global veem — `viewer`
  sem CTA de conserto, porque a URL do webhook carrega o segredo da instância.
- **Erro de leitura vira `unknown`**, nunca `never_received`. Um indicador de
  falha silenciosa que responde com falso conforto quando ele mesmo falha não
  vale nada.
- O `HealthRow` é compartilhado (`components/crm/health-row.tsx`) com a saúde
  da conta de `/empresas/[id]`.

### Atualização em tempo real — `/atendimento`

Dois canais Supabase Realtime, com papéis distintos
(`components/whatsapp/whatsapp-client.tsx`). Ambos dependem da `0021`: sem as
tabelas na publicação, os canais conectam e nunca recebem evento.

- **`wa-<conversa>`** — INSERT em `whatsapp_messages` filtrado pela conversa
  aberta. Acrescenta a bolha na thread, ignorando o id que já está na lista
  (o envio pela própria tela já a inseriu).
- **`wa-conversas-<organização>`** — qualquer mudança em
  `whatsapp_conversations` da organização. Dispara `router.refresh()` com
  debounce de 700 ms, e é o que move o **não lido**, a **ordem** da lista e a
  **conversa nova**. Sem ele, mensagem em conversa fechada não muda nada na
  tela.
- O refresh reaproveita a lista do Server Component em vez de espelhar a linha
  em estado local: remontá-la no cliente seria reimplementar a visibilidade por
  responsável da `0011`, e errar nisso mostra a conversa de um vendedor para
  outro. O rascunho em digitação e a conversa aberta sobrevivem ao refresh.
- O debounce existe porque cada mensagem gera INSERT em `whatsapp_messages` e
  UPDATE em `whatsapp_conversations` quase juntos; numa rajada seria um refresh
  por evento.

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
| `0026_agentes_de_ia_e_base_de_conhecimento.sql` | `ai_agents`, `knowledge_documents`, `knowledge_chunks` (pgvector 1536 + HNSW), `ai_runs`, `match_knowledge_chunks` (só service_role) |
| `0027_canais_e_atendimento_por_ia.sql` | Meta Cloud API em `whatsapp_instances`; modo IA/humano, handoff e follow-up em `whatsapp_conversations`; `sender_type`/`delivery_status` em mensagens; `pipeline_stages.requires_human`; `deals.ai_qualification`; trigger do estado da última mensagem |
| `0028_eventos_e_automacoes.sql` | `crm_events` (fila), `automation_rules`, `automation_runs`, triggers de eventos em `deals` e `whatsapp_messages`, `claim_crm_events`/`requeue_stale_crm_events` (só service_role) |
| `0029_tokens_de_api.sql` | `api_tokens` (SHA-256, escopos `api`/`mcp`, revogação sem delete) |
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
| `0016_distribuicao_automatica_de_leads.sql` | Regras e auditoria da distribuição automática |
| `0017_fila_ordenada_e_plantao.sql` | Fila ordenada, peso consecutivo e plantão |
| `0018_auditoria_da_distribuicao.sql` | Preservação da auditoria e reparo de posições |
| `0019_tags_de_negociacao.sql` | **Catálogo, vínculos N:N e três RPCs de métricas de tags** |
| `0020_set_deal_tags_preserva_tag_inativa.sql` | `set_deal_tags` deixa de esbarrar na guarda de tag inativa ao preservar vínculo existente |
| `0021_realtime_do_atendimento.sql` | **`whatsapp_messages` e `whatsapp_conversations` publicadas em `supabase_realtime`** |
| `0022_indice_da_ultima_entrada.sql` | Índice parcial da última mensagem recebida por organização |
| `0023_indice_das_tarefas_do_responsavel.sql` | Índice parcial das tarefas pendentes por responsável |
| `0024_contato_unico_por_whatsapp.sql` | **Reparo das duplicatas de contato e índice único `(organization_id, whatsapp_phone)`** |
| `0025_carteira_sem_tratativa.sql` | **RPC da carteira de leads** e índice `activity_logs (deal_id, type, created_at desc)` |

### `0021_realtime_do_atendimento.sql`

A publicação `supabase_realtime` do projeto estava **vazia**. A assinatura
`postgres_changes` de `/atendimento` conectava e nunca recebia evento: a
mensagem entrava no banco e a tela só a mostrava ao recarregar a página.

- Publica `whatsapp_messages` (thread da conversa aberta) e
  `whatsapp_conversations` (lista lateral: não lido, ordem e conversa nova).
- **Idempotente por consulta ao catálogo** — `alter publication ... add table`
  numa tabela já publicada é erro. Cria a publicação quando ela não existe (é o
  que permite provar a migration no PGlite do `npm run test:db`) e não faz nada
  quando ela é `for all tables`.
- `REPLICA IDENTITY` fica no padrão: o payload de INSERT/UPDATE já traz a linha
  nova, a única que o cliente lê. `full` acrescentaria a linha antiga a cada
  update e dobraria o WAL para carregar o `raw_payload` que ninguém consome.
- **Não afrouxa o RLS.** O Realtime avalia as policies da `0011` por assinante
  antes de entregar o evento: quem não pode dar `select` na linha não recebe a
  notificação dela.
- Se o painel recusar com `must be owner of publication`, o mesmo efeito está no
  Dashboard, em Database → Replication.

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
  `getSessionContext()` e viaja inteira até `components/layout/app-shell.tsx`.
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

Desde a `0026`–`0029`: **agentes de IA, base de conhecimento, automações e
tokens de API são configurados só por `org_admin`/admin global.** `seller` e
`agent` passam a conversa entre IA e equipe nas conversas que já acessam;
`viewer` só acompanha. Trechos de conhecimento, turnos da IA, fila de eventos e
execuções são escritos apenas pelo servidor (sem policy de escrita e com
`revoke` para `authenticated`).

---

## Componentes compartilhados adicionados

| Componente | Arquivo | Uso |
|---|---|---|
| `PeriodFilter` | `components/crm/period-filter.tsx` | Pílulas Hoje / 7 dias / 30 dias / Este mês; grava `?periodo=` na URL |
| `DailyLeadsChart` | `components/crm/dashboard-charts.tsx` | Barras de entrada diária; reduz os rótulos do eixo em séries longas |
| `LeadsReportTable` | `components/crm/leads-report-table.tsx` | Tabela de leads com busca e filtro locais |
| `PipelineStagesClient` | `components/crm/pipeline-stages-client.tsx` | Administração de funis e editor de etapas |
| `DealStagePicker` | `components/whatsapp/deal-stage-picker.tsx` | Move o lead de funil/etapa dentro do atendimento; monte com `key` por conversa e lead |
| `DealTagsSelector` | `components/crm/deal-tags-selector.tsx` | Exibe e grava o conjunto de tags no detalhe do lead e no atendimento |
| `firstOpenStage` | `lib/utils/index.ts` | Primeira etapa aberta de um funil (exclui ganho e perda); destino ao trocar de funil |
| `data-autofocus` | `components/ui/modal.tsx` | Marca no conteúdo do `Modal` para o foco pousar num campo em vez do painel |
| `buttonClasses` | `components/ui/button.tsx` | Dá aparência de botão a um `<Link>` sem aninhar `<button>` dentro de `<a>` |
| `resolvePeriod` / `dailySeries` | `lib/utils/period.ts` | Resolve o período da URL e monta a série diária contínua |
