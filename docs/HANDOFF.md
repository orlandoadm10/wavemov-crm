# Passagem de serviço — Wavemov CRM

Leia este arquivo primeiro. As regras canônicas de trabalho estão em
`docs/ENGINEERING_STANDARDS.md`; consulte também `DESIGN_GUIDE.md` para UI,
`docs/FUNCIONALIDADES.md` para contratos funcionais e `docs/CHANGELOG.md` para
o histórico detalhado.

**Atualizado em:** 27/08/2026

**Versão:** `0.2.0`

**Repositório:** `https://github.com/orlandoadm10/wavemov-crm`

**Produção:** `https://wavemov-crm.vercel.app`
**Supabase:** `crmjidbr` (`qzdcxyhvvikmtupouzlm`)

## Estado ao encerrar o dia

| Item | Estado |
|---|---|
| `main` local | `08a539f` — interface e relatórios de tags |
| `origin/main` | `7172fbb` — migration `0019` de tags |
| Produção | `7172fbb`, deploy `dpl_DJpPbqN9VCqMxQtkhrAmwKEbxf4T` (`Ready`) |
| Banco | migrations `0001` a `0020` aplicadas (a `0020` em 28/08/2026, pelo cliente) |
| Diferença | tags + correções de QA estão 2 commits à frente do GitHub e da produção |
| Documentação local | commitada junto com as correções de QA |

Push em `main` dispara deploy de produção automaticamente pela Vercel. Não há
tag Git para a versão `0.2.0`.

## Entrega local pendente de publicação

O commit `08a539f` conclui os consumidores da migration `0019`:

- `/tags`: catálogo para `org_admin`/admin global, inclusive criação no vazio;
- seletor de tags no detalhe do lead e no atendimento;
- até três badges e contador no Kanban, mais filtro por tag;
- `/relatorios/tags`: quantidade/status/valor, evolução e distribuição por
  responsável.

Contratos que precisam permanecer:

- `viewer` é somente leitura;
- `seller`/`agent` só aplica tags nos leads que já pode acessar;
- tag inativa continua em vínculos e relatórios históricos, mas não pode ser
  aplicada novamente;
- catálogo é administrativo;
- a associativa de tags usa chaves compostas para impedir vínculo entre
  organizações, inclusive quando `service_role` ignora RLS.

## Próxima sessão

1. Revisar e commitar as correções da auditoria de QA (dois Altos, dois Médios
   e a migration `0020`) junto com os documentos locais (`HANDOFF`, `README` e
   `RELEASE_HISTORY`).
2. ~~Aplicar a `0020` no Supabase de produção.~~ **Feito em 28/08/2026.**
3. Antes do push, atualizar `docs/RELEASE_HISTORY.md` com o novo commit
   documental para o relatório não nascer defasado.
4. Fazer `git push origin main`; aguardar o deploy automático e confirmar que o
   alias de produção aponta para o novo commit.
5. Executar smoke test autenticado de `/tags`, seletor no detalhe e atendimento,
   filtro/badges do Kanban e `/relatorios/tags`. Incluir o caso que motivou a
   `0020`: aplicar uma tag, desativá-la no catálogo e então editar as tags do
   mesmo lead — precisa salvar e preservar o vínculo antigo.
6. Verificar `/negociacoes?tag=<id>` contra o banco real: a consulta monta dois
   embeds da mesma tabela sobre FK composta, e nenhum gate local exercita o
   PostgREST.
7. Registrar o commit e o deploy reais em `docs/RELEASE_HISTORY.md` e manter
   este resumo verdadeiro.

**A `0020` já foi aplicada em produção** (28/08/2026), então o caminho está
livre para o push. A ordem importava: a interface nova depende da função nova, e
publicar o código antes da migration deixaria produção pior do que estava — em
qualquer lead com tag inativa, salvar tags passaria a falhar com mensagem
genérica, sem saída pela tela.

O ledger `supabase_migrations.schema_migrations` do projeto de produção lista
apenas `0001` a `0008`: aplicar SQL pelo painel não o alimenta. Ele NÃO é fonte
de verdade sobre o que rodou. Para conferir uma função específica, inspecione
`pg_get_functiondef` em vez de confiar no ledger.

## Validações operacionais ainda abertas

- **Ingestão n8n:** nunca houve smoke completo com credencial válida. Criar um
  lead real controlado, reenviar o mesmo `event_id` e confirmar
  `duplicate: true`; testar credencial da organização A com `external_id` da B
  (404 sem revelar a empresa) e formulário inativo (404).
- **WhatsApp migrations `0010/0011`:** confirmar em produção recebimento e
  resposta pela mesma instância, transferência de responsável, isolamento de
  `seller`/`agent` e visão consolidada de `org_admin`.
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
4. **Migration aplicada é imutável:** `0001` a `0019` já rodaram em produção.
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
| `DESIGN_GUIDE.md` | contrato visual |
| `README.md` | setup, estrutura e visão do produto |

`.env.local` contém segredos reais e nunca deve ser commitado. As telas de
referência ficam fora do repositório em
`C:\Users\user\Downloads\telas-do-crm`.
