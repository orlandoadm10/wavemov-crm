# CRM JID Mídia

CRM web multiempresa, completo e pronto para produção — construído com **Next.js (App Router) + TypeScript + Tailwind CSS + Supabase**, com funil de vendas em Kanban, tarefas, formulários públicos de captura, dashboard de métricas reais e **atendimento WhatsApp integrado via UAZAPI**.

> **Marca e repositório são coisas diferentes.** O produto é o **CRM JID
> Mídia** — a JID Mídia é quem fornece o CRM às empresas clientes. "Wavemov" é
> o desenvolvimento, e sobrevive apenas em nomes internos: o repositório
> `wavemov-crm`, o `name` do `package.json` e o projeto na Vercel.
>
> O favicon sai do mesmo `public/jid.png`, declarado em `app/layout.tsx`.
>
> A marca visível está concentrada em: `components/ui/brand-logo.tsx` e
> `public/jid.png` (logo), `app/layout.tsx` (metadata), `app/page.tsx` e
> `components/landing/content.ts` (landing), `app/(auth)/layout.tsx` e
> `app/f/[slug]/page.tsx`. O nome exibido dentro do app autenticado é o da
> **organização do cliente**, não o da JID.

---

## Módulos

| Módulo | Descrição |
|---|---|
| **Autenticação** | Supabase Auth (e-mail/senha), onboarding com criação automática de empresa + funil padrão |
| **Multiempresa** | Isolamento total por organização via RLS; papéis: Admin global, Admin da empresa, Vendedor, Atendente, Visualizador |
| **Negociações** | Kanban com drag-and-drop, tags, filtros, busca, valores por etapa, ganho/perda/arquivamento, UTMs, temperatura, status de IA |
| **Detalhe do lead** | Tags, stepper de etapas, bloco negócio, tarefas, timeline de atividades, notas internas, conversas WhatsApp vinculadas |
| **Tarefas** | Prioridades, vencimento, vínculo com lead/contato, banner "próxima tarefa", filtros |
| **Contatos** | CRUD completo com vínculo a negociações |
| **Empresas** | Lista com leads/inatividade, resumo da empresa (KPIs, saúde da conta, evolução de leads), "logar nesta empresa" |
| **Pessoas** | Gestão da equipe, papéis/permissões, criação de usuários (service role) |
| **Dashboard** | Métricas reais: criadas/vendidas/perdidas, ticket médio, conversão, gráficos por mês, etapa, responsável, motivo e UTM |
| **Etapas do funil** | Editor visual das etapas: fluxo com volume e retenção, renomear, reordenar, marcar Ganho/Perdido, excluir |
| **Relatórios** | Entrada de leads, último lead, rendimento por vendedor e métricas de tags |
| **Formulários** | Construtor de campos, página pública `/f/[slug]`, cada envio cria contato + negociação no funil |
| **Atendimento** | Tela WhatsApp em 3 colunas (conversas/chat/painel do lead), respostas rápidas, notas internas, realtime, criação de lead pela conversa |
| **Admin** | Visão global de usuários/organizações (apenas admin global) |

---

## 1. Rodando localmente

### Pré-requisitos
- Node.js 20+
- Uma conta no [Supabase](https://supabase.com) (plano free funciona)

### Passo a passo

```bash
# 1. Instale as dependências
npm install

# 2. Configure as variáveis de ambiente
cp .env.example .env.local
# preencha com os valores do seu projeto Supabase (passo 2 abaixo)

# 3. Rode o projeto
npm run dev
# abra http://localhost:3000
```

---

## 2. Configurando o Supabase

### 2.1 Crie o projeto
1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Anote a **URL** e as chaves em *Project Settings → API*:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` *(somente servidor — nunca exponha)*

### 2.2 Aplique as migrations
No **SQL Editor** do Supabase, execute os arquivos na ordem:

1. `supabase/migrations/0001_schema.sql` — tabelas principais, triggers, índices
2. `supabase/migrations/0002_forms_whatsapp.sql` — formulários e WhatsApp
3. `supabase/migrations/0003_rls.sql` — Row Level Security completa
4. `supabase/migrations/0004_functions.sql` — provisionamento e onboarding
5. `supabase/migrations/0005_security.sql` — endurecimento (tokens fora do alcance do cliente)
6. `supabase/migrations/0006_api_grants.sql` — grants da API
7. `supabase/migrations/0007_reload_postgrest_schema.sql` — recarrega o cache de schema
8. `supabase/migrations/0008_expose_public_schema.sql` — exposição do schema `public`
9. `supabase/migrations/0009_reporting.sql` — views agregadas e índices de relatório
10. `supabase/migrations/0010_webhook_secret_por_instancia.sql` — segredo do webhook por instância
11. `supabase/migrations/0011_visibilidade_leads_conversas.sql` — leads e conversas por responsável
12. `supabase/migrations/0012_funis_padrao_e_administracao.sql` — funil padrão e administração segura
13. `supabase/migrations/0013_coerencia_funil_etapa_do_lead.sql` — coerência entre funil e etapa
14. `supabase/migrations/0014_ingestao_externa_de_leads.sql` — ingestão externa pelo n8n
15. `supabase/migrations/0015_metadata_do_lead_e_external_id_com_maiuscula.sql` — respostas do lead
16. `supabase/migrations/0016_distribuicao_automatica_de_leads.sql` — distribuição automática
17. `supabase/migrations/0017_fila_ordenada_e_plantao.sql` — fila e plantão
18. `supabase/migrations/0018_auditoria_da_distribuicao.sql` — auditoria e reparo da fila
19. `supabase/migrations/0019_tags_de_negociacao.sql` — catálogo, vínculos e métricas de tags
20. `supabase/migrations/0020_set_deal_tags_preserva_tag_inativa.sql` — salvar tags preserva o vínculo de tag desativada

> A `0009` é obrigatória para `/funis`, `/empresas` e `/empresas/[id]`: elas leem
> as views `organization_deal_stats` e `pipeline_stage_stats`. É aditiva — cria
> duas views e três índices, sem tocar em dados.

> A `0020` é **obrigatória** para a tela de tags. Sem ela, a interface tenta
> preservar o vínculo de uma tag desativada reenviando-o, a guarda
> `BEFORE INSERT` da `0019` recusa, e **nenhuma edição de tags funciona** em
> leads que tenham tag inativa. Aplique-a ANTES de publicar o código — em
> produção isso foi feito em 28/08/2026.

> Alternativa com CLI: `supabase db push` (com o projeto linkado via `supabase link`).

### 2.3 Primeiro acesso + seeds demo
1. Rode o app e acesse `/register` — crie sua conta e empresa. O funil padrão
   (Lead Novo → … → Ganho/Perdido) é criado automaticamente.
2. Para virar **admin global** e popular dados demo, edite o e-mail em
   `supabase/seed/seed.sql` e execute-o no SQL Editor.

### 2.4 Desative a confirmação de e-mail (opcional, para dev)
*Authentication → Providers → Email → Confirm email: OFF* — ou mantenha ON;
com a `SUPABASE_SERVICE_ROLE_KEY` configurada o cadastro já confirma o e-mail
automaticamente.

---

## 3. Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Chave pública (RLS protege os dados) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Chave admin — usada só no servidor (webhooks, formulários públicos, criação de usuários) |
| `NEXT_PUBLIC_APP_URL` | ✅ | URL pública do app (links de formulário e webhook) |
| `UAZAPI_BASE_URL` | opcional | URL base da sua instância UAZAPI |
| `UAZAPI_TOKEN` | opcional | Token da UAZAPI (fallback — pode ser salvo pela UI) |

> A UAZAPI identifica a instância só pelo **token** — não existe um "Instance
> ID" para você configurar em lugar nenhum. Se a API retornar um id da
> instância (informativo), o app salva automaticamente ao testar a conexão.

**Nunca commite `.env.local`** — o `.gitignore` já bloqueia.

---

## 4. Integração WhatsApp (UAZAPI)

1. Acesse **Atendimento → Conexão e configurações**.
2. Preencha URL base e Token → **Salvar**.
3. **Testar conexão** / **Gerar QR Code** → escaneie com o WhatsApp.
4. Copie a **URL do webhook** exibida na tela e configure na UAZAPI
   (webhook de mensagens recebidas).

Cada mensagem recebida: cria/atualiza o contato → cria a conversa → salva a
mensagem → cria lead automático na primeira etapa do funil → registra no
histórico do lead. O adaptador (`lib/services/uazapi.ts`) normaliza formatos
de payload de diferentes versões da UAZAPI.

> **Qual organização e instância recebem a mensagem.** Cada instância tem seu
> próprio segredo, criado pela migration `0010`. O segredo autentica a chamada,
> identifica a instância e precisa conferir com o `?org=` da URL. A migration
> `0011` mantém uma conversa separada por instância/número e telefone do lead.

---

## 5. Deploy na Vercel + GitHub

### GitHub
```bash
git init          # já vem inicializado se você clonou
git add -A
git commit -m "CRM JID Midia inicial"
gh repo create wavemov-crm --private --source=. --push
# ou crie o repositório manualmente no GitHub e:
# git remote add origin https://github.com/SEU-USUARIO/wavemov-crm.git
# git push -u origin main
```

### Vercel
1. [vercel.com/new](https://vercel.com/new) → importe o repositório.
2. Framework: **Next.js** (detectado automaticamente).
3. Adicione as variáveis de ambiente da tabela acima
   (use a URL do deploy em `NEXT_PUBLIC_APP_URL`, ex.: `https://seu-crm.vercel.app`).
4. Deploy. Depois atualize o webhook da UAZAPI para a URL de produção.

---

## 6. Arquitetura

```
app/
  page.tsx        landing page pública (deslogado)
  (auth)/         login, registro
  (dashboard)/    telas autenticadas (admin, tarefas, negociações, funis,
                  relatórios, atendimento…)
  api/            rotas server-side (webhooks, uazapi, formulários, sessão)
  f/[slug]/       página pública de formulário
components/
  ui/             design system (Button, Modal, Badge, DataTable…)
  layout/         TopNav, PageHeader, navegação mobile
  crm/            Kanban, detalhe do lead, tarefas, dashboard…
  landing/        seções da landing page pública
  forms/          construtor de formulários
  whatsapp/       chat, lista de conversas, painel do contato, configurações
lib/
  supabase/       clients (browser, server, admin/service-role, middleware)
  services/       sessão, UAZAPI (adaptador), WhatsApp
  validations/    schemas Zod
  utils/          formatação, telefone, slug…
supabase/
  migrations/     SQL completo (schema, RLS, funções, views de relatório)
  seed/           seed de demonstração
types/            tipos de domínio
hooks/            hooks reutilizáveis
docs/             inventário de funcionalidades, changelog e squad
.claude/agents/   agentes de desenvolvimento (QA, frontend, backend, produto…)
```

### Documentação

| Arquivo | Conteúdo |
|---|---|
| `docs/HANDOFF.md` | **Comece por aqui** — passagem de serviço: estado, regras, armadilhas e próximos passos |
| `docs/ENGINEERING_STANDARDS.md` | Contrato obrigatório de arquitetura, processo, validação e Definition of Done |
| `docs/FUNCIONALIDADES.md` | Inventário de telas, rotas, dados e regras de negócio |
| `docs/CHANGELOG.md` | Histórico de entregas |
| `docs/MIGRACAO_BUBBLE_DOMINIO.md` | Runbook de migração do Bubble, piloto, corte de domínio e rollback |
| `docs/RELEASE_HISTORY.md` | Versões, commits, pushes e deploys em um único relatório |
| `docs/SQUAD.md` | Agentes de desenvolvimento e quando acionar cada um |
| `DESIGN_GUIDE.md` | Contrato visual (cores, espaçamentos, componentes) |

### Segurança
- **RLS em todas as tabelas** — isolamento por organização com funções
  `has_org_access` / `has_org_write` / `is_org_admin` (SECURITY DEFINER).
- `seller` e `agent` leem somente leads sob sua responsabilidade e as conversas,
  mensagens, tarefas e interações desses leads; `org_admin`, admin global e
  `viewer` têm visão completa, sendo `viewer` somente leitura.
- `service_role` usada **apenas** em rotas de servidor (`lib/supabase/admin.ts`).
- Token UAZAPI inacessível ao cliente (REVOKE em nível de banco + API própria).
- Webhook validado por segredo; payloads sanitizados; inputs validados com Zod.
- Organização do webhook resolvida pela instância do payload, com recusa
  explícita (400/403) quando é ambígua ou divergente — nunca "a primeira
  instância da tabela".
- Erros de escrita chegam ao usuário por `describeWriteError()`
  (`lib/utils/index.ts`): mensagem em português na tela, detalhe do Postgres só
  no log do servidor.

---

## 7. Próximos passos sugeridos

- Upload de logo/avatar via Supabase Storage (estrutura já aceita URLs)
- Campos personalizados na UI (tabelas `custom_fields` já criadas)
- Arrastar para reordenar as etapas em `/funis` (hoje é por setas ↑/↓)
- Paginação no relatório de entrada de leads (hoje mostra os 100 mais recentes)
- Envio de mídia no atendimento (adaptador já prevê `media_url`)
- Notificações em tempo real (Supabase Realtime já usado no chat)
- Relatórios exportáveis (CSV/PDF) no dashboard
- Automações: distribuição automática de leads entre vendedores
