# Passagem de serviço — Wavemov CRM

> **Leia este arquivo primeiro.** Ele é o ponto de entrada para qualquer
> desenvolvedor ou agente de IA (Claude, Codex, DeepSeek, Cursor…) que assumir o
> projeto. Depois dele: `README.md` (setup), `docs/FUNCIONALIDADES.md`
> (o que existe), `DESIGN_GUIDE.md` (contrato visual).

**Última atualização:** 2026-08-26
**Versão:** `0.2.0` (sem bump na rodada de correções) · `main` no commit `b7a4e86`
**Repositório:** `https://github.com/orlandoadm10/wavemov-crm`
**Supabase:** projeto `crmjidbr` (`qzdcxyhvvikmtupouzlm`) — migrations `0001`…`0009` **aplicadas**
**Deploy:** Vercel, a partir de `main`

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
`NEXT_PUBLIC_APP_URL`. Para WhatsApp: `UAZAPI_WEBHOOK_SECRET`.

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
   Correção vira `0010_*.sql`, nunca edição de arquivo existente.
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
| Confiar só no `?org=` da URL do webhook | `UAZAPI_WEBHOOK_SECRET` é o mesmo segredo para todas as empresas; a URL sozinha não prova origem | Cruze com a instância do payload e devolva 403 quando divergirem |
| Mostrar `err.message` do PostgREST ao usuário | Texto em inglês com jargão de banco ("violates not-null constraint") e detalhe de schema na tela | `describeWriteError(err, "mensagem em pt-BR")` — usuário lê português, `console.error` recebe `code`/`details`/`hint` |
| Delete + insert sem transação | Se o insert falha, os campos já foram apagados: o formulário público continua ativo e vira um form vazio que gera lead sem dados | Diga na tela o que de fato ficou no banco e `router.refresh()` para não exibir o que não existe mais |
| Resetar campo obrigatório para `""` contando com fallback no submit | `stage_id` é `z.string().uuid()` no `dealSchema`: o `parse()` estoura antes, e `parsed.stage_id \|\| stages[0]?.id` é código morto | Ao trocar o funil, `setValue("stage_id", primeiraEtapaAberta)` — reposicione o valor, não o limpe |

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
  leitura; exclusões (exceto tarefas) exigem `org_admin`.
- **Views agregadas:** `organization_deal_stats` (por empresa) e
  `pipeline_stage_stats` (por etapa). Tipadas em `types/index.ts`.
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

1. **Segredo do webhook por organização.** Hoje `UAZAPI_WEBHOOK_SECRET` é único
   para toda a base — ver débito 7. É o que sobrou da correção de vazamento
   desta rodada e o único item da lista com impacto de segurança.
2. **Decidir o modal "Configurar Visualização do CRM"** (5ª tela de referência).
   Precisa de uma tabela de preferências por usuário; confirmar com o cliente se
   vale o peso antes de construir.
3. **Arrastar para reordenar em `/funis`.** Hoje é por setas ↑/↓. `@dnd-kit` já
   é dependência do projeto (usado no Kanban), então é custo baixo.
4. **Paginação em `/relatorios`.** Hoje mostra os 100 leads mais recentes do
   período e avisa quando trunca.
5. **Campos personalizados na UI.** As tabelas `custom_fields` e
   `custom_field_values` existem desde a `0001` e nunca ganharam interface.
6. **Upload de logo/avatar via Supabase Storage.** O schema já aceita URLs.
7. **Exportação CSV** dos relatórios.

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
7. **`UAZAPI_WEBHOOK_SECRET` é um segredo global.** É o mesmo valor para todas
   as empresas da base e aparece montado na URL do webhook em
   `/atendimento/configuracoes` (`app/(dashboard)/atendimento/configuracoes/page.tsx`),
   sem guarda de papel — qualquer membro que abra a tela lê o segredo que vale
   para o CRM inteiro. A rota do webhook já não confia só na URL (valida o
   `?org=` contra a instância do payload e devolve 403 na divergência), mas isso
   contém o dano, não resolve a causa. A correção completa é um token por
   organização: coluna de segredo em `whatsapp_instances`, comparação por
   instância e restrição da tela a `org_admin`. Exige migration e rotação do
   segredo atual.

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
> segredo de webhook por organização (débito 7) e a decisão do cliente sobre o
> modal de configuração de visualização do Kanban.
