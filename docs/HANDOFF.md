# Passagem de serviço — Wavemov CRM

> **Leia este arquivo primeiro.** Ele é o ponto de entrada para qualquer
> desenvolvedor ou agente de IA (Claude, Codex, DeepSeek, Cursor…) que assumir o
> projeto. Depois dele: `README.md` (setup), `docs/FUNCIONALIDADES.md`
> (o que existe), `DESIGN_GUIDE.md` (contrato visual).

**Última atualização:** 2026-08-26
**Versão:** `0.2.0` (sem bump na rodada de correções)
**Repositório:** `https://github.com/orlandoadm10/wavemov-crm`
**Supabase:** projeto `crmjidbr` (`qzdcxyhvvikmtupouzlm`) — migrations
`0001`…`0011` **aplicadas** (confirmação do cliente em 2026-08-26)
**Deploy:** Vercel, produção em `https://wavemov-crm.vercel.app`

---

## 1. O que é o produto

CRM web **multiempresa** em Next.js 15 (App Router) + TypeScript + Tailwind v4 +
Supabase. Funil Kanban, tarefas, contatos, formulários públicos de captura,
dashboard, relatórios e atendimento WhatsApp via UAZAPI.

O cliente exige uma experiência de alto padrão. Densidade, velocidade e
consistência visual valem mais que recursos novos.

---

## 2. Estado atual (encerramento de 2026-08-26)

### Rodada de correções mais recente

Sem versão nova e sem migration. Detalhe completo em `docs/CHANGELOG.md`.

- **Vazamento entre organizações no webhook da UAZAPI** — o fallback de
  organização lia `whatsapp_instances` com `.limit(1)` sem filtrar por
  organização, então uma mensagem podia virar contato, conversa e lead dentro
  da empresa errada. Agora a organização é resolvida pelo token/`instance_id`
  do payload, `?org=` é validado como UUID, divergência entre os dois devolve
  403 e o fallback só vale com uma única instância na base. **É a correção mais
  importante desta rodada.**
- Negociação sumia dos dois Kanbans ao trocar de funil no modal (gravava
  `stage_id` do funil anterior).
- 11 pontos de escrita em 5 telas mostravam o erro cru do PostgREST em inglês.
- Formulário podia ficar sem campos após falha no insert (delete + insert).
- `/funis` não ressincronizava entre dois funis vazios.
- Dashboard ordenava funis por `name` enquanto o resto do projeto usa
  `created_at`.

Verificado nesta rodada:

```
npx tsc --noEmit    → limpo
npm run build       → 28 rotas, sem erro; /funis estável em 182 kB
```

Nada além disso foi executado — o projeto não tem suíte de testes (débito 1).

### Entregue na rodada de 2026-08-25/26

- `/funis` — editor de etapas do funil (fluxo com volume e retenção + CRUD)
- `/relatorios` — relatório de entrada de leads
- `/relatorios/ultimo-lead` — último lead recebido
- `/empresas/[id]` — reformulada em "Resumo da empresa"
- Migration `0009_reporting.sql` — 2 views agregadas + 3 índices
- Squad de agentes em `.claude/agents/` (não existia nenhum)
- 5 correções de bug e 3 de performance — detalhe em `docs/CHANGELOG.md`

### Verificado na rodada de 2026-08-25/26

```
npx tsc --noEmit    → limpo
npm run build       → 12/12 páginas, sem erro
views 0009 no banco → organization_deal_stats e pipeline_stage_stats,
                      ambas com security_invoker = on (confirmado por SQL)
```

### Não entregue de propósito

O modal **"Configurar Visualização do CRM"** (uma das telas de referência —
status inicial do Kanban + tema dos cards) ficou fora: é preferência cosmética e
exigiria uma tabela nova de preferências por usuário. Decisão do cliente se entra.

---

## 3. Como rodar

```bash
npm install
cp .env.example .env.local   # preencher com as chaves do Supabase
npm run dev                  # http://localhost:3000
```

`.env.local` **já existe na máquina do cliente e contém segredos reais** — nunca
commite. O `.gitignore` cobre `.env*` com exceção de `.env.example`.

Variáveis obrigatórias: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_APP_URL`.

`UAZAPI_WEBHOOK_SECRET` **não existe mais**. Desde a `0010` cada instância tem
o próprio segredo em `whatsapp_instances.webhook_secret` e a URL do webhook sai
pronta em `/atendimento/configuracoes` (visível só para `org_admin`). Nenhum
código lê a variável; se ela ainda estiver no ambiente, pode ser apagada.

---

## 4. Regras invioláveis

Quebrar qualquer uma destas é considerado defeito grave neste projeto.

1. **Isolamento por organização.** Toda query filtra por `organization_id`,
   mesmo com RLS ativo (defesa em profundidade + uso do índice). Vazar dados de
   uma empresa para outra é o pior defeito possível aqui.
2. **View nova nasce com `security_invoker = on`.** Sem isso a view roda com as
   permissões do dono e **ignora o RLS de quem consulta** — vazamento silencioso
   entre empresas. As duas views existentes seguem essa regra.
3. **`service_role` só no servidor.** `lib/supabase/admin.ts` aparece apenas em
   `app/api/**` e server actions, sempre com validação Zod da entrada. Nunca em
   componente cliente.
4. **Migration aplicada é imutável.** `0001`…`0009` já rodaram em produção.
   Correção vira migration nova, nunca edição de arquivo existente.
5. **Reutilize `components/ui/`** (Button, Input, Select, Field, Card,
   CardHeader, StatCard, Badge, DataTable, Modal, Dropdown, Avatar, Switch,
   Skeleton, EmptyState). Criar um segundo botão é erro de revisão.
6. **Sem dependência nova sem justificativa.** O app precisa ficar leve.
7. **`DESIGN_GUIDE.md` é contrato**, não sugestão.
8. **Server Component por padrão.** `"use client"` só com estado, evento,
   `useSearchParams` ou lib de browser.
9. **Documentação faz parte da entrega.** Código sem `docs/` atualizado está
   incompleto.

---

## 5. Armadilhas já pagas (não repita)

Cada item abaixo foi um bug real encontrado neste projeto.

| Armadilha | O que acontece | Como fazer certo |
|---|---|---|
| Filtro "Todos" com valor `""` | O parâmetro some da URL e o servidor reaplica o default — o usuário fica preso no filtro | Use um sentinela explícito (`"todas"`) e trate no servidor |
| `setState` dentro de `useMemo` | Re-render em cascata | Sincronizar props→estado com `useEffect` |
| Reverter update otimista pela metade | Card volta de etapa mas continua "ganho" | Guarde o objeto anterior inteiro e restaure-o |
| Falha de escrita sem mensagem | Usuário acha que salvou | Todo erro de escrita vira mensagem na tela |
| Reordenar gravando só os itens trocados | Quebra quando `order_index` tem buracos (0, 10, 20…) | Normalize para `0..n-1` e grave todos os alterados |
| `<Link><Button>` | `<button>` dentro de `<a>` — HTML inválido, ruim para teclado | `<Link className={buttonClasses({...})}>` |
| Contar em JavaScript | Traz milhares de linhas para virar um número | `count: "exact", head: true` ou view agregada |
| Somar `numeric` do Postgres | Vem como string; `+` concatena | `Number(valor)` antes de somar |
| Recharts sem guard de montagem | Erro de hidratação | Use o `useHasMounted` de `dashboard-charts.tsx` |
| Excluir etapa com negociações | `deals.stage_id` é `on delete restrict` — o banco recusa | Cheque o volume antes e explique ao usuário |
| Fallback de organização sem filtro em rota com `service_role` | `.limit(1)` numa tabela multiempresa pega a primeira linha de qualquer empresa e grava os dados na organização errada — RLS não protege | Resolva a organização a partir do payload, exija resultado único (`count === 1`) e recuse em vez de adivinhar |
| Guardar segredo em tabela que o cliente lê | `organizations` é legível por todo membro via RLS, vem de `select *` em `getSessionContext()` e viaja como prop até `top-nav.tsx` — uma coluna de segredo ali chega ao navegador de qualquer `viewer` | Segredo mora em tabela revogada de `anon`/`authenticated` (`whatsapp_instances`, ver `0005`) e é removido em `toPublicInstance()` |
| Comparar segredo com `===` | O compare sai no primeiro byte diferente: o tempo de resposta vira oráculo e o segredo é descoberto caractere a caractere | `secretsMatch()` — `crypto.timingSafeEqual` sobre o SHA-256 dos dois lados (comprimento igual, sem `throw`) |
| Calcular a URL secreta e "esconder" no cliente | Prop de Server Component vai no payload mesmo sem ser desenhada — o segredo está no HTML | Decida o papel **antes**: sem `org_admin`, a URL nem é montada (`webhookUrl: string \| null`) |
| Confiar só no `?org=` da URL do webhook | `UAZAPI_WEBHOOK_SECRET` é o mesmo segredo para todas as empresas; a URL sozinha não prova origem | Cruze com a instância do payload e devolva 403 quando divergirem |
| Mostrar `err.message` do PostgREST ao usuário | Texto em inglês com jargão de banco ("violates not-null constraint") e detalhe de schema na tela | `describeWriteError(err, "mensagem em pt-BR")` — usuário lê português, `console.error` recebe `code`/`details`/`hint` |
| Delete + insert sem transação | Se o insert falha, os campos já foram apagados: o formulário público continua ativo e vira um form vazio que gera lead sem dados | Diga na tela o que de fato ficou no banco e `router.refresh()` para não exibir o que não existe mais |
| Resetar campo obrigatório para `""` contando com fallback no submit | `stage_id` é `z.string().uuid()` no `dealSchema`: o `parse()` estoura antes, e `parsed.stage_id \|\| stages[0]?.id` é código morto | Ao trocar o funil, `setValue("stage_id", primeiraEtapaAberta)` — reposicione o valor, não o limpe |
| `position: fixed` dentro de ancestral com `transform` | O elemento fixo usa o ancestral como containing block: overlay e popup ficam relativos à página longa, não à viewport | O `Modal` compartilhado renderiza via portal em `document.body`; não crie overlays diretamente dentro de `.animate-fade-up` |

---

## 6. Mapa do código

```
app/(dashboard)/     telas autenticadas — cada page.tsx é Server Component e
                     faz a busca de dados; o client recebe props prontas
app/api/             rotas server-side (webhook UAZAPI, submit de formulário,
                     sessão, uazapi)
components/ui/       design system — reutilize antes de criar
components/crm/      Kanban, detalhe do lead, tarefas, dashboard, relatórios,
                     etapas do funil
components/whatsapp/ chat, lista de conversas, painel, configurações
lib/supabase/        client (browser), server, admin (service role), middleware
lib/services/        session, uazapi (adaptador), whatsapp
lib/utils/           formatação + period.ts (resolvePeriod / dailySeries)
lib/validations/     schemas Zod
supabase/migrations/ SQL — imutável depois de aplicado
types/index.ts       tipos de domínio + tipos das views agregadas
docs/                este arquivo, FUNCIONALIDADES, CHANGELOG, SQUAD
.claude/agents/      squad de agentes de desenvolvimento
```

### Detalhes que economizam tempo

- **Não existe `deals.form_id`.** A origem "veio deste formulário" é descoberta
  por `form_submissions.deal_id` → `form_id` → `forms.name`. Índice
  `form_submissions_deal_idx` existe para isso.
- **Período dos relatórios** vem da URL (`?periodo=hoje|7d|30d|mes`, padrão
  `7d`), resolvido por `resolvePeriod()` em `lib/utils/period.ts`.
  `dailySeries()` devolve a série diária sem buracos de data.
- **`getSessionContext()`** resolve a organização ativa nesta ordem: cookie
  `wavemov-active-org` → organização mais antiga onde o usuário é membro →
  primeira visível. Admin global enxerga todas.
- **Papéis:** `org_admin`, `seller`, `agent`, `viewer`. `viewer` é somente
  leitura; exclusões (exceto tarefas) exigem `org_admin`. Desde a `0011`,
  `seller`/`agent` leem somente leads sob sua responsabilidade e as respectivas
  conversas/interações; `org_admin`, admin global e `viewer` leem tudo da
  organização.
- **Views agregadas:** `organization_deal_stats` (por empresa) e
  `pipeline_stage_stats` (por etapa). Tipadas em `types/index.ts`.
- **Segredo do webhook é por instância** (`whatsapp_instances.webhook_secret`,
  migration `0010`). Ele autentica a requisição **e** identifica qual instância
  recebeu a mensagem — por isso a conversa consegue guardar `instance_id` e a
  resposta sai pelo mesmo número. Nunca chega ao navegador:
  `toPublicInstance()` remove o campo e a URL só é montada para `org_admin`.
  Comparação com `secretsMatch()` (`crypto.timingSafeEqual` sobre SHA-256),
  nunca `===`. Rotação em
  `app/(dashboard)/atendimento/configuracoes/actions.ts`, sempre com a
  organização vinda de `getSessionContext()`.
- **Webhook da UAZAPI** resolve a organização nesta ordem: instância
  identificada pelo token/`instance_id` do payload (`extractInstanceRefs()` em
  `lib/services/uazapi.ts`, aceita só com `count === 1`, porque
  `whatsapp_instances` não tem índice único nessas colunas) → `?org=` da URL, que
  precisa ser UUID e bater com a instância (divergência = 403) → única instância
  cadastrada, se houver exatamente uma. Sem resolução: 400 com `console.error`,
  nunca "a primeira linha da tabela".
- **Erro de escrita no cliente** passa por `describeWriteError(err, mensagem)`
  em `lib/utils/index.ts`: pt-BR na tela, objeto completo no `console.error`.
  Não devolva `err.message` do PostgREST para o usuário.

---

## 7. Squad de agentes

Definidos em `.claude/agents/` e descritos em `docs/SQUAD.md`.

| Agente | Quando acionar |
|---|---|
| `qa-engineer` | **Sempre**, ao final de qualquer alteração |
| `crm-frontend` | Telas, componentes, design |
| `crm-backend` | Migrations, RLS, queries, API |
| `crm-product` | Antes de construir tela nova |
| `crm-perf` | Tela lenta, query pesada, bundle |
| `crm-docs` | Ao final de toda entrega |

Fluxo: `crm-product → crm-backend → crm-frontend → crm-perf → qa-engineer → crm-docs`.

> **Se você é um agente que não lê `.claude/agents/`** (Codex, DeepSeek, Cursor…):
> os arquivos são markdown comum. Abra `.claude/agents/qa-engineer.md` e use o
> checklist dele como roteiro de revisão manual — ele vale independentemente da
> ferramenta.

---

## 8. Como validar antes de entregar

```bash
npx tsc --noEmit      # obrigatório: zero erros
npm run build         # obrigatório: falha de build é bloqueador
```

Depois, o checklist de `.claude/agents/qa-engineer.md`: isolamento por
organização, estado do React, contratos de dados, performance, experiência
(loading/vazio/erro), acessibilidade, responsividade e aderência ao Design Guide.

Não declare "passou" sem a saída real dos comandos.

**Não existe suíte de testes automatizados no projeto** — a qualidade hoje é
garantida por tipos, build e revisão. Ver débitos 1 e 6.

---

## 9. Próximos passos sugeridos (em ordem)

1. **Smoke test de produção das migrations `0010/0011`.** Receber e responder
   pela mesma instância; transferir responsável; confirmar isolamento de
   `seller`/`agent` e visão consolidada de `org_admin`.
2. **Interface multi-instância.** A configuração ainda gerencia somente a
   instância mais antiga; listar instâncias, status e URL/segredo individual.
3. **Frente A — criação de funis por `org_admin`.** Próxima migration é a
   `0012`: `pipelines.is_default`, índice único parcial, backfill, RLS e fluxo
   de criação que também funcione quando a organização ainda não tem funil.
4. **Frente B — ingestão externa de leads.** Endpoint genérico chamado pelo
   n8n, com segredo por organização, `forms.external_id` globalmente único,
   origem, idempotência por evento e mapeamento explícito de funil/etapa.
   Decisões fechadas: id do formulário é colado manualmente; funil novo não
   vira padrão; formulário ausente ou inativo responde 404; a resposta não
   inclui `deal_url`; erro de id duplicado nunca revela a empresa proprietária.
5. **Testes de integração de RLS + CI.** Cobrir dois usuários/organizações e
   papéis distintos; rodar `tsc` e build em todo push.
6. **Decidir o modal "Configurar Visualização do CRM"** (5ª tela de referência).
   Precisa de uma tabela de preferências por usuário; confirmar com o cliente se
   vale o peso antes de construir.
7. **Arrastar para reordenar em `/funis`.** Hoje é por setas ↑/↓. `@dnd-kit` já
   é dependência do projeto (usado no Kanban), então é custo baixo.
8. **Paginação em `/relatorios`.** Hoje mostra os 100 leads mais recentes do
   período e avisa quando trunca.
9. **Campos personalizados na UI.** As tabelas `custom_fields` e
   `custom_field_values` existem desde a `0001` e nunca ganharam interface.
10. **Upload de logo/avatar via Supabase Storage.** O schema já aceita URLs.
11. **Exportação CSV** dos relatórios.

---

## 10. Débitos técnicos conhecidos

1. **Sem testes automatizados.** Nenhum runner configurado. O maior risco é
   regressão de RLS: um teste de integração que tenta ler dados de outra
   organização com um usuário comum pagaria por si.
2. **Peso do stack de formulários.** `/contatos` (207 kB) e `/perfil` (204 kB)
   carregam `react-hook-form` + `zod` + `@hookform/resolvers` em telas com um
   formulário simples. Trocar por `useActionState` nas telas mais leves
   reduziria o First Load. Não mexi porque é refatoração ampla, não bug.
3. **Todas as páginas são `force-dynamic`.** Correto para dados por sessão, mas
   algumas listagens poderiam usar revalidação.
4. **`/relatorios` busca até 5.000 `created_at`** para montar o gráfico diário.
   Payload pequeno, mas em contas grandes vira candidato a uma view agregada por
   dia.
5. **`dailySeries()` usa `setDate` para iterar.** Sem risco no Brasil (sem
   horário de verão), mas frágil se o produto for internacionalizado.
6. **Sem CI.** Nenhum workflow roda `tsc`/`build` no push. Um GitHub Action de
   ~15 linhas evitaria que um commit quebrado chegue à Vercel.
7. ~~`UAZAPI_WEBHOOK_SECRET` é um segredo global.~~ **Resolvido pela `0010`**
   (segredo por instância, guarda de `org_admin` na tela, comparação
   timing-safe, rotação por empresa). Corte limpo: o valor global não é mais
   aceito. Migration e deploy foram concluídos; a URL nova deve permanecer
   configurada no painel da UAZAPI — passo a passo no `docs/CHANGELOG.md`.
8. ~~`unique (organization_id, phone)` misturava instâncias.~~ **Resolvido pela
   `0011`**: a unicidade passou a `(organization_id, instance_id, phone)`.
   Cada número mantém sua conversa; todas podem apontar para o mesmo `deal_id`,
   dando ao gerente/admin a visão consolidada de todas as interações do lead.
9. **A tela de configurações gerencia uma instância só.** `getInstanceForOrg()`
   devolve a mais antiga da empresa; salvar credenciais sempre atualiza essa
   linha. Para o multi-instância virar realidade de UI, a tela precisa listar
   instâncias, com uma URL de webhook por instância. Nada disso bloqueia o
   backend: a coluna, a rota e a rotação já são por instância.
10. **O fallback "instância única na base" no webhook virou letra morta.**
   `app/api/webhooks/uazapi/route.ts` ainda resolve a organização por
   `extractInstanceRefs()` e por `count === 1` na tabela inteira. Com o segredo
   por instância, `tokenOrganizationId` já é a resposta — e com a segunda
   instância cadastrada aquele `count === 1` nunca mais é verdade. Falha
   fechado, então não é perigoso; é código morto esperando remoção. Não foi
   removido nesta entrega porque o bloco acabou de ser auditado.

---

## 11. Contexto que não está no repositório

- **Telas de referência:** `C:\Users\user\Downloads\telas-do-crm` (5 imagens,
  fora do versionamento). São **modelos visuais de base**, não especificação de
  pixel — o visual segue `DESIGN_GUIDE.md`; delas se extrai a *funcionalidade*.
- **Marca trocável:** o nome "Wavemov CRM" aparece só em `app/layout.tsx`,
  `components/layout/top-nav.tsx`, `app/(auth)/layout.tsx` e
  `app/f/[slug]/page.tsx`.
- **Webhook UAZAPI** precisa apontar para a URL de produção após cada mudança de
  domínio.

---

## 12. Resumo de 30 segundos

> CRM multiempresa Next.js + Supabase, v0.2.0, buildando, migrations até a
> `0009` aplicadas em produção. A entrega de 2026-08-25/26 trouxe as telas de
> Etapas do funil, Relatório de entrada de leads, Último lead e Resumo da
> empresa. Em seguida veio uma rodada de correções, sem versão nova: a principal
> tapou um **vazamento entre organizações no webhook da UAZAPI**, onde o
> fallback pegava a primeira instância da tabela inteira. Regra número um:
> **nada pode vazar dados entre organizações** — filtre por `organization_id`,
> toda view nova nasce com `security_invoker = on` e rota com `service_role`
> recusa em vez de adivinhar a organização. Antes de entregar:
> `npx tsc --noEmit` e `npm run build`, sempre. Pendências no topo da fila:
> validar em produção o webhook/isolamento da `0010/0011`, implementar a UI
> multi-instância e então seguir as frentes de criação de funis e ingestão
> externa de leads.
