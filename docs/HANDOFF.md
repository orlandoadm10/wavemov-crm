# Passagem de serviço — CRM JID Mídia

Leia este arquivo primeiro. As regras canônicas de trabalho estão em
`docs/ENGINEERING_STANDARDS.md`; consulte também `DESIGN_GUIDE.md` para UI,
`docs/FUNCIONALIDADES.md` para contratos funcionais e `docs/CHANGELOG.md` para
o histórico detalhado.

**Atualizado em:** 31/08/2026

**Versão:** `0.2.0`

**Repositório:** `https://github.com/orlandoadm10/wavemov-crm`

**Produção:** `https://wavemov-crm.vercel.app`
**Supabase:** `crmjidbr` (`qzdcxyhvvikmtupouzlm`)

## Estado ao encerrar o dia

| Item | Estado |
|---|---|
| `main` local | `ba546d6` — merge do PR #2, o Realtime do atendimento |
| `origin/main` | `ba546d6` |
| Produção | `ba546d6` — deploy `https://wavemov-pgjq7fv7i-...`, `Ready` em 31/08/2026 |
| Banco | migrations `0001` a `0022` aplicadas — a `0021` e a `0022` em 31/08/2026, pelo cliente. A `0022` conferida em `pg_indexes` |
| Diferença | `feat/saude-da-entrada` (PR #4) é o único código fora de `main`. A `0022` que ele usa **já está no banco** |
| WhatsApp | **Restaurado em 31/08.** URL nova colada no painel da UAZAPI; tráfego real dos dois lados confirmado no banco |
| Ramo em uso | `feat/saude-da-entrada`. `fix/isolamento-webhook-uazapi` é resíduo do PR #1 e pode ser apagado; `fix/realtime-atendimento` já foi |

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

## Próxima sessão

Em ordem de risco. O item 1 é o único que tem cliente esperando; o 2 conclui a
validação da publicação; o 3 é o que mais reduz risco de acidente; do 4 em
diante é dívida e produto.

1. **Publicar o PR #4** (`feat/saude-da-entrada`). O PR #2 já foi mergeado em
   `ba546d6` e está em produção; a `0022` que o #4 usa já está no banco, então o
   merge é direto. Nota de processo, aprendida na marra: o `--delete-branch` do
   PR #2 **fechou automaticamente** o PR empilhado sobre ele (o #3), que teve de
   ser reaberto como #4. Se voltar a empilhar branches, reaponte o PR de cima
   para `main` **antes** de mergear o de baixo. Publicado isso,
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
3. **Acertar o ledger de migrations e desarmar o `db push`.** O ledger remoto
   lista `0001..0008` e o CLI está linkado à produção. Um `db push` distraído
   para na `0011` (`policy already exists`) sem perder dado — mas quem destravar
   essa parede chega na `0016`, que **reinscreve na fila de distribuição todo
   membro que o administrador removeu**, em todas as organizações; a `0018`
   então renumera a fila e zera o cursor. Silencioso, sem erro e sem linha em
   `lead_distribution_log`. Caminho recomendado: `insert` das 12 linhas
   faltantes em `supabase_migrations.schema_migrations` pelo painel — mesma
   escrita do `migration repair`, sem trazer o CLI para perto da produção —
   mantendo o link. Depois disso, `db push --dry-run` responde que está em dia e
   a armadilha some. Acompanham: registrar o ledger a cada aplicação manual
   daqui em diante; corrigir `README.md`, que anuncia `supabase db push` como
   alternativa (é falso para este projeto); e trocar o replay de idempotência do
   `test:db`, que hoje só reaplica a `0012` e por isso não pegou nada disso.
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
- O ledger remoto parou na `0008` porque as migrations são aplicadas à mão pelo
  painel. Um `db push` tentaria reaplicar `0009`..`0020` sobre um schema que já
  as tem, e várias não são idempotentes.
- Enquanto o fluxo for manual, o link é uma armadilha carregada: desfazer
  (`supabase unlink`) ou sincronizar (`supabase migration repair`).

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
8. O ledger remoto de migrations diverge do repositório e o CLI está linkado à
   produção — ver o item 3 da próxima sessão. É o débito com maior potencial de
   estrago silencioso.
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
