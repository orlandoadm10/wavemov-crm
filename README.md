# Wavemov CRM

CRM web multiempresa, completo e pronto para produção — construído com **Next.js (App Router) + TypeScript + Tailwind CSS + Supabase**, com funil de vendas em Kanban, tarefas, formulários públicos de captura, dashboard de métricas reais e **atendimento WhatsApp integrado via UAZAPI**.

> A marca é facilmente trocável: o nome "Wavemov CRM" aparece apenas em `app/layout.tsx` (metadata), `components/layout/top-nav.tsx`, `app/(auth)/layout.tsx` e `app/f/[slug]/page.tsx`.

---

## Módulos

| Módulo | Descrição |
|---|---|
| **Autenticação** | Supabase Auth (e-mail/senha), onboarding com criação automática de empresa + funil padrão |
| **Multiempresa** | Isolamento total por organização via RLS; papéis: Admin global, Admin da empresa, Vendedor, Atendente, Visualizador |
| **Negociações** | Kanban com drag-and-drop, filtros, busca, valores por etapa, ganho/perda/arquivamento, UTMs, temperatura, status de IA |
| **Detalhe do lead** | Stepper de etapas, bloco negócio, tarefas, timeline de atividades, notas internas, conversas WhatsApp vinculadas |
| **Tarefas** | Prioridades, vencimento, vínculo com lead/contato, banner "próxima tarefa", filtros |
| **Contatos** | CRUD completo com vínculo a negociações |
| **Empresas** | Lista com leads/inatividade, perfil da empresa com indicadores, "logar nesta empresa" |
| **Pessoas** | Gestão da equipe, papéis/permissões, criação de usuários (service role) |
| **Dashboard** | Métricas reais: criadas/vendidas/perdidas, ticket médio, conversão, gráficos por mês, etapa, responsável, motivo e UTM |
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
| `UAZAPI_WEBHOOK_SECRET` | ✅ p/ WhatsApp | Segredo que valida o webhook de mensagens |

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
5. Defina `UAZAPI_WEBHOOK_SECRET` no `.env.local` com o mesmo segredo da URL.

Cada mensagem recebida: cria/atualiza o contato → cria a conversa → salva a
mensagem → cria lead automático na primeira etapa do funil → registra no
histórico do lead. O adaptador (`lib/services/uazapi.ts`) normaliza formatos
de payload de diferentes versões da UAZAPI.

---

## 5. Deploy na Vercel + GitHub

### GitHub
```bash
git init          # já vem inicializado se você clonou
git add -A
git commit -m "Wavemov CRM inicial"
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
  (auth)/         login, registro
  (dashboard)/    telas autenticadas (admin, tarefas, negociações, atendimento…)
  api/            rotas server-side (webhooks, uazapi, formulários, sessão)
  f/[slug]/       página pública de formulário
components/
  ui/             design system (Button, Modal, Badge, DataTable…)
  layout/         TopNav, PageHeader, navegação mobile
  crm/            Kanban, detalhe do lead, tarefas, dashboard…
  forms/          construtor de formulários
  whatsapp/       chat, lista de conversas, painel do contato, configurações
lib/
  supabase/       clients (browser, server, admin/service-role, middleware)
  services/       sessão, UAZAPI (adaptador), WhatsApp
  validations/    schemas Zod
  utils/          formatação, telefone, slug…
supabase/
  migrations/     SQL completo (schema, RLS, funções)
  seed/           seed de demonstração
types/            tipos de domínio
hooks/            hooks reutilizáveis
```

### Segurança
- **RLS em todas as tabelas** — isolamento por organização com funções
  `has_org_access` / `has_org_write` / `is_org_admin` (SECURITY DEFINER).
- `service_role` usada **apenas** em rotas de servidor (`lib/supabase/admin.ts`).
- Token UAZAPI inacessível ao cliente (REVOKE em nível de banco + API própria).
- Webhook validado por segredo; payloads sanitizados; inputs validados com Zod.

---

## 7. Próximos passos sugeridos

- Upload de logo/avatar via Supabase Storage (estrutura já aceita URLs)
- Editor visual de funis/etapas (tabelas e RLS já suportam CRUD)
- Campos personalizados na UI (tabelas `custom_fields` já criadas)
- Envio de mídia no atendimento (adaptador já prevê `media_url`)
- Notificações em tempo real (Supabase Realtime já usado no chat)
- Relatórios exportáveis (CSV/PDF) no dashboard
- Automações: distribuição automática de leads entre vendedores
