# Roadmap "super CRM" — o que ainda aproveitar do DeskcommCRM

**Levantado em:** 23/09/2026, comparando as rotas e o catálogo de navegação do
`DeskcommCRM/` (`lib/navigation/catalogo.ts`, `app/app/**`) com o inventário de
`docs/FUNCIONALIDADES.md`.

O DeskcommCRM usa WAHA, Upstash, Vercel AI Gateway e shadcn; o wavemov-crm usa
UAZAPI/Meta, Supabase puro e o `DESIGN_GUIDE` próprio. **Nada disso se copia
arquivo por arquivo**: o que se aproveita é o desenho do fluxo, as regras de
negócio e as armadilhas que os comentários de lá documentam.

## Já portado

| Peça do DeskcommCRM | No wavemov-crm |
|---|---|
| Menu lateral agrupado, recolhível, gaveta no celular | `components/layout/app-shell.tsx`, `sidebar.tsx`, `nav-links.ts` (23/09) |
| Onboarding em passos com funil por segmento | `/onboarding/*`, migration `0030` (23/09) |
| Agentes de IA + base de conhecimento (RAG) | `/ia` (0026) |
| Handoff IA ↔ humano | `/atendimento` (0027) |
| Automações QUANDO/SE/ENTÃO + follow-up | `/automacoes` (0028) |
| API v1 com token + servidor MCP | `/integracoes` (0029) |
| Distribuição automática de leads | `/distribuicao` (0016–0018) |
| Tags | `/tags` (0019) |

## Falta — prioridade 1 (essencial para vender como CRM completo)

| Funcionalidade | Por que é essencial | Esforço | Observação |
|---|---|---|---|
| **Detalhe do contato (Customer 360)** — `/contatos/[id]` com timeline, negociações e conversas | Hoje não existe rota de contato; tudo passa pela negociação | M | Já apontado no HANDOFF como aberto |
| **Mesclar contatos + importar CSV** | A importação do Bubble (~300 empresas) vai gerar quase-duplicatas | M | Fazer antes da migração do Bubble; a `0024` já recusa WhatsApp duplicado |
| **Campos personalizados** | `custom_fields`/`custom_field_values` existem desde a 0001 e não têm tela | P | Só UI + validação; schema pronto |
| **Agenda / agendamentos** | Clínica, imobiliária e educação vivem de visita/avaliação | G | Lá tem sincronização Google; começar sem ela |
| **Respostas rápidas com tela própria** | Hoje só são lidas no chat; não há onde criar ou editar | P | Tabela `quick_replies` já existe e é semeada na criação da empresa |
| **Central de notificações (sino)** | O v2 dos indicadores já foi aprovado pelo cliente (e-mail por falta de toque) | M | Desenho da tabela `notifications` está no CHANGELOG de 31/08 |
| **Radar — quem esfriou** | Complementa a Carteira: lead aberto sem toque há X dias | P | Reaproveitar a RPC da `0025` |

## Prioridade 2 (diferenciais)

| Funcionalidade | Esforço | Observação |
|---|---|---|
| **Campanhas / disparo em lista** com ritmo anti-bloqueio | G | Exige throttle + janela de horário; na Meta, só template aprovado |
| **Sincronizar templates da Meta** | M | Hoje a ação envia template por nome, sem lista aprovada |
| **Mídia no Storage** (imagem/áudio do WhatsApp) | M | Débito conhecido: Meta chega como "[image]" |
| **Uso e orçamento da IA** + rate limit por conversa/token | M | Débito aberto no HANDOFF: sem teto de consumo |
| **Webhooks de saída** (avisar outros sistemas) | P | Ação "webhook" já existe na automação; falta cadastro por evento |
| **Desempenho por atendente** (tempo de 1ª resposta, SLA) | M | `/relatorios/vendedores` cobre conversão, não tempo de resposta |
| **Busca global ⌘K** | P | Catálogo do menu já é a fonte (`nav-links.ts`) |
| **Audit log** das ações sensíveis | M | `activity_logs` é por lead; falta trilha administrativa |
| **Marca por empresa** (cor e logo no app) | P | O logo já entra pelo onboarding; falta a cor |

## Prioridade 3 (nicho / quando houver cliente pedindo)

Produtos e catálogo, comandas e faturamento, financeiro, prospecção ativa,
chamadas de voz por IA (SIP), Nuvemshop, Meta Ads e conversões (CAPI), LGPD
self-service (exportar/anonimizar), MFA, i18n, tema escuro, extensões.

## Descartado por ora

- **Roteadores de IA, memória, skills, propostas de auto-melhoria (flywheel)**:
  dependem de volume de conversas que o CRM ainda não tem; o próprio
  DeskcommCRM registra o flywheel como não provado em produção.
- **Kit de auto-hospedagem (HostGator, Asterisk, Docker)**: o wavemov-crm é
  SaaS na Vercel + Supabase.

## Ordem sugerida

1. Publicar o menu lateral e o onboarding (aplicar a `0030` antes do deploy
   não é obrigatório — ver HANDOFF).
2. Contato 360 → campos personalizados → mesclar/importar (destrava o Bubble).
3. Notificações v2 + Radar.
4. Agenda.
5. Campanhas + templates da Meta + mídia.
