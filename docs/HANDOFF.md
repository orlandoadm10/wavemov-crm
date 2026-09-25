# Passagem de serviço — CRM JID Mídia

Leia este arquivo primeiro. As regras canônicas de trabalho estão em
`docs/ENGINEERING_STANDARDS.md`; consulte também `DESIGN_GUIDE.md` para UI,
`docs/FUNCIONALIDADES.md` para contratos funcionais e `docs/CHANGELOG.md` para
o histórico detalhado.

**Atualizado em:** 25/09/2026 (fontes de lead publicadas; design Jidianos etapa 1 em `feat/design-jidianos-base`)

**Versão:** `0.2.0`

**Repositório:** `https://github.com/orlandoadm10/wavemov-crm`

**Produção:** `https://wavemov-crm.vercel.app`
**Supabase:** `crmjidbr` (`qzdcxyhvvikmtupouzlm`)

## Estado ao encerrar o dia

| Item | Estado |
|---|---|
| `main` / produção | `6279451` (PR #18, senha) — deploy `Ready` em 23/09/2026. Este PR de documentação + correção de Integrações entra por cima |
| Banco | migrations `0001` a `0031` aplicadas e **registradas no ledger** (0026–0031 registradas por Claude em 23/09, depois de conferidos os objetos) |
| Variáveis (Vercel, Production) | `AI_API_KEY`, `AI_BASE_URL`, `AI_DEFAULT_MODEL`, `CRON_SECRET` criadas em 23/09. Não estão em Preview |
| Supabase Auth (produção) | **Pendente, no painel:** Redirect URL `https://wavemov-crm.vercel.app/**` e SMTP próprio — ver "Senha" abaixo |
| Diferença | Nenhum código fora de `main` além deste PR |
| WhatsApp | **Restaurado em 31/08.** URL nova colada no painel da UAZAPI; tráfego real dos dois lados confirmado no banco |
| Ramo em uso | `main`. Ramos já mergeados e apagáveis: `fix/isolamento-webhook-uazapi`, `fix/mobile-lote-1-grids`, `feat/ia-automacoes-canais`, `feat/filtros-negociacoes`, `fix/nome-do-lead-whatsapp`, `chore/imports-nao-usados`, `feat/senha`, `docs/handoff-publicacao-0030` |

O push `2d23f73..316a2b6` em `main` foi concluído em 28/08/2026 e disparou o
deploy de produção automaticamente. O alias `https://wavemov-crm.vercel.app`
aponta para o deployment acima. Nenhuma migration foi aplicada nessa
publicação; o banco permaneceu em `0001..0020`. Não há tag Git para a versão
`0.2.0`.

### Ambiente local desta sessão

O `.env.local` foi **apontado para o Supabase local do Docker**
(`127.0.0.1:54321`), não para a nuvem. Os valores de produção estão preservados
em linhas comentadas dentro do próprio arquivo; para voltar à nuvem, basta
trocá-las de volta. O banco local foi resetado e tem `0001..0020` — foi ali que
a `0020` ganhou prova em Postgres real, além do pglite.

Isso importa: com o `.env.local` apontando para a nuvem, `npm run dev` escreve
**nos dados reais do cliente**. Confira o arquivo antes de subir o app.

## Design Jidianos — 25/09/2026, ramo `feat/design-jidianos-base`

`DESIGN_GUIDE.md` é o guia novo (Jidianos). Leia a **seção 0** antes de tudo:
ela diz o que se adota (a linguagem visual inteira) e o que não (menu,
telas e rótulos do Jidianos). O guia antigo está em `docs/DESIGN_GUIDE_v1.md`.

Plano aprovado pelo P.O., uma entrega por etapa:

1. **Base** — feita neste ramo: tokens claro/escuro, fontes, fundo, sombras e
   `components/ui/`. Detalhe no `CHANGELOG` de 25/09.
2. **Estrutura** — sidebar azul recolhível (256/72 px), cabeçalho translúcido,
   barras roláveis no celular.
3. **Telas**, da mais usada à menos: Kanban (colunas de 290 px / 85vw com a cor
   da etapa, cartão, "Mover para…"), **gaveta do lead** no lugar da página
   `/negociacoes/[id]`, visão em lista, Atendimento, restante.
4. **Varredura** dos critérios da seção 22, com `scrollWidth === 390`.

Contratos da transição:

- **Código novo usa os tokens semânticos** (`bg-card`, `text-foreground`,
  `text-muted-foreground`, `border-border`, `bg-primary`…). Os nomes v1
  (`ink`, `line`, `primary-50…900`) são aliases e somem ao fim da etapa 3.
- **Não ofereça a alternância de tema antes da etapa 4.** Cada tela migrada
  sai sem `bg-white`/`slate-*`/`rose-*`/`emerald-*`/`amber-*` fixos; é isso
  que a libera. Para conferir uma tela no escuro durante a migração:
  `document.documentElement.classList.add('dark')` no console.
- **`primary-700…900` como FUNDO escuro** (painel da tela de login, blocos da
  landing) clareia no modo escuro, porque o alias mistura o azul com o
  `foreground`. Na migração da tela, troque por `bg-sidebar` ou
  `bg-gradient-brand`.

## Fontes de lead (Fase 1) — 25/09/2026, publicada

Pedido do P.O.: o cliente precisa ligar Facebook Lead Ads, Typeform e outras
origens HTTP **sem montar automação** e sem depender só do n8n/Make. Fase 1
entregue neste ramo: `/fontes` (Captação → Fontes de lead),
`POST /api/inbound/<token>` e a migration **`0032_fontes_de_lead.sql`,
aplicada em produção pelo cliente em 25/09** (objetos, RLS, grants e FK
composta conferidos por Claude; a linha do ledger faltava — de novo — e foi
registrada por Claude no mesmo dia). **Publicado em 25/09** (PR #21, `eafbd78`, deploy `Ready`); smoke sem escrita em produção: token inexistente 404 nos dois métodos, `/fontes` sem sessão → login. Contrato completo em `docs/FUNCIONALIDADES.md`,
"Fontes de lead"; decisões no `CHANGELOG` de 25/09.


Contratos a preservar:

- **A fonte não tem regra de lead própria.** Tradução e mapeamento acabam em
  `claimIngestSubmission` + `registerFormLead`, as mesmas de
  `/api/ingest/leads`. Mudou a regra de lead? Muda lá, uma vez.
- **O corpo nunca escolhe empresa, funil ou etapa** — só o token, pela fonte,
  pelo formulário. A FK composta `lead_sources (form_id, organization_id)` é a
  segunda trava; não a troque por FK simples.
- **Falha de configuração responde 200**, e a entrega fica guardada para
  reprocessar. Trocar para 4xx faz o Typeform reentregar por horas sem chance
  de sucesso e, depois, desativar o webhook.
- **O token só é lido depois da guarda de papel** (`/fontes/[id]` e as
  actions). Mesma regra do segredo da 0014.

Validações abertas (escrevem na base; precisam do cliente): conexão Typeform
real com "Send test request" e com resposta real; webhook genérico por JSON e
por urlencoded (Elementor); reentrega do mesmo `token` do Typeform → "Já
estava no CRM" sem card novo; pausar → 404; URL nova → antiga 404; falha por
formulário de destino desativado → reprocessar depois de reativar.

**Fase 2 — Facebook/Instagram Lead Ads nativo.** Contexto do P.O. (25/09):
cada empresa tem a PRÓPRIA página; a JID alcança todas pela sua BM. Decisão:
**os dois caminhos** — (a) o admin global (equipe JID) liga a página de cada
empresa por um usuário do sistema da BM, cujo token fica em variável de
ambiente e nunca em tabela de empresa; a lista de páginas da BM só aparece
para admin global, porque ela contém as páginas de TODOS os clientes; (b)
opcionalmente, o `org_admin` do cliente conecta com o próprio login do
Facebook (a lista vem só das páginas dele). Em ambos, `page_id` é único na base
inteira — uma página, uma empresa — e a recusa não diz qual empresa a tem. A
empresa do lead sai só do `page_id` do evento. Pré-requisito por cliente: se a
página restringir o "Gerenciador de acesso a leads", liberar o app/usuário do
sistema da JID ali. O app da Meta da JID (o mesmo
do WhatsApp Cloud API, `META_APP_SECRET`) **já é verificado**. Falta: pedir
`leads_retrieval`, `pages_show_list`, `pages_read_engagement` e
`pages_manage_metadata` na revisão do app; login com o Facebook em
`/fontes` para escolher página e formulários; inscrever a página
(`POST /{page-id}/subscribed_apps?subscribed_fields=leadgen`); tratar
`object: "page"` / `field: "leadgen"` em `/api/webhooks/meta` (hoje só
WhatsApp) buscando o lead em `GET /{leadgen_id}` com o token da página; e
varredura periódica por `/{form_id}/leads` no cron, porque a Meta perde
webhooks. O provedor `meta_lead_ads` já existe no `check` da 0032 e aparece
na galeria como "em breve". **A revisão da Meta leva semanas — convém pedir já.**

**Fase 3.** Typeform por login com cadastro automático do webhook
(`PUT /forms/{id}/webhooks/{tag}`), assinatura `Typeform-Signature`, limite de
requisições por fonte e alerta quando a última entrega falhar.

## Sobreposições de camadas — varredura de 24/09/2026

Motivada pelo painel "Filtros" do Kanban cortado sob o menu lateral
(`docs/sobreposicao1.PNG` na raiz do workspace). Foram revistos todos os
elementos `absolute`/`fixed`/`sticky` com `z-*` de `app/` e `components/` e os
contêineres que cortam (`overflow-*`).

Mapa de camadas: menu lateral `sticky z-30`; barra superior `sticky z-20`;
flutuantes `z-40` em portal no `body` (painel de filtros, `Dropdown`);
modal e gaveta do celular `fixed z-50`; toasts `fixed z-60`. O `<main>` tem `overflow-x-clip` e a `Table` tem
`overflow-x-auto` — tudo que for `absolute` dentro deles é cortado na borda.

| # | Onde | Sintoma | Estado |
|---|---|---|---|
| 1 | Painel "Filtros" do Kanban (`deal-filters-panel.tsx`) | Ancorado à direita, vazava pela esquerda do `<main>` e era cortado rente ao menu lateral | **Corrigido**: portal no `body` posicionado por `useAnchoredPosition` (a 1ª tentativa, só trocar a âncora para a esquerda, não resolveu no preview) |
| 2 | Menu "⋮" das linhas em Contatos (`contacts-client.tsx`) e Empresas (`companies-client.tsx`) | O `Dropdown` abre para baixo dentro da `Table` (`overflow-x-auto` força rolagem vertical também): nas últimas linhas, ou com lista curta, o menu é cortado e surge uma barra de rolagem dentro da tabela | **Corrigido**: o `Dropdown` usa o mesmo portal + `useAnchoredPosition` |
| 3 | Toasts de atenção (`toast.tsx`) com modal aberto | Mesmo `z-50`; o portal do modal entra depois no DOM, então o toast fica sob o fundo escurecido e não é clicável | **Corrigido**: viewport de toasts em `z-60` |

**Regra para flutuante novo:** menu, painel ou balão que abre a partir de um
botão vai em `createPortal(..., document.body)` com `position: fixed` calculada
por `hooks/use-anchored-position.ts` (abre abaixo, vira para cima quando só lá
cabe, nunca passa da tela, limita a altura e acompanha rolagem). `absolute`
dentro da página herda o corte de quem tem `overflow` e a pilha de `z-index` do
pai. Como o portal fica no fim do `body`, leve o foco para dentro ao abrir e
devolva ao botão no Esc (ver `deal-filters-panel.tsx`).

Verificado em bancada local (layout do app com menu lateral, `<main>` com
`overflow-x-clip` e `Table`), 1440px: painel com o botão rente ao menu
lateral, menu "⋮" da última linha, menu da conta e toast sobre modal — todos
inteiros e no topo (`elementFromPoint` nos quatro cantos). 375px não medido.

Sem problema: menu da conta (`user-menu.tsx`, ancorado à direita no topo),
aviso de erro do modo IA/Equipe no chat (`handling-mode-control.tsx`, cresce
para dentro do painel do chat), gaveta do celular e modal (portal `fixed`).

## Tarde de 23/09/2026 — filtros, celular, nomes, senha e API

Tudo publicado (PRs #15, #16, #17, #18); detalhe em `docs/CHANGELOG.md` e
`docs/FUNCIONALIDADES.md`.

### Kanban: ordenação e filtros de data (PR #15, migration 0031)
Seleção e ordem saem da RPC `negociacoes_do_kanban` — o board tem teto de 500
e filtrar no navegador esconderia a 501ª. Fuso de São Paulo em
`lib/utils/period.ts`. **Contratos:** "último contato" = tratativa da 0025
(mensagem do lead não conta); "fechamento" = `expected_close_date`; filtro
sobre data nula exclui o lead.

### Usabilidade no celular (PR #15)
Kanban com ferramentas recolhidas atrás de "Filtros"; Tarefas reorganizada;
Atendimento cortado era a grade sem `minmax(0,1fr)`; configuração do WhatsApp
só no computador (`components/ui/desktop-only.tsx`); `<main>` com
`overflow-x-clip` como rede de segurança.

### O lead nascia com o nome do dono do número (PR #16 + reparo de dados)
Quando a primeira mensagem da conversa saía do celular da equipe (`fromMe`), o
`senderName` — o dono do número — virava o nome do contato. **Não eram
duplicatas**: 37 contatos "Orlando Lima" com telefones diferentes, 9 sem nome.
Corrigido em `lib/features/whatsapp-inbound/domain/lead-name.ts`.
**Reparo feito em produção em 23/09** (aprovado pelo cliente): 47 contatos, 47
conversas e 34 negociações abertas; 31 com o nome real recuperado do payload
das mensagens do lead, 16 como "WhatsApp +55…" (ganham o nome na próxima
mensagem). 2 duplicatas sem conversa arquivadas. **Backup do estado anterior**:
`CRM_JID_MIDIA/docs/reparo-nomes-2026-09-23-backup.json`, fora do git (tem ids
da base). Ficaram com título antigo 10 negociações fechadas — decisão do
cliente pendente.

### Senha (PR #18)
Não existia nenhum fluxo. Agora: Meu perfil (com a senha atual), "Esqueci
minha senha" por e-mail (`/esqueci-senha` → `/auth/confirmar` →
`/redefinir-senha`) e redefinição pelo admin em Pessoas. **O admin não
redefine quem também pertence a outra empresa** — seria tomar a conta dela
lá. **Pendências no painel do Supabase de produção**, sem as quais o e-mail não
funciona: Redirect URL `https://wavemov-crm.vercel.app/**` e SMTP próprio (o
padrão só entrega para membros da equipe do projeto Supabase). Até lá, o
caminho para clientes é o admin em Pessoas.

### API v1 no n8n dava 404 (este PR)
A tela de Integrações mostrava `/api/v1` na URL base **e** nos caminhos; quem
juntava os dois chamava `/api/v1/api/v1/pipelines` → 404. A API sempre esteve
de pé (`/api/v1/pipelines` sem token = 401). Caminhos agora relativos à base,
com um "teste rápido no n8n". Provado local com token: 200 em `/pipelines`,
`/deals`, `/contacts`. O token de produção `jid_b2873855…` (escopos api+mcp)
estava válido e nunca tinha sido usado.

### Lint
O script `lint` (`next lint`) existe, mas não há configuração nem ESLint
instalado — rodá-lo abre o assistente. **Não instalar sem autorização do
cliente.** Validação: build, `tsc --noEmit` (e `--noUnusedLocals
--noUnusedParameters` pela linha de comando), `test:unit`, `test:db`.

### Dados de QA no Supabase LOCAL
Empresa "QA Filtros" e usuários `qa.filtros@`, `qa.vendedor@`,
`qa.duasempresas@local.test`. Só no Docker local; podem ser removidos.

## Publicação de 23/09/2026 — IA, automações, menu lateral e configuração inicial

**Publicado** pelo PR #13 (`279e188`). Detalhe em `docs/CHANGELOG.md` e
`docs/FUNCIONALIDADES.md`; o que ainda aproveitar do DeskcommCRM está em
`docs/ROADMAP_SUPERCRM.md`.

- **Banco:** 0026–0030 foram aplicadas à mão pelo cliente **sem** a linha do
  ledger — segunda vez que isso acontece (a primeira foi a 0025). Os objetos
  de cada uma foram conferidos antes do registro. A ideia de colar o `insert`
  do ledger no rodapé de cada migration continua valendo; a 0030 já traz o
  comando comentado.
- **Empresas existentes:** nenhuma ficou com `onboarded_at` nulo — o backfill
  da 0030 funcionou; ninguém cai no assistente sem querer.
- **Contratos:** o gate do assistente mora em `/dashboard`, não no layout (ver
  FUNCIONALIDADES); `apply_onboarding_pipeline` só mexe em funil virgem; o
  menu esconde, a rota protege.
- **Verificado:** build da Vercel, `/` e `/login` com HTTP 200. **Não
  verificado logado:** menu em 375/768/1440 (aberto, recolhido, gaveta) e o
  assistente com uma empresa nova.

### O agente "voltou inativo" — não voltou: nasceu inativo

Primeiro agente de produção (empresa JID, 23/09 13:01 BRT): `is_active =
false`, `is_default = true`, e `updated_at` **igual** a `created_at` — ou
seja, nenhuma edição chegou ao banco depois da criação (o trigger
`ai_agents_updated_at` teria mudado a data). O formulário de agente novo
começa com "Agente ativo" **desligado** de propósito (`emptyForm` em
`components/ai/agent-form-modal.tsx`, e o default da coluna na 0026 é
`false`): um prompt recém-escrito não deve responder cliente real antes de
ser revisado. O defeito é de comunicação — nada na tela diz que o agente
nasce desligado. Para ligar: editar o agente, ativar "Agente ativo", salvar.

### Pendências operacionais

1. Agendar `/api/cron/automations` no n8n a cada 1–5 min com
   `Authorization: Bearer <CRON_SECRET>` (o `vercel.json` roda 1×/dia).
2. Primeiro turno real da IA: conferir a aba Atividade de `/ia`.
3. Para testar IA em preview, marcar as variáveis `AI_*` também em Preview.

## IA, automações, API oficial da Meta, API v1 e MCP — 22/09/2026

Ramo `feat/ia-automacoes-canais`, **publicado em 23/09 pelo PR #13**. Detalhe em
`docs/CHANGELOG.md` e `docs/FUNCIONALIDADES.md`.

### Ordem de publicação — não inverter

1. **Aplicar 0026 → 0027 → 0028 → 0029 no painel**, uma por vez, registrando
   cada uma no ledger no mesmo ato (ver README, "Sobre o `supabase db push`").
   A 0026 cria a extensão `vector` no schema `extensions`. A 0027 faz um
   `update` de backfill em `whatsapp_messages.sender_type` (não apaga nada).
2. **Só então o deploy do código.** O código novo lê colunas da 0027
   (`handling_mode`, `sender_type`) e insere em `crm_events`/`ai_runs`; sem as
   migrations, o webhook da UAZAPI falharia ao gravar a conversa.
3. Configurar as variáveis na Vercel (nomes em `.env.example`):
   `AI_API_KEY` (+ `AI_BASE_URL`/`AI_DEFAULT_MODEL` se não for OpenAI),
   `AI_EMBEDDING_*` se o provedor de chat não fizer embeddings,
   `META_APP_SECRET` (só se usar a API oficial), `CRON_SECRET`.
4. Agendar `/api/cron/automations` a cada 1–5 min no n8n (o `vercel.json`
   agenda 1×/dia como rede de segurança, limite do plano Hobby).

Sem `AI_API_KEY` nada quebra: agentes podem ser configurados, o turno fica
registrado como "IA sem chave" e os gatilhos de transferência por regex
continuam funcionando.

### Contratos a preservar

- **Toda escrita de servidor filtra `organization_id` de fonte confiável**
  (segredo, assinatura + `phone_number_id`, token). Nenhuma rota nova aceita
  organização do corpo.
- **No turno da IA, o lead da conversa vence o id do argumento** da
  ferramenta: o lead não pode convencer o modelo a mexer em outro cadastro.
- **A mensagem enviada é gravada `pending` antes do provedor.** Tirar isso
  faz o eco `fromMe` da UAZAPI tirar a conversa da IA a cada resposta dela.
- **`getInstanceForOrg` ignora a instância `meta_cloud`**: ela alimenta a tela
  da UAZAPI e o envio de conversas legadas. A instância da Meta é separada, não
  uma conversão — trocar o provider da instância em uso mudaria o número de
  saída de todas as conversas abertas.
- **Trigger nunca faz HTTP.** `crm_events` é a fila; o servidor executa.
- **`deals` continua fora do Realtime** (decisão de 31/08). O evento do
  Kanban chega ao motor pela trigger + `/api/automations/dispatch`.

### Riscos e débitos conhecidos

- **Sem rate limit** nos turnos da IA e na API v1. Um lead (ou token) muito
  ativo consome modelo sem teto. Próximo passo natural: limite por
  conversa/token.
- **Mídia da Meta** chega com o id no `raw_payload`, sem download para o
  Storage: o atendente vê "[image]" sem a imagem.
- **`crm_events` e `ai_runs` crescem sem retenção.** Mesmo débito já apontado
  para `activity_logs`; decidir política antes da importação do Bubble.
- **Templates da Meta**: a ação de automação envia template por nome/idioma,
  sem parâmetros e sem sincronizar a lista aprovada da conta.
- **LLM e embeddings não foram exercitados contra provedor real** nesta
  sessão (sem chave no ambiente). O primeiro teste com chave deve olhar a aba
  Atividade de `/ia`.
- `app/api/webhooks/uazapi/route.ts` ainda carrega a resolução de organização
  redundante com o segredo por instância (nota antiga no próprio arquivo).

## Entregas publicadas em 28/08/2026

**`7caea98` — Tags e Distribuição saíram do menu superior** e viraram botões ao
lado dos filtros de `/negociacoes`, na fileira do "Etapas". O menu foi de 12
para 10 itens. Os botões só aparecem para `org_admin`/admin global, porque as
duas rotas já eram restritas e o atalho levaria um `seller` a um beco. Nenhuma
das telas ficou órfã: `/relatorios/tags` mantém "Catálogo" e
`/relatorios/vendedores` aponta para `/distribuicao`.

**`f9cfded` — o contato virou editável pelo detalhe da negociação.** O
formulário não foi duplicado: saiu de `contacts-client.tsx` para o
`components/crm/contact-modal.tsx` compartilhado. A extração corrigiu um defeito
que existia antes nos dois consumidores — o update de contato não filtrava
`organization_id` nem usava `.select()`, então update recusado pela RLS voltava
como **sucesso silencioso**, e a tela dizia que salvou.

Contratos que precisam permanecer, das entregas de tags e de contato:

- `viewer` é somente leitura — inclusive sem **ver** o gatilho de escrita, não
  só sem permissão para executá-la;
- `seller`/`agent` só aplica tags nos leads que já pode acessar;
- tag inativa continua em vínculos e relatórios históricos, mas não pode ser
  aplicada novamente. A UI precisa **reenviá-la** em `set_deal_tags` para
  preservar o vínculo — é o que a `0020` viabiliza;
- catálogo de tags é administrativo;
- a associativa de tags usa chaves compostas para impedir vínculo entre
  organizações, inclusive quando `service_role` ignora RLS;
- as bordas de período e as chaves de eixo dos relatórios vivem em
  `America/Sao_Paulo` (`lib/utils/period.ts`), nunca no fuso do processo: em
  produção o Node roda em UTC.

## Landing e marca publicadas

**A marca visível virou JID Mídia.** O produto é o **CRM JID Mídia** — a JID
fornece o CRM às empresas clientes; "Wavemov" é o desenvolvimento e fica só nos
nomes internos (repositório, `package.json`, projeto na Vercel). A logo real
está em `public/jid.png` e é servida por `components/ui/brand-logo.tsx`, usado
pela landing, pela autenticação e pelo formulário público. Trocar a marca de
novo é mexer nesse componente, no arquivo em `public/` e em
`components/landing/content.ts`. O nome dentro do app autenticado continua
sendo o da organização do cliente.

**Landing page pública em `/`.** `app/page.tsx` deixou de ser
`redirect("/login")` e virou a página de apresentação do produto, composta de
`components/landing/` (13 arquivos novos). `app/globals.css` ganhou o bloco
"Landing page pública", dentro de `@layer components` — fora de layer, essas
regras venceriam qualquer utilitário Tailwind aplicado ao mesmo elemento.

O que **não** mudou, e é o que importa para segurança: `/` já era pública em
`lib/supabase/public-paths.ts` e o middleware já mandava sessão ativa de `/`
para `/dashboard`. A rota não consulta o Supabase, não lê organização e sai
estática do build.

Contratos a preservar:

- os três CTAs da landing são `<Link>` para `/login`, e o do header fica
  visível em qualquer largura — a página existe para levar ao acesso;
- `components/landing/nav-links.ts` está separado de `content.ts` de propósito:
  `site-header.tsx` é Client Component e importar o módulo de conteúdo levaria
  os ícones Lucide de recursos e dashboards para o bundle do cliente;
- `.reveal` começa em `opacity: 0` e só o IntersectionObserver revela; o
  `<noscript>` de `app/page.tsx` é o que impede a página inteira de sumir sem
  JS. Quem mexer em um dos dois precisa olhar o outro;
- a única exceção deliberada ao `DESIGN_GUIDE` é o ícone de recurso a 20px,
  registrada no cabeçalho de `features.tsx` e na seção "Landing pública" do
  guia;
- canonical e `og:url` da landing só são emitidos quando
  `NEXT_PUBLIC_APP_URL` existe (`app/page.tsx`), e `app/layout.tsx` não dá
  fallback ao `metadataBase`. É deliberado e nas duas pontas: `/` é
  prerenderizada, o Next tem fallback próprio (localhost, ou o domínio de
  deploy da Vercel), e um canonical assado no endereço errado pede a
  desindexação da URL real. Provado com um build sem a variável: zero
  `canonical`, zero `og:url`, `og:title` intacto.

**Verificação do primeiro deploy da landing:** `NEXT_PUBLIC_APP_URL` do ambiente
Production foi corrigida para `https://wavemov-crm.vercel.app` antes do build.
O deployment imutável é
`https://wavemov-e17wha6lb-orlandoadm10s-projects.vercel.app`; `/` e `/login`
responderam HTTP 200, o canonical aponta para o alias de produção e a landing
contém a marca CRM JID Mídia e o CTA para `/login`.

Falta a imagem de Open Graph (`app/opengraph-image.png`): até existir arte, o
card sai sem miniatura e o Twitter card fica em `summary`, não
`summary_large_image`.

## O WhatsApp parou de receber — 31/08/2026

São **duas falhas independentes** que se somavam. Ambas precisam de ação; uma
delas não é código.

**1. A ingestão está parada desde 26/08 e a correção é no painel da UAZAPI.**
Última mensagem recebida: `26/08 18:20:52 UTC`. O PR #1
(`fix/isolamento-webhook-uazapi`) foi mergeado às `19:20:34 UTC` do mesmo dia —
uma hora depois. Ele trocou o `UAZAPI_WEBHOOK_SECRET` global pelo segredo por
instância da `0010`, e o global **deixou de ser aceito**. A URL configurada no
painel da UAZAPI nunca foi trocada. O log de produção mostra a UAZAPI chamando
`POST /api/webhooks/uazapi` a cada ~30–50 s e levando **401** em todas
(`segredo não reconhecido { hasOrgParam: true, viaHeader: false }`).

O envio nunca parou, porque usa o token da instância e não o segredo — foi isso
que escondeu o problema por quatro dias.

Correção: entrar em Atendimento → Configurações como `org_admin`, copiar a URL
do webhook e colá-la no campo de **mensagens recebidas** da instância em
`https://jidmidia.uazapi.com`. A instância já tem `webhook_secret`; **não** gere
outro — só obrigaria a colar de novo.

**Feito e verificado em 31/08/2026.** Os 401 cessaram e o tráfego real voltou
nos dois sentidos: `inbound` e `outbound` gravados, a última entrada às
`15:34 UTC`. A `0021` foi aplicada no mesmo dia; as duas tabelas aparecem em
`pg_publication_tables`.

Em aberto: as mensagens recebidas entre 26/08 e a reconfiguração provavelmente
estão perdidas. A UAZAPI levou 401 em todas; se não houver fila de reenvio do
lado dela, não há de onde recuperar. Vale perguntar ao suporte antes de dar por
encerrado.

**2. `0021` — as tabelas do atendimento não estavam no Realtime.** A publicação
`supabase_realtime` do projeto está vazia. A assinatura `postgres_changes` de
`whatsapp-client.tsx` conectava e nunca recebia evento: mesmo com o webhook
consertado, a mensagem entraria no banco e a tela só a mostraria ao recarregar.
A `0021` publica `whatsapp_messages` e `whatsapp_conversations`, é idempotente
por consulta ao catálogo, e **aguarda aplicação manual pelo cliente**. Se o
painel recusar com `must be owner of publication`, o mesmo efeito está no
Dashboard, em Database → Replication.

A `0021` sozinha resolve só a conversa aberta; por isso a tela passou a assinar
`whatsapp_conversations` e a dar `router.refresh()` com debounce — é o que move
o não lido, a ordem e a conversa nova na lista lateral.

Contratos a preservar:

- o segredo do webhook é por instância e a URL que o carrega **só é montada
  para `org_admin`** (`atendimento/configuracoes/page.tsx`); trocar o segredo
  invalida a URL na hora e para o recebimento até alguém colar a nova;
- `REPLICA IDENTITY` das duas tabelas fica no padrão: `full` dobraria o WAL
  para carregar o `raw_payload` antigo, que nenhum componente lê;
- publicar tabela no Realtime **não** afrouxa RLS — o Supabase avalia as
  policies da `0011` por assinante antes de entregar o evento. Quem mexer nas
  policies de `whatsapp_*` está mexendo também no que cada um recebe ao vivo;
- a lista lateral se atualiza por `router.refresh()`, não por espelho da linha
  em estado local. Remontá-la no cliente é reimplementar a visibilidade por
  responsável — e errar nisso mostra a conversa de um vendedor para outro.

## Saúde da entrada de leads — 31/08/2026

Frente escolhida pelo P.O. depois do incidente, em `feat/saude-da-entrada`
(empilhada sobre o PR #2). O problema: **ninguém no CRM sabia dizer se a
empresa ainda estava recebendo leads**. As três entradas — webhook da UAZAPI,
n8n e formulário público — não declaravam o próprio estado em lugar nenhum.

Entregue: painel "Recebimento" em `/atendimento/configuracoes`, banner em
`/dashboard` e `/atendimento`, linha por formulário no painel n8n, e a
migration `0022` (índice parcial da última mensagem recebida por organização),
**já aplicada em produção**.
Detalhe completo em `docs/FUNCIONALIDADES.md` e `docs/CHANGELOG.md`.

Contratos a preservar, em ordem de risco de alguém quebrar sem perceber:

- **`seller`/`agent` não veem o indicador.** É o erro mais provável de quem
  mexer aqui: reaproveitar a consulta na tela do vendedor. Sob a `0011` ele lê
  só as próprias conversas, então o número seria "12 dias sem receber" num dia
  quieto, com a empresa saudável;
- **a última entrada do WhatsApp sai de `whatsapp_messages` com
  `direction = 'inbound'`**, nunca de `whatsapp_conversations.last_message_at`
  — o envio escreve nessa coluna e foi ela que escondeu o incidente;
- **a tela afirma ausência, nunca falha** — há teste prendendo a redação;
- **erro de leitura vira `unknown`**, nunca "aguardando";
- só `silent` alerta. Os outros cinco estados existem para o indicador **não**
  gritar; alarme falso mata o alarme.

Reconhecidamente limitado: o indicador não distingue "quebrado" de "mercado
parado", e o ganho é tempo de detecção — de cinco dias para menos de dois. Se
ninguém abrir o CRM, não adianta.

**Isto é pré-requisito do corte de domínio do Bubble.** O passo 7 do runbook
manda atualizar toda URL absoluta de webhook quando `NEXT_PUBLIC_APP_URL`
mudar, ou seja, reproduz o incidente de 26/08 deliberadamente e em escala. Os
critérios de aceite pedem "webhooks validados" sem dizer com qual instrumento —
este é o instrumento.

## Indicadores de atenção (notificações, v1) — 31/08/2026

Pedido do cliente: "sistema de notificações" — tarefas em aberto/atrasadas,
contador de mensagens no Kanban, aviso de lead novo no front e por e-mail.
Consultei produto, backend e frontend; **os três divergiram** e a arbitragem
está registrada no `CHANGELOG`. O recorte aprovado foi o mais estreito.

**A descoberta que reformulou o pedido:** o CRM já tinha um badge de
notificação no menu, e ele media a coisa errada — `tasks` com
`status='pending'` da organização inteira, sem `due_at` e sem `assigned_to`.
Não era "construir do zero", era consertar e completar.

Entregue: três badges no menu (tarefas vencidas minhas, conversas aguardando,
leads novos 24h), pílula no toolbar do Kanban, toast de lead novo, e a
migration `0023` (índice parcial das tarefas por responsável). Sem tabela, sem
trigger, sem publicação nova no Realtime.

Contratos a preservar, em ordem de risco de alguém quebrar sem perceber:

- **O recorte é "meu" para todos os papéis, inclusive `org_admin`**, mais a
  fila sem responsável. É o erro mais provável de quem mexer aqui: dar ao
  administrador a soma da empresa produz um número que nunca chega a zero e
  mata o badge em duas semanas;
- **`viewer` não vê indicador** — ele não zera `unread_count` (barrado de
  propósito), então os contadores dele subiriam para sempre;
- **`deals` não entra no Realtime.** Ela é escrita a cada arraste de card;
- **tarefa vencida nunca terá Realtime** — vence pela passagem do relógio, sem
  nenhuma linha mudar;
- **o Realtime é latência, não verdade**: desligá-lo deixa o contador lento,
  nunca errado. É critério de aceite;
- **badge conta conversas, não mensagens**;
- **`null` esconde o badge; zero também não desenha.**

**Regressão consciente:** o badge de tarefas do `org_admin` vai mostrar um
número menor do que antes. É correção, não defeito — comunique assim. A visão
da equipe está em `/relatorios/vendedores`.

**O v2 já tem direção aprovada pelo cliente:** e-mail de lead novo disparado
por **falta de toque** (~30 min) mais um resumo diário, em vez de um e-mail por
lead. Dois pré-requisitos que não existem hoje: um remetente transacional
(nenhum provedor está configurado, e o domínio remetente esbarra no corte do
Bubble) e uma marca de **primeiro contato** em `deals` — sem ela, "sem toque"
não é calculável. A tabela `notifications` entra junto com o e-mail, porque é
aí que a linha persistida ganha função: ser o outbox que sobrevive ao provedor
cair. O desenho completo dela está no `CHANGELOG` desta data.

**Extensões:** `pg_cron`, `pg_net` e `pgmq` estão **disponíveis e não
instalados** neste projeto. Se o v2 precisar de agendador, a recomendação é
usar o **n8n**, que o cliente já opera e que já autentica em
`/api/ingest/leads` — em vez de ligar extensão nova num projeto cujo ledger de
migrations já diverge.

## Contato duplicava a cada mensagem — 31/08/2026

O cliente relatou que "toda interação vira contato na lista". A medição achou
algo pior que um problema de tela: **246 contatos para 59 telefones**, 243
criados em 6 dias, um número com **118 cópias**, duplicando naquele instante.
A prova: 117 mensagens, 118 contatos — um por evento de webhook, nas duas
direções.

**Causa raiz:** `.maybeSingle()` **falha quando encontra mais de uma linha**, e
o erro era descartado. Duas linhas viravam `null`, o `insert` criava a terceira,
e a terceira garantia a próxima. A porta de entrada foi a `0001` ter criado
`contacts_whatsapp_idx` **sem `unique`**.

**A prova por contraste, e é a lição transferível:** `whatsapp_conversations` e
`whatsapp_messages` usam o MESMO `maybeSingle()` no mesmo arquivo e nunca
duplicaram — porque a `0002` e a `0011` lhes deram índice único. **Todo
`maybeSingle()` sobre colunas sem unicidade garantida é uma bomba com pavio
aceso.** Se algum desses índices for derrubado, o mesmo laço acontece com
mensagens.

### A `0024` não pode usar tabela temporária

A primeira versão falhou na aplicação com
`42P01: relation "contato_duplicado" does not exist`. **O SQL Editor da Supabase
não garante que as instruções de um script rodem na mesma sessão** — o pooler
pode entregar cada uma a um backend diferente, e tabela temporária morre com a
sessão que a criou. Pelo mesmo motivo, `begin`/`commit` no meio de um script
também não é confiável ali.

A `0024` foi reescrita para não guardar estado entre instruções: cada `update`
recalcula o mapa duplicata→sobrevivente no próprio CTE. Há asserção no
`test:db` que falha se alguém reintroduzir a tabela temporária.

**Vale para toda migration futura deste projeto**, porque o cliente aplica tudo
à mão pelo painel.

### A ordem de execução, que não pode ser invertida

1. **Deploy do código** (`fix/contato-duplicado`).
2. Confirmar que `contacts` parou de crescer: `select count(*) from contacts`
   duas vezes, com mensagens chegando no meio.
3. **Só então** aplicar a `0024` pelo painel.

Sob o código antigo, o índice único faz o `insert` do webhook devolver `23505`
— e aquele erro também era descartado —, então a rota seguiria gravando
conversas e leads **órfãos de contato**, que nenhum SQL reconstrói. O índice
sem a correção de código é **estritamente pior** que o estado atual.

### Conferência depois da 0024

- `select count(*) from contacts` deve cair de 246 para ~59 mais os contatos
  sem WhatsApp;
- `select count(*) from activity_logs` deve ficar **idêntico** ao valor de
  antes. Se caiu, o cascade agiu e é preciso restaurar do backup. Guarde o
  número antes de rodar.

### Decisão de produto: a lista NÃO agrupa

O cliente sugeriu agrupar a tela. Recusado: as 246 linhas eram o alarme
funcionando, e agrupar não unificaria nada — as duplicatas são `contact_id`
distintos, com deals e mensagens espalhadas entre elas. A linha agrupada daria
a ilusão de um cliente único enquanto o usuário cai num registro vazio.

### Dívida da tela de contatos — corrigida em 31/08

`limit(1000)` sem paginação, busca em memória sobre o array truncado, `error`
descartado e filtros fora da URL: tudo resolvido. Ver o `CHANGELOG` desta data.

Contratos que nasceram daí:

- **`document` e `notes` precisam continuar na consulta da lista.** O
  `contact-modal.tsx` semeia o formulário com o contato que a lista entregou e
  regrava todos os campos no `submit` — tirá-los faz a edição apagar observação
  e documento em silêncio. Foi encontrado durante a própria mudança;
- o filtro de status agora significa "**tem** negociação naquele status", não
  "a mais recente está nele". Os rótulos da tela dizem isso;
- toda troca de filtro volta para a página 1.

**O que continua em aberto:** não há rota de detalhe do contato nem tela de
mesclagem. A mesclagem vale como escopo próprio **depois** da importação do
Bubble, que vai gerar um lote de quase-duplicatas de uma vez — e agora que a
`0024` recusa duplicata de WhatsApp, a importação precisa tratar isso na
origem.

## O ledger de migrations, reconciliado — 31/08/2026

Era o **débito 8**, e o de maior potencial de estrago silencioso. O ledger
remoto (`supabase_migrations.schema_migrations`) listava `0001..0008` enquanto o
repositório chegava à `0024` — 16 migrations de diferença, todas aplicadas à mão
pelo painel e nenhuma registrada.

**O risco concreto, para quem for entender por que isso importava:** um
`supabase db push` distraído (o CLI está linkado à produção) tentaria reaplicar
`0009..0024`. Ele pararia na `0011` com `policy already exists`, sem perder
dado — mas quem destravasse essa parede chegaria à `0016`, que **reinscreve na
fila de distribuição todo membro que o administrador removeu**, em todas as
organizações; a `0018` então renumera a fila e zera o cursor. Silencioso, sem
erro e sem linha em `lead_distribution_log`.

### Como foi feito, e por que nessa ordem

1. **Primeiro a prova de que as 16 estavam mesmo aplicadas.** Registrar como
   aplicada uma migration que não rodou é pior que a divergência: ela nunca
   mais rodaria, e o schema ficaria sem ela para sempre. Cada uma foi conferida
   pelo objeto que cria — a view `organization_deal_stats` da `0009`, a função
   `deals_pipeline_stage_guard` da `0013`, a tabela `deal_tags` da `0019`, o
   índice `contacts_org_whatsapp_key` da `0024`, e assim por diante. As 16
   passaram.
2. **`insert` das 16 linhas pelo painel**, com `on conflict (version) do
   nothing`. É a mesma escrita que o `supabase migration repair` faria, sem
   trazer o CLI para perto do banco.
3. **`statements` fica nulo** nas 16, e isso é deliberado: o CLI preenche essa
   coluna quando é ele quem aplica. Nulo diz a verdade — foram aplicadas à mão.

### Verificação

`npx supabase migration list --linked` mostra `local` e `remote` alinhados nas
24. `npx supabase db push --linked --dry-run` responde:

```json
{"upToDate": true, "migrations": [], "message": "Remote database is up to date."}
```

### O que mantém isso verdadeiro

O fluxo continua manual. **Toda migration aplicada à mão precisa registrar a
linha no mesmo ato** — o `README.md` agora traz o `insert` pronto, na seção
"Sobre o `supabase db push`", junto da distinção entre projeto novo (onde o
`db push` é o caminho recomendado) e este projeto de produção.

Se alguém aplicar uma migration sem registrar, a divergência recomeça do zero e
a armadilha volta armada.

## Carteira de leads — 01/09/2026

O cliente pediu paginação na lista de últimos leads e uma visão de "últimas
interações" para saber quem está pendente de tratativa. A medição mudou o
pedido.

**A descoberta, e é a que precisa sobreviver a esta sessão:** `whatsapp_messages`
tinha **466 mensagens enviadas** contra **4** `activity_logs` do tipo
`whatsapp_outbound`. O webhook só grava log quando `!msg.fromMe`
(`app/api/webhooks/uazapi/route.ts`), então **as respostas que a equipe manda
pelo próprio celular não existem em `activity_logs`**. Uma métrica de tratativa
construída só sobre aquela tabela acusaria a equipe de abandonar toda a
carteira enquanto ela respondia — mesma classe de erro do incidente de 26/08.

E 86% dos `activity_logs` são `whatsapp_inbound`: o lead falando. Contá-lo como
"interação" faria o lead que escreve todo dia e nunca é respondido parecer o
mais bem atendido.

**Tratativa = tipos de trabalho da equipe em `activity_logs` UNIÃO
`whatsapp_messages.direction = 'outbound'`.** Quem mexer nisso precisa manter as
duas fontes; a definição vive na `0025` e está documentada em
`docs/FUNCIONALIDADES.md`.

Com a fonte correta, das 53 abertas: 23 aguardando resposta, 10 nunca
respondidas, 19 sem resposta há 3+ dias.

Contratos a preservar, em ordem de risco de alguém quebrar sem perceber:

- **A segunda fonte não é opcional.** Remover `whatsapp_messages` da RPC
  reintroduz o defeito inteiro, e ele parece correto na tela;
- **lista de INCLUSÃO de tipos**, nunca exclusão de `whatsapp_inbound`;
- **`coalesce(max(...), created_at)`** na ordenação: sem isso o `nulls last`
  joga o lead nunca tratado, o pior caso, para a última página;
- **laterais separados** por agregado — join direto de notas e tarefas
  multiplica linhas;
- **os KPIs medem a carteira inteira**, não a página;
- **`seller`/`agent` veem a tela recortada**, e a RPC é `security definer`: um
  erro ali vaza entre empresas. As asserções A/B estão no `test:db`.

**Por que RPC e não embed:** o PostgREST não ordena o recurso pai por agregado
de embed *to-many*. `range(0,24)` escolheria 25 leads por `created_at` e só
então calcularia o agregado — página 1 com amostra arbitrária, e o pior lead
possivelmente fora dela.

**Reabrir a denormalização** (`deals.last_touch_at` por trigger) quando o p95 da
RPC passar de ~500 ms ou uma organização passar de ~50 mil leads abertos.

### Débito que esta entrega expôs e não resolveu

`activity_logs` está virando o maior objeto do schema guardando **cópia**: 527
de 612 linhas são `whatsapp_inbound`, dado que já existe em `whatsapp_messages`
com índice próprio desde a `0022`. Duas saídas — parar de espelhar o inbound
(a timeline passa a ler `whatsapp_messages`) ou política de retenção. **Decidir
antes da importação do Bubble**, não depois.

E um risco de escala já mapeado: na importação das ~300 empresas, todo lead
aberto importado entra sem histórico e a carteira fica 100% vermelha no dia 1.
Ou o import gera um marco de tratativa, ou a tela declara o corte. Registrar em
`docs/MIGRACAO_BUBBLE_DOMINIO.md`.

## Responsividade mobile — auditoria e plano, aguardando sinal

Pedido do cliente em 01/09/2026: *"o app não está responsivo para celular"*.
Auditei antes de mexer. **O trabalho é grande e não cabe numa sessão sem
atropelo**, então aqui está o plano; nenhuma linha de código foi escrita ainda.

### O que JÁ está correto — não refaça

Metade do que parece quebrado é padrão deliberado e documentado:

| Peça | Estado | Onde |
|---|---|---|
| `Modal` | bottom sheet no mobile, `max-h-[92dvh]`, `safe-area-inset` | `components/ui/modal.tsx:116,129` |
| Gráficos | `ResponsiveContainer` em todos | `components/crm/dashboard-charts.tsx` |
| Menu superior | hambúrguer abaixo de `lg` | `components/layout/top-nav.tsx` |
| `/atendimento` | painéis alternados (`list`/`chat`/`info`) | `whatsapp-client.tsx:559-766` |
| Kanban | colunas de 280px com scroll horizontal — **é o padrão certo** para kanban e está no guia (linha 439) | `kanban-board.tsx:357` |
| `/funis` | fluxo horizontal com scroll, mesmo raciocínio | `pipeline-stages-client.tsx:763` |
| `/relatorios/carteira` | cartões abaixo de `md` | feito em 01/09 |

### O trabalho real, medido

**1. Oito tabelas em scroll horizontal.** O `DataTable` tem `min-w-[640px]`; as
duas tabelas cruas têm `min-w-[720px]` e `min-w-[760px]`. Em 375px, todas rolam.

| Tela | Colunas | Prioridade |
|---|---|---|
| `seller-performance-table.tsx` | **10** | alta — o pior caso |
| `companies-client.tsx` | 7 | alta |
| `contacts-client.tsx` | 7 | alta — recém-paginada, é a mais usada |
| `people-client.tsx` | 7 | média |
| `distribution-audit-table.tsx` | 7 | média |
| `leads-report-table.tsx` (`<table>` cru) | 7 | média |
| `admin-client.tsx` | 6 | baixa — admin global |
| `/relatorios/tags` (`<table>` cru) | 2 | nenhuma — já cabe |

**2. Onze `grid-cols-2` sem breakpoint.** Campos de formulário lado a lado em
375px ficam com ~160px cada. É o item mais barato do plano: uma linha por
ocorrência (`grid-cols-1 sm:grid-cols-2`).

`register`, `companies-client:273`, `contact-modal:160`, `people-client:157,168,176`,
`task-modal:126`, `forms-client:374,420`, `instance-settings:215`,
`landing/management:28`.

### A decisão de design que precede o código

**O `DESIGN_GUIDE` se contradiz e precisa de emenda antes de qualquer tabela
ser tocada:**

- linha 224: *"Container: scroll horizontal no mobile"*
- linha 482: *"Listagens principais: tabelas responsivas ou cards em grid"*

A carteira de leads criou o precedente (cartões abaixo de `md`) com um motivo
específico: **a coluna que ordena é a primeira, e o scroll a esconde quando o
dedo empurra**. Esse motivo não vale para toda tabela — numa lista sem
ordenação por urgência, o scroll é honesto e muito mais barato.

Critério proposto, a ser confirmado e escrito no guia:

> Vira cartão quando a informação que **decide a ação** está na primeira coluna
> ou depende de comparar duas colunas distantes. Continua tabela com scroll
> quando é consulta e o usuário procura uma linha específica.

Por esse critério: `seller-performance` (comparação entre colunas) e `contatos`
(ação por linha) viram cartão; `admin` e `distribution-audit` continuam tabela.

### Lotes sugeridos, em ordem

1. **Os onze `grid-cols-2`** — uma sessão curta, risco zero, ganho imediato em
   todo formulário do produto. Pode ir sozinho, sem depender da decisão acima.
2. **Emenda ao `DESIGN_GUIDE`** com o critério, mais o débito de contraste
   abaixo. Sem isso, cada tabela vira uma decisão nova e elas divergem.
3. **Cartões nas tabelas de prioridade alta** (`seller-performance`,
   `companies`, `contatos`), reaproveitando o padrão da carteira: duas
   apresentações, **um** cálculo — `components/crm/lead-portfolio-table.tsx`
   mostra a forma, com `avaliar()` compartilhado entre tabela e cartão.
4. **Prioridade média**, se o uso justificar.
5. **Passo de QA em 375 / 768 / 1440** nas 26 rotas. É o que fecha o pedido —
   sem ele a entrega é "mexi nas telas que eu lembrei".

### Débito de acessibilidade que aparece junto

O `DESIGN_GUIDE` define o badge de não lidas do atendimento como `emerald-500`
com texto branco: **~2,5:1, reprova AA** até para texto grande, e ali é 10px. O
`CountBadge` do menu já usa `primary-600` (~5,2:1) por causa disso. Corrigir é
emenda ao guia, não desvio silencioso — entra no lote 2.

### Riscos

- **Cartão que esconde coluna vira defeito de dado.** A tabela mostra 7 campos;
  o cartão mostra 4. Os 3 que sobram precisam ser decisão explícita, não corte
  por espaço — foi o cuidado que a carteira tomou.
- **Duas apresentações, dois cálculos.** O risco real da duplicação não é a
  marcação, é a lógica: tabela e cartão dizendo coisas diferentes sobre a mesma
  linha na primeira mudança de regra.
- **Sem CI (débito 1)**, nada disso tem gate automático. O QA de larguras é
  manual e precisa estar no roteiro.

## Próxima sessão

Em ordem de risco. O item 1 é o único que tem cliente esperando; o 2 conclui a
validação da publicação; o 3 é o que mais reduz risco de acidente; do 4 em
diante é dívida e produto.

1. **Responsividade mobile** — o plano está na seção acima e **aguarda sinal do
   cliente**. O lote 1 (onze `grid-cols-2`) pode sair sozinho, sem depender da
   decisão de design. Antes ou depois disso,
   o smoke que nunca houve das `0010/0011`: receber e responder pela mesma
   instância, transferir responsável, conferir isolamento de `seller`/`agent` e
   visão consolidada de `org_admin`.
2. **Smoke autenticado em produção**, depois do deploy:
   - o caso que motivou a `0020`: aplicar tag, desativá-la no catálogo, e então
     editar as tags do mesmo lead. Precisa salvar e preservar o vínculo antigo,
     com a tag na seção "Tags inativas já aplicadas";
   - `/negociacoes?tag=<id>` — monta dois embeds da mesma tabela sobre FK
     composta, e nenhum gate local exercita o PostgREST;
   - `/relatorios/tags` entre 21h e 23h59 BRT, a janela onde o defeito de fuso
     aparecia: o gráfico tem de bater com os StatCards;
   - editar o contato pelo detalhe, inclusive a troca de `whatsapp_phone` e o
     aviso âmbar.
3. **~~Acertar o ledger de migrations~~ — feito em 31/08/2026.** Ver a seção
   "O ledger de migrations, reconciliado". O que sobrou dessa frente: trocar o
   replay de idempotência do `test:db`, que reaplica `0012`, `0021`, `0022`,
   `0023` e `0024` — a `0011` e a `0016` continuam de fora, e foi por isso que
   passaram batidas.
4. **A guarda que falta na `0016`** — em migration nova, já que migration
   aplicada é imutável. O cabeçalho dela declara "Idempotente: pode ser
   executada duas vezes sem efeito colateral", e isso é **falso**. Ou a guarda
   entra, ou o comentário muda; o comentário existe para alguém confiar nele.
5. **Fuso em UTC nas duas telas que sobraram** — `/relatorios/ultimo-lead:25,51`
   e `/dashboard:85-96`. Dívida pré-existente, mas agora elas **contradizem**
   `/relatorios`, que foi corrigido: mesmo rótulo "hoje", números diferentes.
6. **Frente de produto recomendada: integridade do fechamento da negociação.**
   As telas de referência estão esgotadas — as cinco imagens já viraram
   `/funis`, `/empresas/[id]`, `/relatorios` e `/relatorios/ultimo-lead`; o que
   sobra delas é cosmético. A frente sai do débito 3: `markWon`/`markLost`
   (`deal-detail.tsx:148-182`) escrevem no cliente sem `deal_stage_history`, sem
   `.select()` e sem filtro de organização — um `markWon` recusado pela RLS
   **mostra confete e não muda nada**. Consequência de produto: toda negociação
   que fecha perde a transição que explica o resultado, e a "retenção" de
   `/funis` é ocupação instantânea, não coorte. Proposta: RPC `close_deal`
   transacional, mais trigger de rede de segurança nos quatro caminhos de
   escrita; depois `/funis` troca `% retido` por `% que avançou` e tempo mediano
   na etapa. Sem rota nova, sem bundle novo.

Descartado com motivo: **UI multi-instância do WhatsApp**. As migrations
`0010/0011` nunca tiveram smoke em produção nem com uma instância; construir a
tela da segunda antes de provar a primeira é empilhar interface sobre terreno
não verificado. O incidente de 31/08 é a demonstração: a única instância que
existe passou quatro dias sem receber nada.

## Migração futura do Bubble e domínio

O Bubble permanece no domínio `crmjidmidia.com` e contém aproximadamente 300
empresas, além de dados relacionados ainda não inventariados. A decisão
operacional é manter esse domínio como endereço definitivo do CRM, mas **não
trocar o DNS antes de concluir e reconciliar a migração dos dados**.

O piloto deve usar `beta.crmjidmidia.com` ou `wavemov-crm.vercel.app`, mantendo
o Bubble como sistema oficial até o congelamento final. Senhas do Bubble não
são exportáveis, arquivos exigem migração própria e rollback depois de novas
escritas no CRM não se resume a restaurar o DNS.

O plano completo, os portões de aceite, o corte GoDaddy/Vercel/Supabase e o
rollback estão em `docs/MIGRACAO_BUBBLE_DOMINIO.md`. Esse runbook deve ser lido
antes de qualquer alteração de domínio, importação em produção ou comunicação
de migração aos clientes.

### Achados menores ainda abertos

Da auditoria de tags: mensagens específicas da `0019` descartadas por
`describeWriteError` (o admin não fica sabendo em quantos leads a tag está);
filtro de tag desativada some da URL sem aviso; `?tag=todas` fica preso na URL;
select de tag do Kanban sem `aria-label`; badge de tag inativa sem indicador
fora do modal.

Da edição de contato: trocar o `whatsapp_phone` **não reconcilia conversas**. O
webhook da UAZAPI casa por igualdade exata, então mensagens novas do número
antigo criam contato duplicado. O modal avisa; não resolve. Resolver é mudança
de dados — atualizar `whatsapp_conversations.phone` e decidir o que fazer com as
duplicatas que já existem.

## Validações operacionais ainda abertas

- **Ingestão n8n:** nunca houve smoke completo com credencial válida. Criar um
  lead real controlado, reenviar o mesmo `event_id` e confirmar
  `duplicate: true`; testar credencial da organização A com `external_id` da B
  (404 sem revelar a empresa) e formulário inativo (404).
- **WhatsApp migrations `0010/0011`:** confirmar em produção recebimento e
  resposta pela mesma instância, transferência de responsável, isolamento de
  `seller`/`agent` e visão consolidada de `org_admin`. **A ausência deste smoke
  já cobrou o preço**: o recebimento ficou parado quatro dias sem ninguém
  perceber, porque só o envio era exercitado. Ver "O WhatsApp parou de receber".
- **Informações do Lead:** registros anteriores à `0015` têm `metadata = {}` e
  não exibem o card. Validar com submissão nova; isso não é defeito de legado.

Esses testes escrevem na base real e precisam de autorização/coordenação do
cliente.

## Regras invioláveis

1. **Isolamento por organização:** toda query e escrita filtra
   `organization_id`, mesmo com RLS. Vazamento entre empresas é o defeito mais
   grave possível.
2. **`service_role` somente no servidor:** validar entrada, organização e papel;
   recusar ambiguidade em vez de escolher a primeira linha.
3. **Views com `security_invoker = on`:** sem isso a view pode ignorar o RLS do
   chamador.
4. **Migration aplicada é imutável:** `0001` a `0020` já rodaram em produção.
   Correção exige arquivo novo e `npm run test:db` — foi assim que a `0020`
   nasceu. O cliente aplica SQL remoto manualmente; não aplicar por CLI sem
   autorização explícita.
5. **Escrita sob RLS precisa provar que alterou uma linha:** use `.select()` e
   trate zero linhas como falha. Toda falha chega ao usuário em português, sem
   expor erro cru do PostgREST.
6. **Reutilize `components/ui/` e as abstrações existentes.** Server Component
   por padrão; dependência nova exige justificativa.
7. **`DESIGN_GUIDE.md` é contrato.** Validar loading, vazio, erro, permissão,
   teclado, acessibilidade e responsividade.

## Decisões de domínio que evitam regressões

### Papéis e acesso

- Papéis: `org_admin`, `seller`, `agent`, `viewer`.
- `viewer` não escreve. Administração de funis, tags, integrações e segredos é
  de `org_admin`/admin global.
- Desde a `0011`, `seller`/`agent` leem apenas leads sob sua responsabilidade e
  suas conversas/interações; `org_admin`, admin global e `viewer` leem toda a
  organização.

### Funis e negociações

- O funil padrão é `pipelines.is_default`; nunca use `pipelines[0]` ou “o mais
  antigo” como substituto.
- Ao trocar o funil de um lead, grave `pipeline_id` e `stage_id` juntos. A etapa
  deve pertencer ao mesmo funil e organização.
- `deals.stage_id` é obrigatório. Use `firstOpenStage()` e recuse funil sem
  etapa aberta.
- Exclusão de funil/etapa com vínculos deve ser bloqueada e explicada; nunca
  apagar leads em cascata.

### Ingestão e formulários

- `POST /api/ingest/leads` autentica por `x-webhook-secret`, credencial por
  organização guardada fora de tabelas legíveis pelo cliente.
- `form_external_id` é sensível a caixa. Funil e etapa vêm do formulário, nunca
  do payload.
- Idempotência é `(form_id, external_event_id)`.
- `findFormByExternalId` busca globalmente de propósito; a camada seguinte
  compara a organização e registra colisão sem revelá-la ao chamador.
- Toda rota nova em `app/api/` deve declarar sua política em `PUBLIC_PATHS`; o
  teste de caminhos públicos existe porque formulários já perderam leads por
  redirecionamento silencioso ao login.

### CLI do Supabase e o ledger de migrations

- O CLI está **linkado ao projeto de produção** (`qzdcxyhvvikmtupouzlm`). Um
  `supabase db push` vai direto ao banco do cliente, sem confirmação extra.
- **O ledger está em dia desde 31/08/2026** (`0001..0024`), e `db push
  --dry-run` responde `Remote database is up to date`. A armadilha de reaplicar
  `0009..0024` sobre um schema que já as tem foi desarmada.
- **Isso só continua verdade se cada aplicação manual registrar a linha** — e
  **já falhou uma vez**: a `0025` foi aplicada em 01/09 sem a linha do ledger, na
  PRIMEIRA migration depois da reconciliação. Foi corrigido no mesmo dia, mas a
  fragilidade é real: enquanto aplicar e registrar forem dois atos separados,
  vai voltar a acontecer. **Ideia para eliminar o passo humano:** colar o
  `insert` do ledger no rodapé de cada arquivo de migration, para que copiar o
  arquivo inteiro já registre. O fluxo permanece manual, então o passo final de
  toda migration é:

  ```sql
  insert into supabase_migrations.schema_migrations (version, name)
  values ('00NN', 'nome_do_arquivo_sem_o_prefixo')
  on conflict (version) do nothing;
  ```

- Confirme com `npx supabase migration list --linked` e
  `npx supabase db push --linked --dry-run` antes de qualquer operação de CLI
  contra produção. Os dois são somente leitura.

### WhatsApp/UAZAPI

- O segredo é por instância em `whatsapp_instances.webhook_secret`, nunca em
  variável global ou tabela exposta. Compare com `secretsMatch()`, não `===`.
- O webhook cruza segredo, referências da instância no payload e `?org=`;
  divergência é 403 e ambiguidade falha fechada.
- A conversa conserva `instance_id` para responder pelo mesmo número.
- A UI de configurações ainda gerencia somente a instância mais antiga da
  organização, embora o backend suporte múltiplas.

## Débitos que merecem prioridade

1. Não há CI; configurar `tsc`, build, testes unitários e de banco no push.
2. Cobertura da aplicação ainda é pequena; faltam rotas, server actions e UI.
3. `markWon`/`markLost` não grava `deal_stage_history`, prejudicando retenção.
4. Há updates legados de `deals` sem filtro explícito por organização em
   `kanban-board.tsx` e `deal-detail.tsx`; RLS protege, mas falta defesa em
   profundidade.
5. `Field` não associa sistemicamente `label` e controle (`htmlFor`/`id`).
6. A ingestão externa não tem rate limit; priorizar quando mais de um cliente
   estiver usando o fluxo.
7. A UI multi-instância do WhatsApp ainda não existe.
8. ~~O ledger remoto de migrations diverge do repositório.~~ **Resolvido em
   31/08/2026**: `0001..0024` registradas e `db push --dry-run` em dia. O CLI
   continua linkado à produção, o que é seguro enquanto o ledger for mantido —
   e deixa de ser no instante em que alguém aplicar uma migration à mão sem
   registrar a linha.
9. O replay de idempotência do `test:db` reaplica a `0012` e a `0021`; a `0011`
   e a `0016` continuam de fora, e foi por isso que passaram batidas.
10. Trocar o `whatsapp_phone` de um contato não reconcilia conversas: mensagens
    do número antigo criam contato duplicado no webhook.
11. ~~Nada avisa quando a ingestão para.~~ **Resolvido pela saúde da entrada de
    leads** (`feat/saude-da-entrada`), com um recorte diferente do que este
    débito propunha: o aviso não ficou só em Configurações, porque ali é onde se
    conserta e não onde se descobre. O banner vai para `/dashboard` e
    `/atendimento`. A contagem de 401 por organização foi **descartada como
    inimplementável**: o 401 acontece antes de a organização ser resolvida e o
    `?org=` de uma requisição não autenticada é controlado por quem chama.

Demais melhorias e histórico pertencem a `README.md`, `docs/CHANGELOG.md` e
`docs/FUNCIONALIDADES.md`, não a este handoff.

## Gates de entrega

```bash
git diff --check
npx tsc --noEmit
npm run build
npm run test:unit   # quando o escopo tocar código coberto
npm run test:db     # obrigatório para migration/RLS/regra de banco
```

Para alterações em `app/`, `components/`, `lib/` ou `supabase/`, aplicar ao
final o checklist de `.claude/agents/qa-engineer.md`. Nunca declarar um gate
como aprovado sem executá-lo.

## Referências rápidas

| Documento | Uso |
|---|---|
| `docs/ENGINEERING_STANDARDS.md` | arquitetura, processo e Definition of Done |
| `docs/FUNCIONALIDADES.md` | telas, APIs e regras funcionais completas |
| `docs/CHANGELOG.md` | histórico detalhado das entregas |
| `docs/RELEASE_HISTORY.md` | versões, commits, pushes e deploys |
| `docs/MIGRACAO_BUBBLE_DOMINIO.md` | migração do Bubble, piloto, corte de domínio e rollback |
| `DESIGN_GUIDE.md` | contrato visual |
| `README.md` | setup, estrutura e visão do produto |

`.env.local` contém segredos reais e nunca deve ser commitado. As telas de
referência ficam fora do repositório em
`C:\Users\user\Downloads\telas-do-crm`.
