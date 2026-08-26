# Changelog — Wavemov CRM

Ordem cronológica inversa. Datas absolutas (AAAA-MM-DD).

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
