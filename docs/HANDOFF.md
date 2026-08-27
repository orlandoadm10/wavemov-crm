# Passagem de serviço — Wavemov CRM

> **Leia este arquivo primeiro.** Ele é o ponto de entrada para qualquer
> desenvolvedor ou agente de IA (Claude, Codex, DeepSeek, Cursor…) que assumir o
> projeto. Antes de alterar código, leia também
> `docs/ENGINEERING_STANDARDS.md` (arquitetura, processo e Definition of Done).
> Depois: `README.md` (setup), `docs/FUNCIONALIDADES.md` (o que existe) e
> `DESIGN_GUIDE.md` (contrato visual).

**Última atualização:** 2026-08-26
**Versão:** `0.2.0` (sem bump)
**Estado do repositório:** rodada de funil padrão e movimentação no atendimento
validada e entregue em 2026-08-26.
**Repositório:** `https://github.com/orlandoadm10/wavemov-crm`
**Supabase:** projeto `crmjidbr` (`qzdcxyhvvikmtupouzlm`) — migrations
`0001`…`0012` **aplicadas** (confirmação do cliente em 2026-08-26).
A `0013` também está **aplicada** (confirmação do cliente em 2026-08-26).
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

As migrations `0012` e `0013` estão aplicadas em produção e o código da rodada
foi publicado, fechando a defasagem temporária entre as policies do banco e os
controles exibidos pela interface.

Verificado antes da publicação:

```
npx tsc --noEmit    → limpo
npm run build       → 28 rotas, sem erro
npm run test:db     → 59 asserções, todas passando
```

### Rodada atual — histórico operacional separado das conversas

- `/negociacoes/[id]` abre em **Atividades**, sem previews de WhatsApp. A query
  exclui `whatsapp_inbound`/`whatsapp_outbound` antes do limite de 50.
- A guia **Conversas** carrega mensagens somente quando acionada, em páginas de
  50, e suporta as várias conversas que um mesmo lead pode ter desde a `0011`.
- A visualização é somente leitura: abrir o histórico não zera `unread_count`
  nem cria um segundo composer. Para responder, usa **Abrir no Atendimento**.
- `components/whatsapp/message-thread.tsx` é a apresentação compartilhada das
  bolhas; não duplique esse padrão no detalhe ou em outra tela.
- Os registros WhatsApp existentes em `activity_logs` foram preservados para
  auditoria. Interromper essa gravação ou remover dados é decisão separada.

### Rodada mais recente — funil padrão (`0012`) e funil/etapa no atendimento

Detalhe completo em `docs/CHANGELOG.md`. Resumo do que mudou de contrato:

- **Migration `0012` aplicada em produção.** `pipelines.is_default` existe e é
  garantido por índice único parcial e triggers; `deals.pipeline_id` e
  `forms.pipeline_id` são `on delete restrict`; a estrutura de funis e etapas
  passou a exigir `org_admin`. Quatro RPCs novas: `create_pipeline`,
  `set_default_pipeline`, `delete_pipeline`, `pipeline_delete_blockers`.
- **O vendedor troca funil e etapa do lead dentro do atendimento**
  (`components/whatsapp/deal-stage-picker.tsx`). Só etapas abertas; ganhar e
  perder continuam em `/negociacoes/[id]`.
- **`/funis` administra funis**: criar (RPC `create_pipeline`), renomear,
  `Tornar padrão` (RPC `set_default_pipeline`) e excluir (RPC
  `delete_pipeline`, com `pipeline_delete_blockers` explicando o bloqueio antes
  da tentativa). O estado vazio passou a conter a ação de criação. Com isso a
  **Frente A está concluída**.
- **`viewer` perdeu acessos que o banco já recusava** e ganhou 403 na rota de
  envio de mensagem, que antes só checava sessão e organização.

> **Banco atualizado: `supabase/migrations/0013_coerencia_funil_etapa_do_lead.sql`.**
> Escrita, validada em Postgres descartável e **aplicada em produção**. Fecha a última
> brecha do QA: nada no banco exige que `deals.stage_id` pertença a
> `deals.pipeline_id`, nem que o funil seja da organização da negociação — hoje
> a invariante depende só do JavaScript. A migration recusa a própria aplicação
> se encontrar linhas incoerentes, para não instalar a guarda sobre dado sujo.
> A guarda está ativa no banco; nenhum fluxo adicional no cliente é necessário.

### Como validar migration antes de entregar o SQL ao cliente

```bash
npm run test:db     # supabase/tests/migrations.mjs
```

Aplica `supabase/migrations/*.sql` do zero, na ordem, num Postgres descartável
(**PGlite** — Postgres real em WASM, sem Docker, sem tocar em banco de verdade)
e roda **59 asserções** de comportamento por cima: isolamento entre
organizações, papéis, invariantes do funil padrão, recusas de exclusão,
coerência funil/etapa e idempotência. O ambiente Supabase é imitado com o
mínimo — schema `auth`, `auth.uid()` lendo um GUC e os papéis
`anon`/`authenticated`/`service_role`/`authenticator`.

Existe porque **o cliente executa o SQL manualmente no painel do Supabase**:
migration entregue sem teste é migration testada em produção. É também a única
coisa parecida com suíte automatizada que o projeto tem hoje (débito 1) — o
caminho barato para pagar o resto desse débito é acrescentar asserções aqui.

**Ao criar uma migration, rode isto antes de mandar o SQL para o cliente e
acrescente asserções para as invariantes novas.** Um teste que só confirma que
o SQL compila não paga o que custa.

### Rodada de correções anterior

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
- Popups abriam abaixo da viewport quando estavam dentro de ancestrais
  animados com `transform`. O `Modal` compartilhado passou a usar portal em
  `document.body`; a correção vale para todos os consumidores do componente.

Esta rodada está mesclada em `main` no commit `ff757ea` (PR #1) e foi publicada
em `https://wavemov-crm.vercel.app`.

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
9. **Documentação faz parte da entrega.** Mudança de comportamento, contrato,
   schema, permissão, operação, arquitetura ou dívida exige `docs/` atualizado;
   quando não se aplicar, declare isso no fechamento.
10. **`docs/ENGINEERING_STANDARDS.md` é o contrato de engenharia.** Antes de
    editar, informar arquivos e impacto; durante, preservar fronteiras e
    coesão; depois, executar os gates aplicáveis e declarar riscos.

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
| `update` sem `.select()` em tabela com RLS | Quando a linha não passa pelo `USING` da policy, o PostgREST devolve **204 e zero linhas, sem erro**. O código comemora, a tela diz "salvo" e a trilha registra um movimento que não houve | `.update(...).eq(...).select("id")` e tratar `data.length === 0` como falha — foi assim que a movimentação de etapa no atendimento parou de mentir |
| Gravar depois do desmonte do componente | `setError` vira no-op: a escrita falha e ninguém é avisado. É a falha silenciosa disfarçada de debounce | Se o componente pode desmontar com escrita pendente, o erro sobe para um estado do pai que sobrevive à troca de tela (`onDetachedError` em `deal-stage-picker.tsx`) |
| `id=in.(…)` com centenas de UUIDs | ~300 UUIDs passam de 11 KB de linha de requisição e o proxy responde 414; se o `error` for descartado, a lista volta vazia e o bug que a consulta corrigia ressuscita calado | Fatiar em lotes de ~100 com `Promise.all` e **logar o `error`** |
| Rota de API que só valida sessão e organização | `service_role` ignora RLS: sem checar o papel, `viewer` (somente leitura) manda mensagem em nome da empresa pelo endpoint, mesmo sem o botão na tela | Checar `session.membership.role` na rota, não só no componente |
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
supabase/tests/      verificação das migrations em Postgres descartável
                     (`npm run test:db`)
types/index.ts       tipos de domínio + tipos das views agregadas
docs/                este arquivo, ENGINEERING_STANDARDS, FUNCIONALIDADES,
                     CHANGELOG e SQUAD
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
- **Funil padrão** é `pipelines.is_default` (0012). Quem precisa de "o funil
  desta empresa sem escolha explícita" usa `is_default`, nunca
  `.order("created_at").limit(1)` nem `pipelines[0]`. Quem decide o padrão é o
  banco: o primeiro funil da organização nasce padrão, um adicional nunca vira,
  e trocar exige a RPC `set_default_pipeline` — um `update` direto em
  `is_default` é recusado por trigger.
- **Administração de funil é só de `org_admin`** (policies da 0012). Criar,
  excluir e consultar bloqueios de exclusão passam pelas RPCs `create_pipeline`,
  `delete_pipeline` e `pipeline_delete_blockers`; renomear é `update` normal.
  Mover lead entre etapas continua sendo trabalho de `seller`/`agent`.
- **`firstOpenStage(stages)`** em `lib/utils/index.ts` devolve a primeira etapa
  que não é de ganho nem de perda. É o destino ao trocar um lead de funil e ao
  criar lead sem etapa explícita. Devolve `null` quando o funil só tem etapas de
  fechamento — recuse antes de gravar, porque `deals.stage_id` é obrigatório.
- **Trocar lead de funil grava `pipeline_id` e `stage_id` no mesmo `update`.**
  Gravar só o funil deixa o lead numa etapa que não pertence a ele, e ele some
  dos dois Kanbans. Foi bug real (`ff757ea`).
- **`Modal` aceita `data-autofocus`** no conteúdo para o foco pousar num campo.
  `autoFocus` do React não funciona ali: o `Modal` reivindica o foco do painel
  no quadro seguinte e o rouba de volta.

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

O papel do squad é ser uma **segunda leitura adversarial**, não cerimônia. Nas
duas últimas rodadas ele pagou por si: o parecer de produto cortou ganhar/perder
de dentro do chat (a perda exige motivo, e o Kanban já prova que quando a UI não
pede ninguém preenche) e o QA achou um `update` sob RLS que anunciava sucesso
com zero linhas afetadas. Se você trabalha sozinho, **releia o próprio diff
procurando estas três coisas**, que foram exatamente as que escaparam na
primeira passada:

1. Escrita que pode ser recusada e ninguém confere o resultado.
2. Estado local que sobrevive à troca de contexto (conversa, funil, lead).
3. Botão visível para quem o banco vai recusar.

---

## 8. Como validar antes de entregar

```bash
npx tsc --noEmit      # obrigatório: zero erros
npm run build         # obrigatório: falha de build é bloqueador
npm run test:db       # obrigatório se mexeu em supabase/migrations/
```

Depois, o checklist de `.claude/agents/qa-engineer.md`: isolamento por
organização, estado do React, contratos de dados, performance, experiência
(loading/vazio/erro), acessibilidade, responsividade e aderência ao Design Guide.

Não declare "passou" sem a saída real dos comandos.

**Não existe teste do código da aplicação** — só do banco (`npm run test:db`).
A qualidade do front hoje é garantida por tipos, build e revisão. Ver débitos
1 e 6.

---

## 9. Próximos passos sugeridos (em ordem)

1. **Smoke test de produção das migrations `0010/0011`.** Receber e responder
   pela mesma instância; transferir responsável; confirmar isolamento de
   `seller`/`agent` e visão consolidada de `org_admin`.
2. ~~**Frente A — criação e administração segura de funis.**~~ **CONCLUÍDA.**
   Migration `0012` aplicada; funil padrão respeitado pelo webhook e pela
   criação de lead no atendimento; `/funis` cria, renomeia, torna padrão e
   exclui, com os impedimentos explicados antes da tentativa. As quatro RPCs
   da `0012` têm chamador. Os oito critérios de aceite da seção 9.1 estão
   cobertos. O que sobrou de propósito, e continua valendo como próximo passo:
   arrastar para reordenar etapas (item 7) e a decisão sobre o modal
   "Configurar Visualização do CRM" (item 6).
3. **Frente B — ingestão externa de leads.** Endpoint genérico chamado pelo
   n8n, com segredo por organização, `forms.external_id` globalmente único,
   origem, idempotência por evento e mapeamento explícito de funil/etapa.
   Uma organização pode ter vários formulários; cada formulário corresponde a
   um webhook/fluxo próprio no n8n. O gestor do n8n cria esse fluxo, adapta o
   payload da origem ao contrato canônico do CRM e informa o `external_id` do
   formulário. A idempotência deve ser por formulário + evento, pois fluxos
   diferentes podem reutilizar o mesmo identificador na origem.
   Decisões fechadas: id do formulário é colado manualmente; funil novo não
   vira padrão; formulário ausente ou inativo responde 404; a resposta não
   inclui `deal_url`; erro de id duplicado nunca revela a empresa proprietária.
4. **Interface multi-instância.** A configuração ainda gerencia somente a
   instância mais antiga; listar instâncias, status e URL/segredo individual.
   Antecipar este item apenas se houver necessidade operacional imediata de
   conectar um segundo número.
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

### 9.1 Frente A — especificação para criação de funis

**Parecer de produto e engenharia:** aprovada como próxima frente, com uma
condição bloqueadora: não disponibilizar apenas um modal de criação/exclusão
sobre o schema atual. Hoje `deals.pipeline_id` usa `on delete cascade`; apagar
um funil pode apagar em cascata todos os leads/negociações vinculados. Além
disso, vários fluxos tratam o primeiro funil por `created_at` como padrão sem
que exista uma marca explícita no banco.

#### Migration `0012` — obrigatória antes da UI

Criar um arquivo novo em `supabase/migrations/`; migrations aplicadas nunca são
editadas. A migration deve:

1. Adicionar `pipelines.is_default boolean not null default false`.
2. Fazer backfill de exatamente um padrão por organização que já tenha funis
   (usar deterministicamente o mais antigo).
3. Criar índice único parcial por organização onde `is_default = true`.
4. Trocar a FK de `deals.pipeline_id` de `on delete cascade` para
   **`on delete restrict`**. Exclusão de funil jamais pode apagar leads.
5. Trocar a FK de `forms.pipeline_id` de `on delete set null` para
   **`on delete restrict`**. Funil usado por formulário não pode ser apagado
   silenciosamente.
6. Garantir nas policies/RPCs que somente `org_admin` (e admin global) cria,
   renomeia, torna padrão, exclui ou altera a estrutura de funis/etapas.
   `seller`/`agent` usa o funil e movimenta seus próprios leads, mas não muda
   sua estrutura; `viewer` continua somente leitura.
7. Impedir a exclusão do último funil da organização. O funil padrão só pode
   ser excluído depois que outro for explicitamente definido como padrão.

O cliente executa SQL manualmente no Supabase. Portanto, o Claude deve criar e
revisar o arquivo `0012`, entregar ao cliente o caminho e o SQL completo (ou
instruções inequívocas para copiá-lo), e **parar antes de depender do novo
schema**. Só continuar a implementação/marcar a migration como aplicada depois
que o cliente confirmar que rodou o SQL. Não usar o CLI para aplicar migration
remotamente sem autorização expressa.

#### Semântica de funil padrão

- Um funil adicional novo **não** vira padrão automaticamente.
- Exceção necessária: se a organização não tiver nenhum funil, o primeiro
  criado vira o padrão.
- O administrador terá uma ação explícita `Tornar padrão`, com confirmação.
- Webhook UAZAPI e criação manual de lead pelo WhatsApp devem usar
  `is_default = true`, nunca `.order("created_at").limit(1)`.
- Páginas e modais que hoje usam `pipelines[0]` também precisam respeitar o
  padrão quando não houver escolha explícita do usuário.
- Formulários continuam usando o `pipeline_id` explicitamente configurado; a
  troca do padrão não deve remapear formulários existentes.

Auditar pelo menos estes pontos: `app/api/webhooks/uazapi/route.ts`,
`components/whatsapp/whatsapp-client.tsx`, `components/crm/deal-modal.tsx`,
`components/forms/forms-client.tsx`, `/funis`, `/negociacoes` e `/dashboard`.

#### Criação e interface

- Criar funil e etapas mínimas numa única transação/RPC ou server action. Não
  deixar funil vazio: `deals.stage_id` é obrigatório.
- Sugestão inicial: `Lead Novo` (aberta), `Ganho` e `Perdido`. O produto pode
  oferecer `Começar com etapas padrão`, ligado por padrão, desde que nunca
  produza um funil inutilizável.
- Modal com nome e descrição; botão somente para `org_admin`/admin global.
- O estado vazio de `/funis` precisa conter a ação de criação. Hoje
  `pipeline-stages-client.tsx` retorna `EmptyState` antes de renderizar o
  `PageHeader`, então um botão apenas no cabeçalho fica inacessível quando não
  existe nenhum funil.
- Mostrar badge de padrão e ações `Renomear`, `Tornar padrão` e `Excluir`.
- Ao excluir, explicar vínculos que bloqueiam a operação, sem exibir erro cru
  do PostgREST.
- Sem limite técnico de funis nesta etapa; mostrar aviso de organização acima
  de aproximadamente 10, se necessário.
- Todos os popups devem usar o `Modal` compartilhado, que já renderiza via
  portal em `document.body`; não recriar overlay local.

#### Critérios mínimos de aceite

1. `seller`/`agent` não consegue criar, excluir, renomear, tornar padrão nem
   editar etapas, inclusive tentando chamar o Supabase diretamente.
2. `org_admin` consegue criar o primeiro funil e um funil adicional.
3. Há no máximo um funil padrão por organização e nenhuma operação afeta outra
   organização.
4. Tentativa de excluir funil com deals ou formulários falha sem apagar nem
   desassociar dados.
5. Webhook UAZAPI e criação pelo WhatsApp colocam novos leads no funil padrão.
6. Formulários continuam enviando leads ao funil explicitamente configurado.
7. Estado vazio, carregamento, falha, teclado, mobile e modal em página rolada
   foram validados.
8. `npx tsc --noEmit` e `npm run build` passam antes de qualquer deploy.

---

## 10. Débitos técnicos conhecidos

1. **Sem teste do código da aplicação.** O banco tem `npm run test:db` (59
   asserções sobre as migrations, incluindo leitura e escrita cruzada entre
   organizações). O que falta é o outro lado: nenhum teste cobre componente,
   rota de API ou server action. O caminho barato é continuar acrescentando
   asserções em `supabase/tests/migrations.mjs` para o que é regra de banco, e
   escolher um runner para o resto.
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
6. **Sem CI.** Nenhum workflow roda `tsc`/`build`/`test:db` no push. Um GitHub
   Action de ~15 linhas evitaria que um commit quebrado chegue à Vercel — e
   agora existe o que rodar nele.
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
11. **`Field` não associa o rótulo ao controle.** `components/ui/input.tsx`
   renderiza `<Label>` como irmão do input, sem `htmlFor` e sem envolvê-lo:
   para leitor de tela o campo fica anônimo. A correção sistêmica é `useId()` +
   `htmlFor` no `Field`, mas ela toca todos os formulários do app, então as
   telas recentes contornam com `aria-label` no controle. Vale fazer de uma vez.
12. **Ganhar/perder no detalhe do lead não grava `deal_stage_history`.**
   `markWon`/`markLost` em `components/crm/deal-detail.tsx` mudam `stage_id` e
   `status` mas não abrem linha de histórico, ao contrário de toda outra
   movimentação. O relatório de retenção por etapa perde o fechamento.
13. **Alguns updates de `deals` não filtram por organização.**
   `kanban-board.tsx` e `deal-detail.tsx` fazem `.update(...).eq("id", …)` sem
   `.eq("organization_id", …)`. O RLS segura, mas a regra nº 1 pede defesa em
   profundidade e uso do índice. O código novo desta rodada já filtra.
14. **Alvo de toque das setas de reordenar etapa.** `p-0.5` com ícone de
   14 px em `pipeline-stages-client.tsx` fica bem abaixo dos 32 px do
   checklist. Some se o item 7 da seção 9 (arrastar para reordenar) for feito.

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
> `0013` aplicadas em produção. As telas de Etapas do funil, Relatório de
> entrada de leads, Último lead e Resumo da empresa vieram em 2026-08-25/26.
> Depois, uma rodada de correções tapou um **vazamento entre organizações no
> webhook da UAZAPI**. A rodada mais recente trouxe a `0012` (funil padrão
> explícito, exclusão de funil que não apaga leads, estrutura de funil restrita
> a `org_admin`) e a **troca de funil e etapa do lead dentro do atendimento**.
> Regra número um: **nada pode vazar dados entre organizações** — filtre por
> `organization_id`, toda view nova nasce com `security_invoker = on`, rota com
> `service_role` recusa em vez de adivinhar a organização **e checa o papel**, e
> `update` sob RLS só é sucesso se devolver linha (`.select()`). Antes de
> entregar: `npx tsc --noEmit` e `npm run build` sempre, mais `npm run test:db`
> se tiver mexido em migration. Pendências no topo da
> fila: validar em produção o webhook/isolamento
> da `0010/0011`. A Frente A está concluída; a próxima entrega funcional
> recomendada é a Frente B (ingestão externa de leads via n8n), especificada no
> item 3 da seção 9.
